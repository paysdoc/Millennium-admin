/**
 * Git operations for branch management and commits.
 */

import { execSync } from 'child_process';
import { log, slugify } from './utils';

/**
 * Gets the current git branch name.
 */
export function getCurrentBranch(): string {
  return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
}

/**
 * Generates a feature branch name from issue number and title.
 * Format: feature/issue-{number}-{slugified-title}
 */
export function generateFeatureBranchName(issueNumber: number, title: string): string {
  const slug = slugify(title);
  return `feature/issue-${issueNumber}-${slug}`;
}

/**
 * Creates and checks out a feature branch for the given issue.
 * If the branch already exists, checks it out instead.
 * @returns The branch name.
 */
export function createFeatureBranch(issueNumber: number, title: string): string {
  const branchName = generateFeatureBranchName(issueNumber, title);

  try {
    const existingBranches = execSync('git branch -a', { encoding: 'utf-8' });

    if (existingBranches.includes(branchName)) {
      log(`Branch ${branchName} already exists, checking out...`, 'info');
      execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
    } else {
      execSync(`git checkout -b ${branchName}`, { stdio: 'pipe' });
      log(`Created branch: ${branchName}`, 'success');
    }

    return branchName;
  } catch (error) {
    throw new Error(`Failed to create feature branch: ${error}`);
  }
}

/**
 * Stages all changes and commits with the given message.
 * @returns True if changes were committed, false if no changes to commit.
 */
export function commitChanges(message: string): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });

    if (!status.trim()) {
      log('No changes to commit', 'info');
      return false;
    }

    execSync('git add -A', { stdio: 'pipe' });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe' });
    log(`Committed: ${message}`, 'success');
    return true;
  } catch (error) {
    log(`Failed to commit: ${error}`, 'error');
    return false;
  }
}

/**
 * Pushes the current branch to origin with upstream tracking.
 */
export function pushBranch(branchName: string): void {
  execSync(`git push -u origin ${branchName}`, { stdio: 'pipe' });
  log(`Pushed branch to origin`, 'success');
}
