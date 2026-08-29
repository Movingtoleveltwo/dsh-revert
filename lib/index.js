import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { ShadowGit } from './snapshot.js';
import { ExternalFileTracker } from './external-tracker.js';

export const name = 'dsh-revert';
export const inject = ['webServer'];

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

  // 注册 /dsh-revert HTTP RPC 服务
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

            if (action === 'saveSnapshot') {
              const { sessionId, atSeq, cwd, message } = payload ?? {};
              if (cwd) {
                const snap = shadowGit.takeSnapshot(cwd, message || `Turn ${atSeq} in ${sessionId}`);
                if (snap) {
                  const index = loadSnapshotIndex();
                  index[sessionId] = index[sessionId] || {};
                  index[sessionId][atSeq] = { ...snap, cwd };
                  saveSnapshotIndex(index);
                }
              }
              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify({ ok: true }));
            }

            if (action === 'rollback' || action === 'revert') {
              const { sessionId, atSeq, restoreFiles, cwd } = payload ?? {};
              let restored = false;
              if (restoreFiles) {
                // 1. 恢复工作区内文件
                if (cwd) {
                  const index = loadSnapshotIndex();
                  const snap = index[sessionId]?.[atSeq];
                  if (snap?.commitHash) {
                    restored = shadowGit.restoreSnapshot(cwd, snap.commitHash);
                  }
                }
                // 2. 恢复工作区外部被 AI 修改的文件
                if (sessionId && atSeq !== undefined) {
                  externalTracker.restoreExternalFiles(sessionId, atSeq);
                }
              }
              res.writeHead(200, { 'content-type': 'application/json' });
              return res.end(JSON.stringify({ ok: true, restored, atSeq }));
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
