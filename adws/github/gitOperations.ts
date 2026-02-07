/**
 * Git operations for branch management and commits.
 */

import { execSync } from 'child_process';
import { log, slugify, IssueClassSlashCommand, branchPrefixMap } from '../core';

/**
 * Gets the current git branch name.
 * @param cwd - Optional working directory to run the command in
 */
export function getCurrentBranch(cwd?: string): string {
  return execSync('git branch --show-current', { encoding: 'utf-8', cwd }).trim();
}

/**
 * Generates a branch name from issue number, title, and type.
 * Format: {prefix}/issue-{number}-{slugified-title}
 *
 * @param issueNumber - The GitHub issue number
 * @param title - The issue title (will be slugified)
 * @param issueType - The issue classification (defaults to '/feature')
 * @returns Branch name with appropriate prefix based on issue type
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
 * @deprecated Use generateBranchName instead. This function is kept for backwards compatibility.
 * Generates a feature branch name from issue number and title.
 * Format: feature/issue-{number}-{slugified-title}
 */
export function generateFeatureBranchName(issueNumber: number, title: string): string {
  return generateBranchName(issueNumber, title, '/feature');
}

/**
 * Creates and checks out a branch for the given issue.
 * The branch prefix is determined by the issue type (feature/, bugfix/, chore/).
 * If the branch already exists, checks it out instead.
 *
 * @param issueNumber - The GitHub issue number
 * @param title - The issue title (will be slugified for branch name)
 * @param issueType - The issue classification (defaults to '/feature')
 * @param cwd - Optional working directory to run the command in
 * @returns The branch name.
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
 * @param message - The commit message
 * @param cwd - Optional working directory to run the command in
 * @returns True if changes were committed, false if no changes to commit.
 */
export function commitChanges(message: string, cwd?: string): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd });

    if (!status.trim()) {
      log('No changes to commit', 'info');
      return false;
    }

    execSync('git add -A', { stdio: 'pipe', cwd });
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { stdio: 'pipe', cwd });
    log(`Committed: ${message}`, 'success');
    return true;
  } catch (error) {
    log(`Failed to commit: ${error}`, 'error');
    return false;
  }
}

/**
 * Pushes the current branch to origin with upstream tracking.
 * @param branchName - The branch name to push
 * @param cwd - Optional working directory to run the command in
 */
export function pushBranch(branchName: string, cwd?: string): void {
  execSync(`git push -u origin ${branchName}`, { stdio: 'pipe', cwd });
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
 * Infers the issue type from a branch name by examining its prefix.
 * Maps branch prefixes to issue classification:
 *   - bugfix/ -> /bug
 *   - chore/ -> /chore
 *   - review/ -> /pr_review
 *   - feature/ (or unknown) -> /feature
 *
 * @param branchName - The branch name to parse (e.g., "bugfix/issue-123-fix-login")
 * @returns The inferred issue type classification
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
  // Default to feature for feature/ prefix or unknown prefixes
  return '/feature';
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
