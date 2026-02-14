/**
 * Transformer functions that convert raw GitHub API responses
 * into the typed domain models defined in dataTypes.ts.
 */

import {
  GitHubIssue,
  GitHubUser,
  PRDetails,
  PRReviewComment,
  PRListItem,
  IssueCommentSummary,
} from '../core';

import type {
  RawGitHubIssue,
  RawGitHubAuthor,
  RawGitHubAssignee,
  RawGitHubRestUser,
  RawGitHubPR,
  RawGitHubReview,
  RawGitHubLineComment,
  RawGitHubPRListItem,
  RawGitHubRestComment,
} from '../core/githubApiTypes';

/** Transforms a raw `gh` CLI author into a GitHubUser. */
function transformAuthor(raw?: RawGitHubAuthor): GitHubUser {
  return {
    login: raw?.login || 'unknown',
    name: raw?.name || null,
    isBot: raw?.is_bot || false,
  };
}

/** Transforms a raw REST API user into a GitHubUser. */
function transformRestUser(raw?: RawGitHubRestUser): GitHubUser {
  return {
    login: raw?.login || 'unknown',
    name: null,
    isBot: raw?.type === 'Bot',
  };
}

/** Transforms a raw GitHub issue response into a GitHubIssue. */
export function transformIssueResponse(rawIssue: RawGitHubIssue): GitHubIssue {
  return {
    number: rawIssue.number,
    title: rawIssue.title,
    body: rawIssue.body || '',
    state: rawIssue.state,
    author: transformAuthor(rawIssue.author),
    assignees: (rawIssue.assignees || []).map((a: RawGitHubAssignee) => ({
      login: a.login,
      name: a.name || null,
      isBot: a.is_bot || false,
    })),
    labels: (rawIssue.labels || []).map((l) => ({
      id: l.id || '',
      name: l.name,
      color: l.color || '',
      description: l.description || null,
    })),
    milestone: rawIssue.milestone ? {
      id: rawIssue.milestone.id || '',
      number: rawIssue.milestone.number,
      title: rawIssue.milestone.title,
      description: rawIssue.milestone.description || null,
      state: rawIssue.milestone.state,
    } : null,
    comments: (rawIssue.comments || []).map((c) => ({
      id: c.id || '',
      author: transformAuthor(c.author),
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt || null,
    })),
    createdAt: rawIssue.createdAt,
    updatedAt: rawIssue.updatedAt,
    closedAt: rawIssue.closedAt || null,
    url: rawIssue.url,
  };
}

/** Transforms a raw PR response into PRDetails. */
export function transformPRResponse(raw: RawGitHubPR): PRDetails {
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
}

/** Transforms a raw PR review into a PRReviewComment. */
export function transformReviewResponse(r: RawGitHubReview): PRReviewComment {
  return {
    id: r.id,
    author: transformRestUser(r.user),
    body: (r.body && r.body.trim() !== '') ? r.body : `[Review submitted: ${r.state}]`,
    path: '',
    line: null,
    createdAt: r.submitted_at,
    updatedAt: r.submitted_at,
  };
}

/** Transforms a raw PR line comment into a PRReviewComment. */
export function transformLineCommentResponse(c: RawGitHubLineComment): PRReviewComment {
  return {
    id: c.id,
    author: transformRestUser(c.user),
    body: c.body,
    path: c.path || '',
    line: c.line || c.original_line || null,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

/** Transforms a raw PR list item into a PRListItem. */
export function transformPRListItem(pr: RawGitHubPRListItem): PRListItem {
  return {
    number: pr.number,
    headBranch: pr.headRefName,
    updatedAt: pr.updatedAt,
  };
}

/** Transforms a raw REST API issue comment into an IssueCommentSummary. */
export function transformRestComment(c: RawGitHubRestComment): IssueCommentSummary {
  return {
    id: c.id,
    body: c.body || '',
    authorLogin: c.user?.login || 'unknown',
    createdAt: c.created_at,
  };
}
