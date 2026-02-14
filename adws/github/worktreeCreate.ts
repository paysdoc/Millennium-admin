/**
 * Worktree creation operations.
 *
 * Provides functions to create git worktrees for new and existing branches,
 * and to ensure a worktree exists before use.
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import { log } from '../core';
import {
  getWorktreePath,
  getWorktreesDir,
  isBranchCheckedOutElsewhere,
  freeBranchFromMainRepo,
  copyEnvToWorktree,
} from './worktreeUtils';
import { getWorktreeForBranch } from './worktreeCleanup';

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

  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  try {
    const branchExists = [branchName, `origin/${branchName}`].some((ref) => {
      try {
        execSync(`git rev-parse --verify ${ref}`, { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    });

    if (branchExists) {
      const checkoutStatus = isBranchCheckedOutElsewhere(branchName);
      if (checkoutStatus.checkedOut) {
        if (checkoutStatus.isMainRepo) {
          log(`Branch '${branchName}' is checked out in main repository, freeing it...`, 'info');
          freeBranchFromMainRepo(branchName);
        } else if (checkoutStatus.path) {
          log(
            `Branch '${branchName}' is already checked out at ${checkoutStatus.path}, reusing existing worktree`,
            'info'
          );
          return checkoutStatus.path;
        }
      }
      execSync(`git worktree add "${worktreePath}" ${branchName}`, { stdio: 'pipe' });
      log(`Created worktree for existing branch '${branchName}' at ${worktreePath}`, 'success');
    } else if (baseBranch) {
      execSync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, { stdio: 'pipe' });
      log(`Created worktree with new branch '${branchName}' from '${baseBranch}' at ${worktreePath}`, 'success');
    } else {
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

  if (!fs.existsSync(worktreesDir)) {
    fs.mkdirSync(worktreesDir, { recursive: true });
  }

  try {
    const base = baseBranch ?? 'HEAD';
    execSync(`git worktree add -b ${branchName} "${worktreePath}" ${base}`, { stdio: 'pipe' });
    log(`Created worktree with new branch '${branchName}' at ${worktreePath}`, 'success');
    return worktreePath;
  } catch (error) {
    throw new Error(`Failed to create worktree with new branch '${branchName}': ${error}`);
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