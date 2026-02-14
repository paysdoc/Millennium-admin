/**
 * GitHub API response types, PR types, webhook payloads, and recovery state.
 */

import { WorkflowStage } from './workflow';

/** GitHub user model. */
export interface GitHubUser {
  id?: string | null;
  login: string;
  name?: string | null;
  isBot: boolean;
}

/** GitHub label model. */
export interface GitHubLabel {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

/** GitHub milestone model. */
export interface GitHubMilestone {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  state: string;
}

/** GitHub comment model. */
export interface GitHubComment {
  id: string;
  author: GitHubUser;
  body: string;
  createdAt: string;
  updatedAt?: string | null;
}

/** GitHub issue model for list responses (simplified). */
export interface GitHubIssueListItem {
  number: number;
  title: string;
  body: string;
  labels: GitHubLabel[];
  createdAt: string;
  updatedAt: string;
}

/** GitHub issue model (full). */
export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  author: GitHubUser;
  assignees: GitHubUser[];
  labels: GitHubLabel[];
  milestone?: GitHubMilestone | null;
  comments: GitHubComment[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  url: string;
}

/** PR review comment from GitHub API. */
export interface PRReviewComment {
  id: number;
  author: GitHubUser;
  body: string;
  path: string;
  line: number | null;
  createdAt: string;
  updatedAt: string;
}

/** PR details from GitHub API. */
export interface PRDetails {
  number: number;
  title: string;
  body: string;
  state: string;
  headBranch: string;
  baseBranch: string;
  url: string;
  /** Extracted from PR body (e.g., "Implements #12") */
  issueNumber: number | null;
  reviewComments: PRReviewComment[];
}

/** PR list item for CRON trigger polling. */
export interface PRListItem {
  number: number;
  headBranch: string;
  updatedAt: string;
}

/** GitHub webhook payload for pull_request events. */
export interface PullRequestWebhookPayload {
  action: 'opened' | 'closed' | 'reopened' | 'synchronize' | 'edited';
  pull_request: {
    number: number;
    state: string;
    merged: boolean;
    body: string | null;
    html_url: string;
    title: string;
    base: { ref: string };
    head: { ref: string };
  };
  repository: {
    name: string;
    owner: { login: string };
    full_name: string;
  };
}

/** Minimal issue comment from GitHub REST API (for listing/deleting). */
export interface IssueCommentSummary {
  /** Numeric REST API comment ID (required for deletion). */
  id: number;
  body: string;
  authorLogin: string;
  createdAt: string;
}

/** Recovery state for resuming a workflow from a previous run. */
export interface RecoveryState {
  lastCompletedStage: WorkflowStage | null;
  adwId: string | null;
  branchName: string | null;
  planPath: string | null;
  prUrl: string | null;
  canResume: boolean;
}
