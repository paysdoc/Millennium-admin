/**
 * Git worktree operations for ADW workflows.
 *
 * Provides functions to manage git worktrees, enabling ADW workflows to run
 * in isolated directories without changing the branch of the main repository.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../core';
import { getDefaultBranch } from './gitOperations';

/**
 * Result of checking if a branch is checked out elsewhere.
 */
export interface BranchCheckoutStatus {
  checkedOut: boolean;
  path: string | null;
  isMainRepo: boolean;
}

/**
 * Sanitizes a branch name for use as a directory name.
 * Replaces special characters with dashes.
 *
 * @param branchName - The branch name to sanitize
 * @returns A safe directory name derived from the branch name
 */
function sanitizeBranchName(branchName: string): string {
  return branchName.replace(/[/\\:*?"<>|]/g, '-');
}

/**
 * Gets the worktrees directory path based on the main repository path.
 * This ensures worktree paths are always relative to the actual git repository,
 * not process.cwd() which may differ when running from different contexts.
 *
 * @returns The absolute path to the worktrees directory
 */
export function getWorktreesDir(): string {
  const mainRepoPath = getMainRepoPath();
  return path.join(mainRepoPath, '.worktrees');
}

/**
 * Gets the path of the main repository (not a worktree).
 * The main repository is the first worktree listed that doesn't contain '.worktrees'.
 *
 * @returns The absolute path to the main repository
 * @throws Error if unable to determine the main repository path
 */
export function getMainRepoPath(): string {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.substring('worktree '.length);
        if (!wtPath.includes('.worktrees')) {
          return wtPath;
        }
      }
    }

    throw new Error('Could not find main repository in worktree list');
  } catch (error) {
    throw new Error(`Failed to get main repository path: ${error}`);
  }
}

/**
 * Copies the .env file from the main repository to the worktree.
 * This is necessary because .env is in .gitignore and won't be included in worktrees.
 *
 * @param worktreePath - The absolute path to the worktree
 */
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

/**
 * Checks if a branch is currently checked out in the main repository or another worktree.
 *
 * @param branchName - The branch name to check
 * @returns Status object with checkedOut flag, path where it's checked out, and isMainRepo flag
 */
export function isBranchCheckedOutElsewhere(branchName: string): BranchCheckoutStatus {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const lines = output.split('\n');

    let currentWorktreePath: string | null = null;
    let mainRepoPath: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('worktree ')) {
        currentWorktreePath = line.substring('worktree '.length);
        if (!currentWorktreePath.includes('.worktrees') && !mainRepoPath) {
          mainRepoPath = currentWorktreePath;
        }
      }

      if (line.startsWith('branch ') && currentWorktreePath) {
        const branchRef = line.substring('branch '.length);
        const checkedOutBranch = branchRef.replace('refs/heads/', '');

        if (checkedOutBranch === branchName) {
          const isMainRepo = currentWorktreePath === mainRepoPath;
          return {
            checkedOut: true,
            path: currentWorktreePath,
            isMainRepo,
          };
        }
      }
    }

    return { checkedOut: false, path: null, isMainRepo: false };
  } catch {
    return { checkedOut: false, path: null, isMainRepo: false };
  }
}

/**
 * Frees a branch from the main repository by committing/pushing changes
 * and switching to the default branch.
 *
 * @param branchName - The branch name to free from the main repository
 * @throws Error if unable to free the branch
 */
export function freeBranchFromMainRepo(branchName: string): void {
  const mainRepoPath = getMainRepoPath();
  log(`Freeing branch '${branchName}' from main repository at ${mainRepoPath}`, 'info');

  try {
    // Check for uncommitted changes
    const status = execSync('git status --porcelain', {
      encoding: 'utf-8',
      cwd: mainRepoPath,
    });

    if (status.trim()) {
      log(`Found uncommitted changes in main repository, auto-committing...`, 'info');
      execSync('git add -A', { stdio: 'pipe', cwd: mainRepoPath });
      execSync('git commit -m "WIP: auto-commit before switching to worktree"', {
        stdio: 'pipe',
        cwd: mainRepoPath,
      });
      log(`Auto-committed changes`, 'success');

      // Push the branch
      try {
        execSync(`git push -u origin ${branchName}`, { stdio: 'pipe', cwd: mainRepoPath });
        log(`Pushed branch '${branchName}' to origin`, 'success');
      } catch (pushError) {
        log(`Warning: Could not push branch to origin: ${pushError}`, 'info');
      }
    }

    // Switch to default branch and pull latest changes
    const defaultBranch = getDefaultBranch();
    execSync(`git checkout ${defaultBranch} && git pull`, { stdio: 'pipe', cwd: mainRepoPath });
    log(`Switched main repository to '${defaultBranch}' and pulled latest changes`, 'success');
  } catch (error) {
    throw new Error(`Failed to free branch '${branchName}' from main repository: ${error}`);
  }
}

/**
 * Returns the path where a worktree for the given branch should be located.
 *
 * @param branchName - The name of the branch
 * @returns The absolute path to the worktree directory
 */
export function getWorktreePath(branchName: string): string {
  const sanitizedName = sanitizeBranchName(branchName);
  return path.join(getWorktreesDir(), sanitizedName);
}

/**
 * Checks if a worktree already exists for the given branch.
 *
 * @param branchName - The name of the branch to check
 * @returns True if a worktree exists for the branch
 */
export function worktreeExists(branchName: string): boolean {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const worktreePath = getWorktreePath(branchName);

    // Parse worktree list output to find matching worktree
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.substring('worktree '.length);
        if (wtPath === worktreePath) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Lists all existing worktrees.
 *
 * @returns Array of worktree paths
 */
export function listWorktrees(): string[] {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const worktrees: string[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        const wtPath = line.substring('worktree '.length);
        // Skip the main worktree (the repository root)
        if (!wtPath.includes('.worktrees')) {
          continue;
        }
        worktrees.push(wtPath);
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Creates a new worktree for the given branch.
 * If baseBranch is provided, creates the worktree starting from that branch.
 *
 * @param branchName - The name of the branch to checkout in the worktree
 * @param baseBranch - Optional base branch to create the worktree from
 * @returns The absolute path to the created worktree
 * @throws Error if worktree creation fails
 */
export function createWorktree(branchName: string, baseBranch?: string): string {
  const worktreePath = getWorktreePath(branchName);
  const worktreesDir = getWorktreesDir();

  // Ensure worktrees directory exists
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  try {
    // Check if the branch exists remotely or locally
    let branchExists = false;
    try {
      execSync(`git rev-parse --verify ${branchName}`, { stdio: 'pipe' });
      branchExists = true;
    } catch {
      // Branch doesn't exist locally, check remote
      try {
        execSync(`git rev-parse --verify origin/${branchName}`, { stdio: 'pipe' });
        branchExists = true;
      } catch {
        branchExists = false;
      }
    }

    if (branchExists) {
      // Check if branch is checked out elsewhere before attempting worktree add
      const checkoutStatus = isBranchCheckedOutElsewhere(branchName);

      if (checkoutStatus.checkedOut) {
        if (checkoutStatus.isMainRepo) {
          // Branch is checked out in main repo, free it first
          log(`Branch '${branchName}' is checked out in main repository, freeing it...`, 'info');
          freeBranchFromMainRepo(branchName);
        } else if (checkoutStatus.path) {
          // Branch is checked out in another worktree, reuse that worktree
          log(
            `Branch '${branchName}' is already checked out at ${checkoutStatus.path}, reusing existing worktree`,
            'info'
          );
          return checkoutStatus.path;
        }
      }

      // Branch exists, create worktree for existing branch
      execSync(`git worktree add "${worktreePath}" ${branchName}`, { stdio: 'pipe' });
      log(`Created worktree for existing branch '${branchName}' at ${worktreePath}`, 'success');
    } else if (baseBranch) {
      // Branch doesn't exist, create worktree with new branch from base
      execSync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, { stdio: 'pipe' });
      log(`Created worktree with new branch '${branchName}' from '${baseBranch}' at ${worktreePath}`, 'success');
    } else {
      // No base branch provided and branch doesn't exist
      throw new Error(`Branch '${branchName}' does not exist and no base branch was provided`);
    }

    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree for branch '${branchName}': ${error}`);
  }
}

/**
 * Creates a worktree and a new branch in one operation.
 * The new branch is created from the current HEAD of the repository.
 *
 * @param branchName - The name of the new branch to create
 * @param baseBranch - Optional base branch to create the new branch from (defaults to HEAD)
 * @returns The absolute path to the created worktree
 * @throws Error if worktree creation fails
 */
export function createWorktreeForNewBranch(branchName: string, baseBranch?: string): string {
  const worktreePath = getWorktreePath(branchName);
  const worktreesDir = getWorktreesDir();

  // Ensure worktrees directory exists
  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  try {
    const base = baseBranch || 'HEAD';
    execSync(`git worktree add -b ${branchName} "${worktreePath}" ${base}`, { stdio: 'pipe' });
    log(`Created worktree with new branch '${branchName}' at ${worktreePath}`, 'success');
    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree with new branch '${branchName}': ${error}`);
  }
}

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
 * Gets the existing worktree path for a branch if it exists.
 *
 * @param branchName - The name of the branch to look up
 * @returns The worktree path if it exists, null otherwise
 */
export function getWorktreeForBranch(branchName: string): string | null {
  try {
    const output = execSync('git worktree list --porcelain', { encoding: 'utf-8' });
    const expectedWorktreePath = getWorktreePath(branchName);

    // Parse worktree list output to find matching worktree
    const lines = output.split('\n');
    let currentWorktreePath: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('worktree ')) {
        currentWorktreePath = line.substring('worktree '.length);
        // Check if this is the expected path
        if (currentWorktreePath === expectedWorktreePath) {
          return expectedWorktreePath;
        }
      }

      // Also check by branch name to find worktrees at unexpected paths
      if (line.startsWith('branch ') && currentWorktreePath) {
        const branchRef = line.substring('branch '.length);
        const checkedOutBranch = branchRef.replace('refs/heads/', '');

        if (checkedOutBranch === branchName && currentWorktreePath.includes('.worktrees')) {
          log(
            `Found worktree for branch '${branchName}' at unexpected path ${currentWorktreePath}`,
            'info'
          );
          return currentWorktreePath;
        }
      }
    }

    // Also check if the directory exists even if git doesn't track it
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
 * Ensures a worktree exists for the given branch, creating it if necessary.
 * If the worktree already exists, logs a warning and returns the existing path.
 *
 * @param branchName - The name of the branch
 * @param baseBranch - Optional base branch to create the worktree from (for new branches)
 * @returns The absolute path to the worktree
 */
export function ensureWorktree(branchName: string, baseBranch?: string): string {
  const existingPath = getWorktreeForBranch(branchName);

  if (existingPath) {
    log(`Worktree for branch '${branchName}' already exists at ${existingPath}, reusing`, 'info');
    copyEnvToWorktree(existingPath);
    return existingPath;
  }

  const worktreePath = createWorktree(branchName, baseBranch);
  copyEnvToWorktree(worktreePath);
  return worktreePath;
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
