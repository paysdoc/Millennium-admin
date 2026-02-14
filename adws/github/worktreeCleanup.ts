/**
 * Worktree cleanup and listing operations.
 *
 * Provides functions to remove, list, and look up existing git worktrees.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../core';
import { getWorktreePath } from './worktreeUtils';

/** Removes a worktree for the given branch. Returns true if successfully removed. */
export function removeWorktree(branchName: string): boolean {
  const worktreePath = getWorktreePath(branchName);
  try {
    execSync(`git worktree remove "${worktreePath}" --force`, { stdio: 'pipe' });
    log(`Removed worktree for branch '${branchName}' at ${worktreePath}`, 'success');
    return true;
  } catch {
    if (fs.existsSync(worktreePath)) {
      try {
        execSync('git worktree prune', { stdio: 'pipe' });
        fs.rmSync(worktreePath, { recursive: true, force: true });
        log(`Removed orphaned worktree directory at ${worktreePath}`, 'info');
        return true;
      } catch (cleanupError) {
        log(`Failed to cleanup worktree directory at ${worktreePath}: ${cleanupError}`, 'error');
        return false;
      }
    }
    log(`Worktree for branch '${branchName}' does not exist at ${worktreePath}`, 'info');
    return false;
  }
}

/** Lists all existing worktrees (excluding the main repository). */
export function listWorktrees(): string[] {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    return output.split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.substring('worktree '.length))
      .filter((wtPath) => wtPath.includes('.worktrees'));
  } catch {
    return [];
  }
}

/**
 * Gets the existing worktree path for a branch if it exists.
 *
 * @param branchName - The name of the branch to look up
 * @returns The worktree path if it exists, null otherwise
 */
export function getWorktreeForBranch(branchName: string): string | null {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const expectedWorktreePath = getWorktreePath(branchName);
    const lines = output.split('\n');

    // Search by path match or by branch name using a reduce to track current worktree path
    const result = lines.reduce<{ currentPath: string | null; found: string | null }>(
      (acc, line) => {
        if (acc.found) return acc;
        if (line.startsWith('worktree ')) {
          const wtPath = line.substring('worktree '.length);
          if (wtPath === expectedWorktreePath) {
            return { currentPath: wtPath, found: expectedWorktreePath };
          }
          return { ...acc, currentPath: wtPath };
        }
        if (line.startsWith('branch ') && acc.currentPath) {
          const checkedOutBranch = line.substring('branch '.length).replace('refs/heads/', '');
          if (checkedOutBranch === branchName && acc.currentPath.includes('.worktrees')) {
            log(
              `Found worktree for branch '${branchName}' at unexpected path ${acc.currentPath}`,
              'info'
            );
            return { ...acc, found: acc.currentPath };
          }
        }
        return acc;
      },
      { currentPath: null, found: null }
    );

    if (result.found) return result.found;

    // Check if the directory exists even if git doesn't track it
    if (fs.existsSync(expectedWorktreePath)) {
      log(`Found orphaned worktree directory at ${expectedWorktreePath}, will attempt to reuse`, 'info');
      return expectedWorktreePath;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Removes all worktrees associated with a given issue number.
 * Finds worktrees whose directory names contain the pattern `-issue-{issueNumber}-`
 * and removes them, cleaning up both git tracking and filesystem.
 *
 * @param issueNumber - The GitHub issue number to match against worktree paths
 * @returns The count of successfully removed worktrees
 */
export function removeWorktreesForIssue(issueNumber: number): number {
  const worktrees = listWorktrees();
  const pattern = new RegExp(`-issue-${issueNumber}-`);
  const matching = worktrees.filter((wtPath) => pattern.test(path.basename(wtPath)));

  if (matching.length === 0) {
    log(`No worktrees found matching issue #${issueNumber}`, 'info');
    return 0;
  }

  log(`Found ${matching.length} worktree(s) matching issue #${issueNumber}`, 'info');

  const removedCount = matching.reduce((count, wtPath) => {
    try {
      log(`Removing worktree at ${wtPath}`, 'info');
      execSync(`git worktree remove "${wtPath}" --force`, { stdio: 'pipe' });
      log(`Removed worktree at ${wtPath}`, 'success');
      return count + 1;
    } catch {
      if (fs.existsSync(wtPath)) {
        try {
          fs.rmSync(wtPath, { recursive: true, force: true });
          log(`Removed orphaned worktree directory at ${wtPath}`, 'info');
          return count + 1;
        } catch (cleanupError) {
          log(`Failed to cleanup worktree directory at ${wtPath}: ${cleanupError}`, 'error');
          return count;
        }
      }
      log(`Failed to remove worktree at ${wtPath}`, 'error');
      return count;
    }
  }, 0);

  try {
    execSync('git worktree prune', { stdio: 'pipe' });
  } catch (pruneError) {
    log(`Failed to prune worktrees: ${pruneError}`, 'error');
  }

  log(`Removed ${removedCount} worktree(s) for issue #${issueNumber}`, 'success');
  return removedCount;
}