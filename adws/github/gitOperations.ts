/**
 * Git operations for branch management and commits.
 */

import { execSync } from 'child_process';
import { log, slugify } from '../core';

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
 * Checks out an existing branch and pulls the latest changes.
 */
export function checkoutBranch(branchName: string): void {
  try {
    execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
    execSync(`git pull origin ${branchName}`, { stdio: 'pipe' });
    log(`Checked out and pulled latest for branch: ${branchName}`, 'success');
  } catch (error) {
    throw new Error(`Failed to checkout branch ${branchName}: ${error}`);
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

/**
 * Gets the default branch name of the repository using the GitHub CLI.
 * @returns The name of the default branch (e.g., 'main', 'master', 'develop')
 */
export function getDefaultBranch(): string {
  try {
    const result = execSync(
      "gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'",
      { encoding: 'utf-8' }
    );
    const branchName = result.trim();

    if (!branchName) {
      throw new Error('GitHub CLI returned empty default branch name');
    }

    return branchName;
  } catch (error) {
    throw new Error(`Failed to get default branch: ${error}`);
  }
}

/**
 * Checks out the repository's default branch and pulls the latest changes.
 * This ensures the working directory is on the latest version of the default branch
 * before creating feature branches.
 * @returns The name of the default branch that was checked out.
 */
export function checkoutDefaultBranch(): string {
  log('Checking out default branch...', 'info');

  const defaultBranch = getDefaultBranch();
  log(`Default branch is: ${defaultBranch}`, 'info');

  try {
    execSync(`git checkout ${defaultBranch}`, { stdio: 'pipe' });
    log(`Checked out branch: ${defaultBranch}`, 'success');
  } catch (error) {
    throw new Error(`Failed to checkout default branch '${defaultBranch}': ${error}`);
  }

  try {
    execSync(`git pull origin ${defaultBranch}`, { stdio: 'pipe' });
    log(`Pulled latest changes from origin/${defaultBranch}`, 'success');
  } catch (error) {
    throw new Error(`Failed to pull latest changes for '${defaultBranch}': ${error}`);
  }

  return defaultBranch;
}
