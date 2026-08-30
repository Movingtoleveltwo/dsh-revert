import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';

export class ShadowGit {
  constructor(baseDir = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'rewind-snapshots')) {
    this.baseDir = baseDir;
    mkdirSync(this.baseDir, { recursive: true });
  }

  /**
   * 根据工作区路径获取（或初始化）对应的裸 git 仓库目录
   */
  getGitDir(workspacePath) {
    const hash = createHash('sha256').update(workspacePath).digest('hex').slice(0, 16);
    const gitDir = join(this.baseDir, hash + '.git');
    if (!existsSync(gitDir)) {
      mkdirSync(gitDir, { recursive: true });
      try {
        execFileSync('git', ['--git-dir=' + gitDir, 'init', '--bare'], { cwd: workspacePath, stdio: 'pipe' });
      } catch (err) {
        console.error('[dsh-rewind] git init failed:', err.message);
      }
    }
    return gitDir;
  }

  /**
   * 对工作区拍一张快照，返回 { commitHash, timestamp }
   */
  takeSnapshot(workspacePath, message = 'snapshot') {
    if (!workspacePath || !existsSync(workspacePath)) return null;
    try {
      const gitDir = this.getGitDir(workspacePath);
      execFileSync('git', ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'add', '-A'], {
        cwd: workspacePath, stdio: 'pipe', timeout: 10000,
      });
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'commit', '-m', message, '--allow-empty'],
        { cwd: workspacePath, stdio: 'pipe', timeout: 10000, encoding: 'utf8' }
      );
      const hash = execFileSync('git', ['--git-dir=' + gitDir, 'rev-parse', 'HEAD'], {
        cwd: workspacePath, stdio: 'pipe', timeout: 5000, encoding: 'utf8',
      }).trim();
      return { commitHash: hash, timestamp: Date.now() };
    } catch (err) {
      console.warn('[dsh-rewind] snapshot failed:', err.message);
      return null;
    }
  }

  /**
   * 将工作区恢复到指定快照的状态
   * 使用 read-tree + checkout-index + clean 三步，确保正确删除目标快照中不存在的文件
   */
  restoreSnapshot(workspacePath, commitHash) {
    if (!workspacePath || !commitHash || !existsSync(workspacePath)) return false;
    try {
      const gitDir = this.getGitDir(workspacePath);
      // Step 1: 将 index 更新为目标 commit 的状态（此后目标快照里不存在的文件变为"未追踪"）
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'read-tree', commitHash],
        { cwd: workspacePath, stdio: 'pipe', timeout: 15000 }
      );
      // Step 2: 将 index 中的所有文件检出到工作区
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'checkout-index', '-a', '-f'],
        { cwd: workspacePath, stdio: 'pipe', timeout: 15000 }
      );
      // Step 3: 删除 index 更新后变为"未追踪"的多余文件
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'clean', '-fd'],
        { cwd: workspacePath, stdio: 'pipe', timeout: 15000 }
      );
      return true;
    } catch (err) {
      console.error('[dsh-rewind] restore failed:', err.message);
      return false;
    }
  }
}
