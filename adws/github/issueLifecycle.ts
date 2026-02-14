/**
 * Issue lifecycle operations: state queries, closing, and formatting closure comments.
 */

import { execSync } from 'child_process';
import { log } from '../core';
import type { RawGitHubIssueState } from '../core/githubApiTypes';
import { getRepoInfo } from './githubApi';
import { commentOnIssue } from './githubApi';

/** Formats a closure comment for an issue when its associated PR is closed. */
export function formatIssueClosureComment(prNumber: number, prUrl: string, wasMerged: boolean): string {
  const statusEmoji = wasMerged ? '✅' : '🔴';
  const statusText = wasMerged ? 'merged' : 'closed without merging';
  const additionalInfo = wasMerged
    ? 'The implementation has been merged into the main branch.'
    : 'The associated PR was closed without merging.';

  return `${statusEmoji} **ADW Workflow Complete**

This issue has been ${statusText} via PR #${prNumber}.

${additionalInfo}

[View Pull Request](${prUrl})`;
}

/** Returns the current state of a GitHub issue ('OPEN' or 'CLOSED'). */
export function getIssueState(issueNumber: number): string {
  const { owner, repo } = getRepoInfo();

  try {
    const json = execSync(
      `gh issue view ${issueNumber} --repo ${owner}/${repo} --json state`,
      { encoding: 'utf-8' }
    );
    const result: RawGitHubIssueState = JSON.parse(json);
    return result.state;
  } catch (error) {
    log(`Failed to get issue state for #${issueNumber}: ${error}`, 'error');
    throw error;
  }
}

/**
 * Closes a GitHub issue with an optional comment.
 * @returns true if the issue was closed, false if already closed or error occurred
 */
export async function closeIssue(issueNumber: number, comment?: string): Promise<boolean> {
  const { owner, repo } = getRepoInfo();

  try {
    const state = getIssueState(issueNumber);
    if (state === 'CLOSED') {
      log(`Issue #${issueNumber} is already closed, skipping`, 'info');
      return false;
    }

    if (comment) {
      commentOnIssue(issueNumber, comment);
    }

    execSync(
      `gh issue close ${issueNumber} --repo ${owner}/${repo}`,
      { encoding: 'utf-8' }
    );
    log(`Closed issue #${issueNumber}`, 'success');
    return true;
  } catch (error) {
    log(`Failed to close issue #${issueNumber}: ${error}`, 'error');
    return false;
  }
}
