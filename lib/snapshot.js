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

  getGitDir(workspacePath) {
    const hash = createHash('sha256').update(workspacePath).digest('hex').slice(0, 16);
    const gitDir = join(this.baseDir, hash + '.git');
    if (!existsSync(gitDir)) {
      mkdirSync(gitDir, { recursive: true });
      try {
        execFileSync('git', ['--git-dir=' + gitDir, 'init', '--bare'], { stdio: 'pipe' });
      } catch (err) {
        console.error('[dsh-rewind] git init failed:', err.message);
      }
    }
    return gitDir;
  }

  takeSnapshot(workspacePath, message = 'snapshot') {
    if (!workspacePath || !existsSync(workspacePath)) return null;
    try {
      const gitDir = this.getGitDir(workspacePath);
      execFileSync('git', ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'add', '-A'], {
        stdio: 'pipe',
        timeout: 10000,
      });
      const res = execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'commit', '-m', message, '--allow-empty'],
        { stdio: 'pipe', timeout: 10000, encoding: 'utf8' }
      );
      const hash = execFileSync('git', ['--git-dir=' + gitDir, 'rev-parse', 'HEAD'], {
        stdio: 'pipe',
        timeout: 5000,
        encoding: 'utf8',
      }).trim();
      return { commitHash: hash, timestamp: Date.now() };
    } catch (err) {
      console.warn('[dsh-rewind] snapshot failed:', err.message);
      return null;
    }
  }

  restoreSnapshot(workspacePath, commitHash) {
    if (!workspacePath || !commitHash || !existsSync(workspacePath)) return false;
    try {
      const gitDir = this.getGitDir(workspacePath);
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'checkout', '-f', commitHash, '--', '.'],
        { stdio: 'pipe', timeout: 15000 }
      );
      execFileSync(
        'git',
        ['--git-dir=' + gitDir, '--work-tree=' + workspacePath, 'clean', '-fd'],
        { stdio: 'pipe', timeout: 15000 }
      );
      return true;
    } catch (err) {
      console.error('[dsh-rewind] restore failed:', err.message);
      return false;
    }
  }
}
