/**
 * Git branch operations - creation, checkout, and branch name management.
 */

import { execSync } from 'child_process';
import { log, slugify, IssueClassSlashCommand, branchPrefixMap } from '../core';

/** Gets the current git branch name. */
export function getCurrentBranch(cwd?: string): string {
  return execSync('git branch --show-current', { encoding: 'utf-8', cwd }).trim();
}

/**
 * Generates a branch name from issue number, title, and type.
 * Format: {prefix}/issue-{number}-{slugified-title}
 */
export function generateBranchName(
  issueNumber: number,
  title: string,
  issueType: IssueClassSlashCommand = '/feature'
): string {
  const slug = slugify(title);
  const prefix = branchPrefixMap[issueType];
  return `${prefix}/issue-${issueNumber}-${slug}`;
}

/**
 * @deprecated Use generateBranchName instead. Kept for backwards compatibility.
 */
export function generateFeatureBranchName(issueNumber: number, title: string): string {
  return generateBranchName(issueNumber, title, '/feature');
}

/**
 * Creates and checks out a branch for the given issue.
 * If the branch already exists, checks it out instead.
 */
export function createFeatureBranch(
  issueNumber: number,
  title: string,
  issueType: IssueClassSlashCommand = '/feature',
  cwd?: string
): string {
  const branchName = generateBranchName(issueNumber, title, issueType);

  try {
    const existingBranches = execSync('git branch -a', { encoding: 'utf-8', cwd });

    if (existingBranches.includes(branchName)) {
      log(`Branch ${branchName} already exists, checking out...`, 'info');
      execSync(`git checkout ${branchName}`, { stdio: 'pipe', cwd });
    } else {
      execSync(`git checkout -b ${branchName}`, { stdio: 'pipe', cwd });
      log(`Created branch: ${branchName}`, 'success');
    }

    return branchName;
  } catch (error) {
    throw new Error(`Failed to create branch: ${error}`);
  }
}

/** Checks out an existing branch and pulls the latest changes. */
export function checkoutBranch(branchName: string): void {
  try {
    execSync(`git checkout ${branchName}`, { stdio: 'pipe' });
    execSync(`git pull origin ${branchName}`, { stdio: 'pipe' });
    log(`Checked out and pulled latest for branch: ${branchName}`, 'success');
  } catch (error) {
    throw new Error(`Failed to checkout branch ${branchName}: ${error}`);
  }
}

/** Gets the default branch name of the repository using the GitHub CLI. */
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
 * Infers the issue type from a branch name by examining its prefix.
 * bugfix/ -> /bug, chore/ -> /chore, review/ -> /pr_review, default -> /feature
 */
export function inferIssueTypeFromBranch(branchName: string): IssueClassSlashCommand {
  if (branchName.startsWith('bugfix/')) {
    return '/bug';
  }
  if (branchName.startsWith('chore/')) {
    return '/chore';
  }
  if (branchName.startsWith('review/')) {
    return '/pr_review';
  }
  return '/feature';
}

/** Checks out the default branch and pulls the latest changes. */
export function checkoutDefaultBranch(): string {
  log('Checking out default branch...', 'info');
  const defaultBranch = getDefaultBranch();

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

/**
 * Merges the latest changes from origin/{defaultBranch} into the current branch.
 * Logs warnings on failure instead of throwing (merge conflicts should not block workflow).
 */
export function mergeLatestFromDefaultBranch(defaultBranch: string, cwd: string): void {
  log(`Fetching origin/${defaultBranch} in ${cwd}...`, 'info');
  try {
    execSync(`git fetch origin ${defaultBranch}`, { stdio: 'pipe', cwd });
  } catch (error) {
    log(`Warning: Failed to fetch origin/${defaultBranch}: ${error}`, 'info');
    return;
  }

  log(`Merging origin/${defaultBranch} into current branch...`, 'info');
  try {
    execSync(`git merge origin/${defaultBranch} --no-edit`, { stdio: 'pipe', cwd });
    log(`Merged latest changes from origin/${defaultBranch}`, 'success');
  } catch (error) {
    log(`Warning: Failed to merge origin/${defaultBranch}: ${error}`, 'info');
  }
}
