import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/**
 * 工作区外部文件变更拦截与恢复追踪器
 * 精准记录 AI 在工作区外部编辑或创建过的文件原始状态
 */
export class ExternalFileTracker {
  constructor(baseDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'rewind-snapshots', 'external')) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
    this.records = new Map(); // sessionId -> { atSeq -> Map<filePath, { exists: boolean, content?: string }> }
  }

  /**
   * 在 AI 修改或创建外部文件之前记录原状态
   */
  recordBeforeChange(sessionId, atSeq, filePath) {
    if (!sessionId || !filePath) return;
    let sessionMap = this.records.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map();
      this.records.set(sessionId, sessionMap);
    }
    let turnMap = sessionMap.get(atSeq);
    if (!turnMap) {
      turnMap = new Map();
      sessionMap.set(atSeq, turnMap);
    }

    // 只记录该轮第一次触碰时的原始状态
    if (!turnMap.has(filePath)) {
      if (existsSync(filePath)) {
        try {
          const originalContent = readFileSync(filePath, 'utf8');
          turnMap.set(filePath, { exists: true, content: originalContent });
        } catch {
          // 二进制或无法读取时跳过
        }
      } else {
        turnMap.set(filePath, { exists: false });
      }
    }
  }

  /**
   * 回退时恢复外部文件的原始状态
   */
  restoreExternalFiles(sessionId, atSeq) {
    const sessionMap = this.records.get(sessionId);
    if (!sessionMap) return;

    for (const [seq, turnMap] of sessionMap.entries()) {
      if (seq >= atSeq) {
        for (const [filePath, state] of turnMap.entries()) {
          try {
            if (state.exists && state.content !== undefined) {
              mkdirSync(dirname(filePath), { recursive: true });
              writeFileSync(filePath, state.content, 'utf8');
            } else if (!state.exists && existsSync(filePath)) {
              unlinkSync(filePath);
            }
          } catch (err) {
            console.warn('[dsh-rewind] failed to restore external file:', filePath, err.message);
          }
        }
      }
    }
  }
}
