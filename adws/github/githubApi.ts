/** GitHub API functions using the gh CLI. */
import { execSync } from 'child_process';
import { GitHubIssue, IssueCommentSummary, PRDetails, PRReviewComment, PRListItem, log } from '../core';
import type {
  RawGitHubIssue, RawGitHubPR, RawGitHubReview,
  RawGitHubLineComment, RawGitHubPRListItem, RawGitHubRestComment,
} from '../core/githubApiTypes';
import {
  transformIssueResponse, transformPRResponse, transformReviewResponse,
  transformLineCommentResponse, transformPRListItem, transformRestComment,
} from './apiTransformers';

export interface RepoInfo { owner: string; repo: string }

/** Executes a gh CLI command and returns the stdout string. */
function ghExec(command: string, input?: string): string {
  return input
    ? execSync(command, { encoding: 'utf-8', input, stdio: ['pipe', 'pipe', 'pipe'] })
    : execSync(command, { encoding: 'utf-8' });
}

/** Extracts owner and repo from the git remote URL (HTTPS or SSH). */
export function getRepoInfo(): RepoInfo {
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    const match = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/)
      || remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)/);
    if (!match) throw new Error(`Could not parse GitHub URL: ${remoteUrl}`);
    return { owner: match[1], repo: match[2] };
  } catch (error) {
    throw new Error(`Failed to get repo info: ${error}`);
  }
}

/** Fetches a GitHub issue by number using the gh CLI. */
export async function fetchGitHubIssue(issueNumber: number): Promise<GitHubIssue> {
  const { owner, repo } = getRepoInfo();
  try {
    const fields = 'number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url';
    const json = ghExec(`gh issue view ${issueNumber} --repo ${owner}/${repo} --json ${fields}`);
    return transformIssueResponse(JSON.parse(json) as RawGitHubIssue);
  } catch (error) {
    throw new Error(`Failed to fetch issue #${issueNumber}: ${error}`);
  }
}

/** Fetches PR details using the gh CLI. */
export function fetchPRDetails(prNumber: number): PRDetails {
  const { owner, repo } = getRepoInfo();
  try {
    const fields = 'number,title,body,state,headRefName,baseRefName,url';
    const json = ghExec(`gh pr view ${prNumber} --repo ${owner}/${repo} --json ${fields}`);
    return transformPRResponse(JSON.parse(json) as RawGitHubPR);
  } catch (error) {
    throw new Error(`Failed to fetch PR #${prNumber}: ${error}`);
  }
}

/** Fetches PR review-body comments (top-level review submissions). */
export function fetchPRReviews(owner: string, repo: string, prNumber: number): PRReviewComment[] {
  try {
    const raw: RawGitHubReview[] = JSON.parse(
      ghExec(`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --paginate`)
    );
    return raw
      .filter((r) => r.state !== 'PENDING' && ((r.body && r.body.trim() !== '') || r.state === 'CHANGES_REQUESTED'))
      .map(transformReviewResponse);
  } catch (error) {
    log(`Failed to fetch PR reviews: ${error}`, 'error');
    return [];
  }
}

/** Fetches all PR review comments: both line-level and review-body comments. */
export function fetchPRReviewComments(prNumber: number): PRReviewComment[] {
  const { owner, repo } = getRepoInfo();
  log(`Fetching PR review comments for ${owner}/${repo}#${prNumber}`);
  let lineComments: PRReviewComment[] = [];
  try {
    const raw: RawGitHubLineComment[] = JSON.parse(
      ghExec(`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --paginate`)
    );
    lineComments = raw.map(transformLineCommentResponse);
  } catch (error) {
    log(`Failed to fetch PR review comments: ${error}`, 'error');
  }
  log(`Fetched ${lineComments.length} line-level comments for ${owner}/${repo}#${prNumber}`);
  const reviewBodyComments = fetchPRReviews(owner, repo, prNumber);
  log(`Fetched ${reviewBodyComments.length} review-body comments for ${owner}/${repo}#${prNumber}`);
  const allComments = [...lineComments, ...reviewBodyComments];
  log(`Total: ${allComments.length} comments for ${owner}/${repo}#${prNumber}`);
  return allComments;
}
/** Posts a comment on a PR. */
export function commentOnPR(prNumber: number, body: string): void {
  const { owner, repo } = getRepoInfo();
  try {
    ghExec(`gh pr comment ${prNumber} --repo ${owner}/${repo} --body-file -`, body);
    log(`Commented on PR #${prNumber}`, 'success');
  } catch (error) {
    log(`Failed to comment on PR: ${error}`, 'error');
  }
}
/** Fetches open PRs for CRON trigger polling. */
export function fetchPRList(): PRListItem[] {
  const { owner, repo } = getRepoInfo();
  try {
    const raw: RawGitHubPRListItem[] = JSON.parse(
      ghExec(`gh pr list --repo ${owner}/${repo} --state open --json number,headRefName,updatedAt`)
    );
    return raw.map(transformPRListItem);
  } catch (error) {
    log(`Failed to fetch PR list: ${error}`, 'error');
    return [];
  }
}
/** Posts a comment on a GitHub issue. */
export function commentOnIssue(issueNumber: number, body: string): void {
  const { owner, repo } = getRepoInfo();
  try {
    ghExec(`gh issue comment ${issueNumber} --repo ${owner}/${repo} --body-file -`, body);
    log(`Commented on issue #${issueNumber}`, 'success');
  } catch (error) {
    log(`Failed to comment on issue: ${error}`, 'error');
  }
}

/** Fetches all comments on a GitHub issue via the REST API (with numeric IDs for deletion). */
export function fetchIssueCommentsRest(issueNumber: number): IssueCommentSummary[] {
  const { owner, repo } = getRepoInfo();
  try {
    const raw: RawGitHubRestComment[] = JSON.parse(
      ghExec(`gh api repos/${owner}/${repo}/issues/${issueNumber}/comments --paginate`)
    );
    return raw.map(transformRestComment);
  } catch (error) {
    throw new Error(`Failed to fetch comments for issue #${issueNumber}: ${error}`);
  }
}

/** Deletes a single issue comment by its REST API numeric ID. */
export function deleteIssueComment(commentId: number): void {
  const { owner, repo } = getRepoInfo();
  try {
    ghExec(`gh api -X DELETE repos/${owner}/${repo}/issues/comments/${commentId}`);
    log(`Deleted comment ${commentId}`, 'success');
  } catch (error) {
    throw new Error(`Failed to delete comment ${commentId}: ${error}`);
  }
}
