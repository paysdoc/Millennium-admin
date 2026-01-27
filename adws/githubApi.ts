/**
 * GitHub API functions using the gh CLI.
 */

import { execSync } from 'child_process';
import { GitHubIssue } from './dataTypes';
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
