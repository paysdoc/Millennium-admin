/**
 * GitHub API functions using the gh CLI.
 */

import { execSync } from 'child_process';
import { GitHubIssue, PRDetails, PRReviewComment, PRListItem } from './dataTypes';
import { log } from './utils';

export interface RepoInfo {
  owner: string;
  repo: string;
}

/**
 * Extracts owner and repo from the git remote URL.
 * Supports both HTTPS and SSH URL formats.
 */
export function getRepoInfo(): RepoInfo {
  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();

    const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/([^/.]+)/);
    const match = httpsMatch || sshMatch;

    if (!match) {
      throw new Error(`Could not parse GitHub URL: ${remoteUrl}`);
    }

    return { owner: match[1], repo: match[2] };
  } catch (error) {
    throw new Error(`Failed to get repo info: ${error}`);
  }
}

/**
 * Transforms raw GitHub API response to GitHubIssue format.
 */
function transformIssueResponse(rawIssue: any): GitHubIssue {
  return {
    number: rawIssue.number,
    title: rawIssue.title,
    body: rawIssue.body || '',
    state: rawIssue.state,
    author: {
      login: rawIssue.author?.login || 'unknown',
      name: rawIssue.author?.name || null,
      isBot: rawIssue.author?.is_bot || false
    },
    assignees: (rawIssue.assignees || []).map((a: any) => ({
      login: a.login,
      name: a.name || null,
      isBot: a.is_bot || false
    })),
    labels: (rawIssue.labels || []).map((l: any) => ({
      id: l.id || '',
      name: l.name,
      color: l.color || '',
      description: l.description || null
    })),
    milestone: rawIssue.milestone ? {
      id: rawIssue.milestone.id || '',
      number: rawIssue.milestone.number,
      title: rawIssue.milestone.title,
      description: rawIssue.milestone.description || null,
      state: rawIssue.milestone.state
    } : null,
    comments: (rawIssue.comments || []).map((c: any) => ({
      id: c.id || '',
      author: {
        login: c.author?.login || 'unknown',
        name: c.author?.name || null,
        isBot: c.author?.is_bot || false
      },
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || null
    })),
    createdAt: rawIssue.createdAt,
    updatedAt: rawIssue.updatedAt,
    closedAt: rawIssue.closedAt || null,
    url: rawIssue.url
  };
}

/**
 * Fetches a GitHub issue by number using the gh CLI.
 */
export async function fetchGitHubIssue(issueNumber: number): Promise<GitHubIssue> {
  const { owner, repo } = getRepoInfo();

  try {
    const issueJson = execSync(
      `gh issue view ${issueNumber} --repo ${owner}/${repo} --json number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url`,
      { encoding: 'utf-8' }
    );

    const rawIssue = JSON.parse(issueJson);
    return transformIssueResponse(rawIssue);
  } catch (error) {
    throw new Error(`Failed to fetch issue #${issueNumber}: ${error}`);
  }
}

/**
 * Fetches PR details using the gh CLI.
 */
export function fetchPRDetails(prNumber: number): PRDetails {
  const { owner, repo } = getRepoInfo();

  try {
    const json = execSync(
      `gh pr view ${prNumber} --repo ${owner}/${repo} --json number,title,body,state,headRefName,baseRefName,url`,
      { encoding: 'utf-8' }
    );
    const raw = JSON.parse(json);

    // Extract issue number from PR body (e.g., "Implements #12")
    const issueMatch = raw.body?.match(/Implements #(\d+)/);
    const issueNumber = issueMatch ? parseInt(issueMatch[1], 10) : null;

    return {
      number: raw.number,
      title: raw.title,
      body: raw.body || '',
      state: raw.state,
      headBranch: raw.headRefName,
      baseBranch: raw.baseRefName,
      url: raw.url,
      issueNumber,
      reviewComments: [],
    };
  } catch (error) {
    throw new Error(`Failed to fetch PR #${prNumber}: ${error}`);
  }
}

/**
 * Fetches PR review-body comments (top-level review submissions) using the GitHub API.
 * These are comments submitted via the "Submit review" dialog, not attached to specific code lines.
 */
export function fetchPRReviews(owner: string, repo: string, prNumber: number): PRReviewComment[] {
  try {
    const json = execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews --paginate`,
      { encoding: 'utf-8' }
    );
    const raw = JSON.parse(json);

    return (raw as any[])
      .filter((r: any) => r.state !== 'PENDING' && ((r.body && r.body.trim() !== '') || r.state === 'CHANGES_REQUESTED'))
      .map((r: any) => ({
        id: r.id,
        author: {
          login: r.user?.login || 'unknown',
          name: null,
          isBot: r.user?.type === 'Bot',
        },
        body: (r.body && r.body.trim() !== '') ? r.body : `[Review submitted: ${r.state}]`,
        path: '',
        line: null,
        createdAt: r.submitted_at,
        updatedAt: r.submitted_at,
      }));
  } catch (error) {
    log(`Failed to fetch PR reviews: ${error}`, 'error');
    return [];
  }
}

/**
 * Fetches all PR review comments: both line-level comments and review-body comments.
 */
export function fetchPRReviewComments(prNumber: number): PRReviewComment[] {
  const { owner, repo } = getRepoInfo();
  log(`Fetching PR review comments for ${owner}/${repo}#${prNumber}`);

  let lineComments: PRReviewComment[] = [];
  try {
    const json = execSync(
      `gh api repos/${owner}/${repo}/pulls/${prNumber}/comments --paginate`,
      { encoding: 'utf-8' }
    );
    const raw = JSON.parse(json);

    lineComments = (raw as any[]).map((c: any) => ({
      id: c.id,
      author: {
        login: c.user?.login || 'unknown',
        name: null,
        isBot: c.user?.type === 'Bot',
      },
      body: c.body,
      path: c.path || '',
      line: c.line || c.original_line || null,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
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

/**
 * Posts a comment on a PR.
 */
export function commentOnPR(prNumber: number, body: string): void {
  const { owner, repo } = getRepoInfo();

  try {
    execSync(
      `gh pr comment ${prNumber} --repo ${owner}/${repo} --body-file -`,
      { encoding: 'utf-8', input: body, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    log(`Commented on PR #${prNumber}`, 'success');
  } catch (error) {
    log(`Failed to comment on PR: ${error}`, 'error');
  }
}

/**
 * Fetches open PRs for CRON trigger polling.
 */
export function fetchPRList(): PRListItem[] {
  const { owner, repo } = getRepoInfo();

  try {
    const json = execSync(
      `gh pr list --repo ${owner}/${repo} --state open --json number,headRefName,updatedAt`,
      { encoding: 'utf-8' }
    );
    const raw = JSON.parse(json);

    return (raw as any[]).map((pr: any) => ({
      number: pr.number,
      headBranch: pr.headRefName,
      updatedAt: pr.updatedAt,
    }));
  } catch (error) {
    log(`Failed to fetch PR list: ${error}`, 'error');
    return [];
  }
}

/**
 * Posts a comment on a GitHub issue.
 */
export function commentOnIssue(issueNumber: number, body: string): void {
  const { owner, repo } = getRepoInfo();

  try {
    execSync(
      `gh issue comment ${issueNumber} --repo ${owner}/${repo} --body-file -`,
      { encoding: 'utf-8', input: body, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    log(`Commented on issue #${issueNumber}`, 'success');
  } catch (error) {
    log(`Failed to comment on issue: ${error}`, 'error');
  }
}
