/**
 * Shared utilities and helpers for git worktree operations.
 *
 * Provides path helpers, branch checking, and environment copy functions
 * used by worktree creation and cleanup modules.
 */
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../core';
import { getDefaultBranch } from './gitOperations';

/** Result of checking if a branch is checked out elsewhere. */
export interface BranchCheckoutStatus {
  checkedOut: boolean;
  path: string | null;
  isMainRepo: boolean;
}

/** Sanitizes a branch name for use as a directory name. */
function sanitizeBranchName(branchName: string): string {
  return branchName.replace(/[/\\:*?"<>|]/g, '-');
}

/**
 * Gets the path of the main repository (not a worktree).
 * @throws Error if unable to determine the main repository path
 */
export function getMainRepoPath(): string {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const mainPath = output.split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.substring('worktree '.length))
      .find((wtPath) => !wtPath.includes('.worktrees'));
    if (!mainPath) {
      throw new Error('Could not find main repository in worktree list');
    }
    return mainPath;
  } catch (error) {
    throw new Error(`Failed to get main repository path: ${error}`);
  }
}

/** Gets the worktrees directory path based on the main repository path. */
export function getWorktreesDir(): string {
  return path.join(getMainRepoPath(), '.worktrees');
}

/** Returns the path where a worktree for the given branch should be located. */
export function getWorktreePath(branchName: string): string {
  return path.join(getWorktreesDir(), sanitizeBranchName(branchName));
}

/** Copies the .env file from the main repository to the worktree. */
export function copyEnvToWorktree(worktreePath: string): void {
  try {
    const mainRepoPath = getMainRepoPath();
    const sourceEnvPath = path.join(mainRepoPath, '.env');
    const destEnvPath = path.join(worktreePath, '.env');
    if (fs.existsSync(sourceEnvPath)) {
      fs.copyFileSync(sourceEnvPath, destEnvPath);
      log(`Copied .env file to worktree at ${worktreePath}`, 'info');
    } else {
      log(`No .env file found in main repository at ${mainRepoPath}, skipping copy`, 'info');
    }
  } catch (error) {
    log(`Warning: Failed to copy .env to worktree: ${error}`, 'info');
  }
}

/** Checks if a worktree already exists for the given branch. */
export function worktreeExists(branchName: string): boolean {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const worktreePath = getWorktreePath(branchName);
    return output.split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.substring('worktree '.length))
      .some((wtPath) => wtPath === worktreePath);
  } catch {
    return false;
  }
}

/** Checks if a branch is currently checked out in the main repository or another worktree. */
export function isBranchCheckedOutElsewhere(branchName: string): BranchCheckoutStatus {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const lines = output.split('\n');
    const mainRepoPath = lines
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.substring('worktree '.length))
      .find((wtPath) => !wtPath.includes('.worktrees')) ?? null;

    const result = lines.reduce<{ currentPath: string | null; found: BranchCheckoutStatus | null }>(
      (acc, line) => {
        if (acc.found) return acc;
        if (line.startsWith('worktree ')) {
          return { ...acc, currentPath: line.substring('worktree '.length) };
        }
        if (line.startsWith('branch ') && acc.currentPath) {
          const checkedOutBranch = line.substring('branch '.length).replace('refs/heads/', '');
          if (checkedOutBranch === branchName) {
            return {
              currentPath: acc.currentPath,
              found: { checkedOut: true, path: acc.currentPath, isMainRepo: acc.currentPath === mainRepoPath },
            };
          }
        }
        return acc;
      },
      { currentPath: null, found: null }
    );
    return result.found ?? { checkedOut: false, path: null, isMainRepo: false };
  } catch {
    return { checkedOut: false, path: null, isMainRepo: false };
  }
}

/**
 * Frees a branch from the main repository by committing/pushing changes
 * and switching to the default branch.
 * @throws Error if unable to free the branch
 */
export function freeBranchFromMainRepo(branchName: string): void {
  const mainRepoPath = getMainRepoPath();
  log(`Freeing branch '${branchName}' from main repository at ${mainRepoPath}`, 'info');
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: mainRepoPath });
    if (status.trim()) {
      log(`Found uncommitted changes in main repository, auto-committing...`, 'info');
      execSync('git add -A', { stdio: 'pipe', cwd: mainRepoPath });
      execSync('git commit -m "WIP: auto-commit before switching to worktree"', {
        stdio: 'pipe', cwd: mainRepoPath,
      });
      log(`Auto-committed changes`, 'success');
      try {
        execSync(`git push -u origin ${branchName}`, { stdio: 'pipe', cwd: mainRepoPath });
        log(`Pushed branch '${branchName}' to origin`, 'success');
      } catch (pushError) {
        log(`Warning: Could not push branch to origin: ${pushError}`, 'info');
      }
    }
    const defaultBranch = getDefaultBranch();
    execSync(`git checkout ${defaultBranch} && git pull`, { stdio: 'pipe', cwd: mainRepoPath });
    log(`Switched main repository to '${defaultBranch}' and pulled latest changes`, 'success');
  } catch (error) {
    throw new Error(`Failed to free branch '${branchName}' from main repository: ${error}`);
  }
}