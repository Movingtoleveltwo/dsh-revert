import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ShadowGit } from './snapshot.js';
import { ExternalFileTracker } from './external-tracker.js';

export const name = 'dsh-revert';
export const inject = ['webServer', 'sessions'];

export function apply(ctx) {
  const logger = ctx.logger ? ctx.logger(name) : console;
  const shadowGit = new ShadowGit();
  const externalTracker = new ExternalFileTracker();
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const storePath = join(dshHome, 'dsh-revert', 'snapshots.json');
  mkdirSync(join(dshHome, 'dsh-revert'), { recursive: true });

  function loadSnapshotIndex() {
    try {
      if (existsSync(storePath)) {
        return JSON.parse(readFileSync(storePath, 'utf8'));
      }
    } catch {}
    return {};
  }

  function saveSnapshotIndex(data) {
    try {
      writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      logger.error('Failed to save snapshot index:', err.message);
    }
  }

  // 新会话创建时，立即拍一张"初始状态"快照作为最终回滚基准
  ctx.on('session/created', (session) => {
    const sessionId = session.id;
    const cwd = session.header.cwd;
    if (cwd) {
      const snap = shadowGit.takeSnapshot(cwd, `Initial state of ${sessionId}`);
      if (snap) {
        const index = loadSnapshotIndex();
        index[sessionId] = index[sessionId] || {};
        index[sessionId][-1] = { ...snap, cwd };
        saveSnapshotIndex(index);
      }
    }
  });

  ctx.on('session/event', async (session, event) => {
    // 拦截工具调用，将被操作的外部文件加入观察列表
    if (event.type === 'tool/call') {
      try {
        const args = typeof event.data.arguments === 'string'
          ? JSON.parse(event.data.arguments || '{}')
          : (event.data.arguments || {});
          
        const targetFile = args.TargetFile || args.FilePath || args.AbsolutePath || args.file_path || args.path;
        if (targetFile) {
          externalTracker.trackFile(session.id, targetFile);
        }

        // 兼容 run_command：提取可能的绝对路径
        const cmd = args.command || args.CommandLine;
        if (cmd) {
          const paths = cmd.match(/(?:\s|^|['"])(\/[^\s'"]+)/g);
          if (paths) {
            paths.forEach(p => {
               const cleanPath = p.replace(/^[\s'"]+/, '');
               if (cleanPath.startsWith('/')) {
                 externalTracker.trackFile(session.id, cleanPath);
               }
            });
          }
        }
      } catch (err) {
        logger.error(`[ExternalTracker] error parsing tool/call for ${session.id}:`, err.message);
      }
    }

    // 每轮结束后，等文件写入落盘再拍快照
    if (event.type === 'turn/end') {
      try {
        await new Promise(r => setTimeout(r, 1000));
        const sessionId = session.id;
        const turn = event.data.turn;
        const cwd = session.header.cwd;
        if (cwd) {
          const snap = shadowGit.takeSnapshot(cwd, `Turn ${turn} in ${sessionId}`);
          if (snap) {
            const index = loadSnapshotIndex();
            index[sessionId] = index[sessionId] || {};
            index[sessionId][turn] = { ...snap, cwd };
            saveSnapshotIndex(index);
          }
        }
        externalTracker.takeSnapshot(sessionId, turn);
      } catch (err) {
        logger.error(`[dsh-revert] error processing turn/end for ${session.id}:`, err.message);
      }
    }
  });

  ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-revert',
    handler: async (req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/dsh-revert/rpc')) {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body || '{}');
            const { action, payload } = data;

            if (action === 'getStatus') {
              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify({ ok: true, version: '0.1.0', name: 'dsh-revert', features: ['shadow-git', 'external-tracker'] }));
            }

            if (action === 'rollback' || action === 'revert') {
              const { sessionId, atSeq, restoreFiles, cwd, targetTurn } = payload ?? {};
              let restored = false;

              if (restoreFiles && targetTurn !== undefined && targetTurn !== null) {
                const turnToRestore = targetTurn === 0 ? -1 : targetTurn;

                if (cwd) {
                  const index = loadSnapshotIndex();
                  const sessionSnaps = index[sessionId] || {};
                  let snap = null;
                  for (let t = turnToRestore; t >= -1; t--) {
                    if (sessionSnaps[t]) { snap = sessionSnaps[t]; break; }
                  }
                  if (snap?.commitHash) {
                    restored = shadowGit.restoreSnapshot(cwd, snap.commitHash);
                  }
                }
                externalTracker.restoreSnapshot(sessionId, turnToRestore);
                logger.info(`[dsh-revert] successfully restored session ${sessionId} to turn ${turnToRestore}`);
              }

              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify({ ok: true, restored, targetTurn }));
            } else if (action === 'fork_session') {
              const { oldSessionId, newSessionId } = payload ?? {};
              
              externalTracker.forkSession(oldSessionId, newSessionId);
              
              if (oldSessionId && newSessionId) {
                const index = loadSnapshotIndex();
                if (index[oldSessionId]) {
                  index[newSessionId] = JSON.parse(JSON.stringify(index[oldSessionId]));
                  saveSnapshotIndex(index);
                  logger.info(`[shadowGit] forked index from ${oldSessionId} to ${newSessionId}`);
                }
              }

              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify({ ok: true }));
            }

            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Unknown action' }));
          } catch (err) {
            res.writeHead(500, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
        return;
      }

      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
    },
  });

  logger.info('[dsh-revert] 对话回滚、工作区快照与外部文件恢复服务已就绪');
}

export { ShadowGit, ExternalFileTracker };
