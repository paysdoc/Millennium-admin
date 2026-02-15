/**
 * Git worktree cleanup functions.
 *
 * Provides functions to remove git worktrees for ADW workflows.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../core';
import { getWorktreePath, listWorktrees } from './worktreeOperations';

/**
 * Removes a worktree for the given branch.
 *
 * @param branchName - The name of the branch whose worktree should be removed
 * @returns True if the worktree was successfully removed, false if it didn't exist
 */
export function removeWorktree(branchName: string): boolean {
  const worktreePath = getWorktreePath(branchName);

  try {
    // First try to remove the worktree using git command
    execSync(`git worktree remove "${worktreePath}" --force`, { stdio: 'pipe' });
    log(`Removed worktree for branch '${branchName}' at ${worktreePath}`, 'success');
    return true;
  } catch (error) {
    // Check if the worktree directory exists but git doesn't track it
    if (fs.existsSync(worktreePath)) {
      try {
        // Prune stale worktree entries first
        execSync('git worktree prune', { stdio: 'pipe' });
        // Then try to remove the directory manually
        fs.rmSync(worktreePath, { recursive: true, force: true });
        log(`Removed orphaned worktree directory at ${worktreePath}`, 'info');
        return true;
      } catch (cleanupError) {
        log(`Failed to cleanup worktree directory at ${worktreePath}: ${cleanupError}`, 'error');
        return false;
      }
    }

    // Worktree doesn't exist
    log(`Worktree for branch '${branchName}' does not exist at ${worktreePath}`, 'info');
    return false;
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

  let removedCount = 0;

  matching.forEach((wtPath) => {
    try {
      log(`Removing worktree at ${wtPath}`, 'info');
      execSync(`git worktree remove "${wtPath}" --force`, { stdio: 'pipe' });
      log(`Removed worktree at ${wtPath}`, 'success');
      removedCount += 1;
    } catch (error) {
      if (fs.existsSync(wtPath)) {
        try {
          fs.rmSync(wtPath, { recursive: true, force: true });
          log(`Removed orphaned worktree directory at ${wtPath}`, 'info');
          removedCount += 1;
        } catch (cleanupError) {
          log(`Failed to cleanup worktree directory at ${wtPath}: ${cleanupError}`, 'error');
        }
      } else {
        log(`Failed to remove worktree at ${wtPath}: ${error}`, 'error');
      }
    }
  });

  try {
    execSync('git worktree prune', { stdio: 'pipe' });
  } catch (pruneError) {
    log(`Failed to prune worktrees: ${pruneError}`, 'error');
  }

  log(`Removed ${removedCount} worktree(s) for issue #${issueNumber}`, 'success');
  return removedCount;
}
