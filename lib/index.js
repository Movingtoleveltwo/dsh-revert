import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ShadowGit } from './snapshot.js';
import { ExternalFileTracker } from './external-tracker.js';

export const name = 'dsh-revert';
export const inject = ['webServer', 'sessions'];

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function apply(ctx) {
  const logger = ctx.logger ? ctx.logger(name) : console;
  const shadowGit = new ShadowGit();
  const externalTracker = new ExternalFileTracker();
  const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const storePath = join(dshHome, 'dsh-revert', 'snapshots.json');
  mkdirSync(join(dshHome, 'dsh-revert'), { recursive: true });

  function loadSnapshotIndex() {
    try {
      if (existsSync(storePath)) return JSON.parse(readFileSync(storePath, 'utf8'));
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

  // 新会话创建时拍初始状态快照 (turn = -1)
  ctx.on('session/created', (session) => {
    const cwd = session.header.cwd;
    if (!cwd) return;
    const snap = shadowGit.takeSnapshot(cwd, `Initial state of ${session.id}`);
    if (snap) {
      const index = loadSnapshotIndex();
      index[session.id] = index[session.id] || {};
      index[session.id][-1] = { ...snap, cwd };
      saveSnapshotIndex(index);
    }
  });

  ctx.on('session/event', async (session, event) => {
    if (event.type === 'tool/call') {
      try {
        const args = JSON.parse(event.data.arguments || '{}');
        const targetFile = args.path || args.file_path || args.TargetFile || args.FilePath || args.AbsolutePath;
        if (targetFile) {
          externalTracker.trackFile(session.id, targetFile);
        }

        const cmd = args.command || args.CommandLine;
        if (cmd) {
          const paths = cmd.match(/(?:\s|^|['"])(\/[^\s'"]+)/g);
          paths?.forEach((p) => {
            const cleanPath = p.replace(/^[\s'"]+/, '');
            if (cleanPath.startsWith('/')) externalTracker.trackFile(session.id, cleanPath);
          });
        }
      } catch (err) {
        logger.error(`[ExternalTracker] error parsing tool/call for ${session.id}:`, err.message);
      }
      return;
    }

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
      if (req.method !== 'POST' || !req.url.startsWith('/dsh-revert/rpc')) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        return res.end('Not Found');
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const { action, payload = {} } = JSON.parse(body || '{}');

          if (action === 'getStatus') {
            return sendJson(res, 200, { ok: true, version: '1.0.16', name: 'dsh-revert', features: ['shadow-git', 'external-tracker'] });
          }

          if (action === 'rollback') {
            const { sessionId, restoreFiles, cwd, targetTurn, isPureChat } = payload;
            if (isPureChat || !restoreFiles) {
              return sendJson(res, 200, { ok: true, restored: false, targetTurn, skipped: 'pure_chat' });
            }

            const validTurn = Number(targetTurn);
            if (isNaN(validTurn) || validTurn < 0) {
              return sendJson(res, 400, { ok: false, error: 'Invalid targetTurn' });
            }

            const turnToRestore = validTurn === 0 ? -1 : validTurn;
            const index = loadSnapshotIndex();
            const sessionSnaps = index[sessionId] || {};

            let snap = null;
            for (let t = turnToRestore; t >= -1; t--) {
              if (sessionSnaps[t]) { snap = sessionSnaps[t]; break; }
            }

            const availableTurns = Object.keys(sessionSnaps).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a);
            const latestSnap = availableTurns[0] !== undefined ? sessionSnaps[availableTurns[0]] : null;
            const gitUnchanged = Boolean(snap?.commitHash && latestSnap?.commitHash && snap.commitHash === latestSnap.commitHash);

            let restored = false;
            if (cwd && snap?.commitHash && !gitUnchanged) {
              restored = shadowGit.restoreSnapshot(cwd, snap.commitHash);
            }

            if (externalTracker.restoreSnapshot(sessionId, turnToRestore) > 0) {
              restored = true;
            }

            return sendJson(res, 200, { ok: true, restored, targetTurn });
          }

          if (action === 'fork_session') {
            const { oldSessionId, newSessionId, targetTurn } = payload;
            externalTracker.forkSession(oldSessionId, newSessionId, targetTurn);

            if (oldSessionId && newSessionId) {
              const index = loadSnapshotIndex();
              if (index[oldSessionId]) {
                const maxTurn = (targetTurn !== null && targetTurn !== undefined) ? Number(targetTurn) : Infinity;
                const clonedIndex = {};
                for (const [tStr, snap] of Object.entries(index[oldSessionId])) {
                  const tNum = Number(tStr);
                  if (!isNaN(tNum) && tNum <= maxTurn) clonedIndex[tStr] = snap;
                }
                if (maxTurn > 0 && clonedIndex[String(maxTurn)]) {
                  clonedIndex[-1] = { ...clonedIndex[String(maxTurn)] };
                }
                index[newSessionId] = clonedIndex;
                saveSnapshotIndex(index);
              }
            }

            return sendJson(res, 200, { ok: true });
          }

          return sendJson(res, 400, { ok: false, error: 'Unknown action' });
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: err.message });
        }
      });
    },
  });

  logger.info('[dsh-revert] 对话回滚、工作区快照与外部文件恢复服务已就绪');
}

export { ShadowGit, ExternalFileTracker };
