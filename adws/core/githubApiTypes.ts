/**
 * Raw GitHub API response types.
 * These interfaces mirror the JSON shapes returned by the `gh` CLI and GitHub REST API,
 * before any transformation into the domain types defined in dataTypes.ts.
 */

/** Raw author/user object returned by `gh issue view --json`. */
export interface RawGitHubAuthor {
  login?: string;
  name?: string;
  is_bot?: boolean;
}

/** Raw user object returned by the GitHub REST API (e.g., reviews, line comments). */
export interface RawGitHubRestUser {
  login?: string;
  type?: string;
}

/** Raw label object. */
export interface RawGitHubLabel {
  id?: string;
  name: string;
  color?: string;
  description?: string;
}

/** Raw assignee object. */
export interface RawGitHubAssignee {
  login: string;
  name?: string;
  is_bot?: boolean;
}

/** Raw milestone object. */
export interface RawGitHubMilestone {
  id?: string;
  number: number;
  title: string;
  description?: string;
  state: string;
}

/** Raw comment object from `gh issue view --json comments`. */
export interface RawGitHubComment {
  id?: string;
  author?: RawGitHubAuthor;
  body: string;
  createdAt: string;
  updatedAt?: string;
}

/** Raw issue response from `gh issue view --json ...`. */
export interface RawGitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: string;
  author?: RawGitHubAuthor;
  assignees?: RawGitHubAssignee[];
  labels?: RawGitHubLabel[];
  milestone?: RawGitHubMilestone | null;
  comments?: RawGitHubComment[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
  url: string;
}

/** Raw PR response from `gh pr view --json ...`. */
export interface RawGitHubPR {
  number: number;
  title: string;
  body?: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  url: string;
}

/** Raw PR review from the REST API (`/pulls/{number}/reviews`). */
export interface RawGitHubReview {
  id: number;
  user?: RawGitHubRestUser;
  body?: string;
  state: string;
  submitted_at: string;
}

/** Raw PR line comment from the REST API (`/pulls/{number}/comments`). */
export interface RawGitHubLineComment {
  id: number;
  user?: RawGitHubRestUser;
  body: string;
  path?: string;
  line?: number | null;
  original_line?: number | null;
  created_at: string;
  updated_at: string;
}

/** Raw PR list item from `gh pr list --json ...`. */
export interface RawGitHubPRListItem {
  number: number;
  headRefName: string;
  updatedAt: string;
}

/** Raw REST API issue comment from `/issues/{number}/comments`. */
export interface RawGitHubRestComment {
  id: number;
  body?: string;
  user?: RawGitHubRestUser;
  created_at: string;
}

/** Raw issue-state response from `gh issue view --json state`. */
export interface RawGitHubIssueState {
  state: string;
}
