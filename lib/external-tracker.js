import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { homedir } from 'node:os';

/**
 * 工作区外部文件变更追踪器（快照版）
 * 只要 AI 在任意一轮中碰过某个外部文件，就把它加入“观察列表”。
 * 每一轮结束时，给观察列表里的所有文件拍一次快照。
 * 撤销时，直接恢复对应轮次的快照。
 */
export class ExternalFileTracker {
  constructor(baseDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'rewind-snapshots', 'external')) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this.recordsFile = join(this.baseDir, 'external-snapshots.json');
  }

  _load() {
    try {
      if (existsSync(this.recordsFile)) {
        return JSON.parse(readFileSync(this.recordsFile, 'utf8'));
      }
    } catch {}
    return {};
  }

  _save(data) {
    try {
      writeFileSync(this.recordsFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      // 仅保留关键错误日志
    }
  }

  /** 将外部文件加入观察列表，并记录其最初的模样 */
  trackFile(sessionId, rawPath) {
    if (!sessionId || !rawPath) return;
    try {
      // 路径安全校验：防止路径穿越，只允许绝对路径
      const filePath = resolve(normalize(rawPath));
      if (!filePath.startsWith('/')) return;

      // 🛡️ 核心黑名单：绝对禁止追踪 DSH 内部目录、Git 仓库元数据及系统特殊目录
      const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
      if (
        filePath.startsWith(dshHome) ||
        filePath.includes('/.dsh/') ||
        filePath.includes('/.git/') ||
        filePath.startsWith('/proc/') ||
        filePath.startsWith('/sys/') ||
        filePath.startsWith('/dev/') ||
        filePath.startsWith('/tmp/dsh-')
      ) {
        return;
      }

      const data = this._load();
      if (!data[sessionId]) data[sessionId] = { trackedFiles: [], snapshots: {}, initial: {} };
      if (!data[sessionId].trackedFiles.includes(filePath)) {
        data[sessionId].trackedFiles.push(filePath);
        
        if (existsSync(filePath)) {
          try {
            data[sessionId].initial[filePath] = { exists: true, content: readFileSync(filePath, 'base64') };
          } catch { }
        } else {
          data[sessionId].initial[filePath] = { exists: false };
        }
        this._save(data);
      }
    } catch (e) {
      // 解析路径异常时忽略
    }
  }

  /** 分支会话时，继承父会话的外部文件快照记录 */
  forkSession(oldSessionId, newSessionId) {
    if (!oldSessionId || !newSessionId) return;
    const data = this._load();
    if (data[oldSessionId]) {
      data[newSessionId] = JSON.parse(JSON.stringify(data[oldSessionId]));
      this._save(data);
    }
  }

  /** 在每一轮结束后，对观察列表里的所有文件拍快照 */
  takeSnapshot(sessionId, turn) {
    const data = this._load();
    if (!data[sessionId]) return;
    
    const snap = {};
    for (const file of data[sessionId].trackedFiles) {
      if (existsSync(file)) {
        try {
          snap[file] = { exists: true, content: readFileSync(file, 'base64') };
        } catch { }
      } else {
        snap[file] = { exists: false };
      }
    }
    
    data[sessionId].snapshots[String(turn)] = snap;
    this._save(data);
  }

  /**
   * 撤销时，将所有观察文件恢复到目标回合的快照状态。
   * turnToRestore: -1 (全部删除), 1, 2, ...
   */
  restoreSnapshot(sessionId, turnToRestore) {
    const data = this._load();
    const sessionData = data[sessionId];
    if (!sessionData) return;

    let targetSnap = {};
    if (turnToRestore >= 1) {
      for (let t = turnToRestore; t >= 1; t--) {
        if (sessionData.snapshots[String(t)]) {
          targetSnap = sessionData.snapshots[String(t)];
          break;
        }
      }
    }

    for (const file of sessionData.trackedFiles) {
      const state = targetSnap[file] || sessionData.initial[file];
      if (!state) continue;

      try {
        if (state.exists && state.content !== undefined) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, Buffer.from(state.content, 'base64'));
        } else if (!state.exists && existsSync(file)) {
          unlinkSync(file);
        }
      } catch (err) {
        // 静默处理恢复错误
      }
    }
  }
}

