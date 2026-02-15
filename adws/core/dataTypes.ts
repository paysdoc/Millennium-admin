/**
 * Data types for GitHub API responses and Claude Code agent.
 * Converted from Python Pydantic models in data_types.py
 */

/**
 * Supported slash commands for issue classification.
 * These should align with your custom slash commands in .claude/commands that you want to run.
 */
export type IssueClassSlashCommand = '/chore' | '/bug' | '/feature' | '/pr_review';

/**
 * Valid ADW workflow slash commands for explicit workflow routing.
 */
export type AdwSlashCommand =
  | '/adw_plan'
  | '/adw_build'
  | '/adw_test'
  | '/adw_review'
  | '/adw_document'
  | '/adw_patch'
  | '/adw_plan_build'
  | '/adw_plan_build_test'
  | '/adw_plan_build_review'
  | '/adw_plan_build_document'
  | '/adw_plan_build_test_review'
  | '/adw_sdlc';

/**
 * Maps ADW workflow commands to issue classification types.
 * Commands with test phases map to /feature, without test to /bug,
 * planning/documentation-only to /chore, review-focused to /pr_review.
 */
export const adwCommandToIssueTypeMap: Record<AdwSlashCommand, IssueClassSlashCommand> = {
  '/adw_plan': '/chore',
  '/adw_build': '/feature',
  '/adw_test': '/feature',
  '/adw_review': '/pr_review',
  '/adw_document': '/chore',
  '/adw_patch': '/bug',
  '/adw_plan_build': '/bug',
  '/adw_plan_build_test': '/feature',
  '/adw_plan_build_review': '/pr_review',
  '/adw_plan_build_document': '/chore',
  '/adw_plan_build_test_review': '/feature',
  '/adw_sdlc': '/feature',
};

/**
 * Maps ADW workflow commands to their dedicated orchestrator scripts.
 * Commands present in this map bypass issue-type-based routing and route
 * directly to the specified orchestrator. Commands omitted from this map
 * (e.g., `/adw_review`, `/adw_document`, `/adw_patch`) fall back to
 * issue-type-based routing in `getWorkflowScript()`.
 */
export const adwCommandToOrchestratorMap: Partial<Record<AdwSlashCommand, string>> = {
  '/adw_plan': 'adws/adwPlan.tsx',
  '/adw_build': 'adws/adwBuild.tsx',
  '/adw_test': 'adws/adwTest.tsx',
  '/adw_plan_build': 'adws/adwPlanBuild.tsx',
  '/adw_plan_build_test': 'adws/adwPlanBuildTest.tsx',
  '/adw_plan_build_test_review': 'adws/adwPlanBuildTestReview.tsx',
  '/adw_sdlc': 'adws/adwPlanBuildTestReview.tsx',
} as const;

/**
 * Result from the /classify_adw command extraction.
 */
export interface AdwClassificationResult {
  adw_slash_command?: AdwSlashCommand;
  adw_id?: string;
}

/**
 * Maps issue classification to commit message prefixes.
 * Following conventional commits specification.
 */
export const commitPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feat:',
  '/bug': 'fix:',
  '/chore': 'chore:',
  '/pr_review': 'review:',
};

/**
 * Maps issue classification to branch name prefixes.
 * Following common Git branching conventions.
 */
export const branchPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feature',
  '/bug': 'bugfix',
  '/chore': 'chore',
  '/pr_review': 'review',
};

/**
 * All slash commands used in the ADW system.
 * Includes issue classification commands and ADW-specific commands.
 */
export type SlashCommand =
  // Issue classification commands
  | '/chore'
  | '/bug'
  | '/feature'
  | '/pr_review'
  // ADW workflow commands
  | '/classify_adw'
  | '/classify_issue'
  | '/find_plan_file'
  | '/generate_branch_name'
  | '/commit'
  | '/pull_request'
  | '/implement';

/**
 * GitHub user model.
 */
export interface GitHubUser {
  /** Not always returned by GitHub API */
  id?: string | null;
  login: string;
  name?: string | null;
  isBot: boolean;
}

/**
 * GitHub label model.
 */
export interface GitHubLabel {
  id: string;
  name: string;
  color: string;
  description?: string | null;
}

/**
 * GitHub milestone model.
 */
export interface GitHubMilestone {
  id: string;
  number: number;
  title: string;
  description?: string | null;
  state: string;
}

/**
 * GitHub comment model.
 */
export interface GitHubComment {
  id: string;
  author: GitHubUser;
  body: string;
  /** ISO 8601 date string */
  createdAt: string;
  /** ISO 8601 date string - Not always returned */
  updatedAt?: string | null;
}

/**
 * GitHub issue model for list responses (simplified).
 */
export interface GitHubIssueListItem {
  number: number;
  title: string;
  body: string;
  labels: GitHubLabel[];
  /** ISO 8601 date string */
  createdAt: string;
  /** ISO 8601 date string */
  updatedAt: string;
}

/**
 * GitHub issue model (full).
 */
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
  /** ISO 8601 date string */
  createdAt: string;
  /** ISO 8601 date string */
  updatedAt: string;
  /** ISO 8601 date string */
  closedAt?: string | null;
  url: string;
}

/**
 * Claude Code agent prompt configuration.
 */
export interface AgentPromptRequest {
  prompt: string;
  adwId: string;
  agentName: string;
  model: 'sonnet' | 'opus' | 'haiku';
  dangerouslySkipPermissions: boolean;
  outputFile: string;
}

/**
 * Claude Code agent response.
 */
export interface AgentPromptResponse {
  output: string;
  success: boolean;
  sessionId?: string | null;
}

/**
 * Claude Code agent template execution request.
 */
export interface AgentTemplateRequest {
  agentName: string;
  slashCommand: SlashCommand;
  args: string[];
  adwId: string;
  model: 'sonnet' | 'opus' | 'haiku';
}

/**
 * Claude Code JSONL result message (last line).
 */
export interface ClaudeCodeResultMessage {
  type: string;
  subtype: string;
  isError: boolean;
  durationMs: number;
  durationApiMs: number;
  numTurns: number;
  result: string;
  sessionId: string;
  totalCostUsd: number;
  /** Per-model token usage breakdown from the Claude CLI (available in recent versions). */
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  }>;
}

/**
 * Snapshot of cumulative token usage at a point in time.
 */
export interface TokenUsageSnapshot {
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheCreationTokens: number;
  readonly totalTokens: number;
  readonly maxTokens: number;
  readonly thresholdPercent: number;
}

/**
 * Workflow stages for ADW progress tracking.
 */
export type WorkflowStage =
  | 'starting'
  | 'resuming'
  | 'classified'
  | 'branch_created'
  | 'plan_building'
  | 'plan_created'
  | 'plan_file_created'
  | 'plan_committing'
  | 'implementing'
  | 'build_progress'
  | 'implemented'
  | 'implementation_committing'
  | 'pr_creating'
  | 'pr_created'
  | 'completed'
  | 'error'
  // Test workflow stages
  | 'test_running'
  | 'test_failed'
  | 'test_resolving'
  | 'test_passed'
  // Review workflow stages
  | 'review_running'
  | 'review_passed'
  | 'review_failed'
  | 'review_patching'
  // Token limit recovery
  | 'token_limit_recovery';

/**
 * PR review comment from GitHub API.
 */
export interface PRReviewComment {
  id: number;
  author: GitHubUser;
  body: string;
  path: string;
  line: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * PR details from GitHub API.
 */
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

/**
 * PR list item for CRON trigger polling.
 */
export interface PRListItem {
  number: number;
  headBranch: string;
  updatedAt: string;
}

/**
 * Workflow stages for PR review progress tracking.
 */
export type PRReviewWorkflowStage =
  | 'pr_review_starting'
  | 'pr_review_planning'
  | 'pr_review_planned'
  | 'pr_review_implementing'
  | 'pr_review_implemented'
  | 'pr_review_testing'
  | 'pr_review_test_failed'
  | 'pr_review_test_passed'
  | 'pr_review_test_max_attempts'
  | 'pr_review_committing'
  | 'pr_review_pushed'
  | 'pr_review_completed'
  | 'pr_review_error';

/**
 * Recovery state for resuming a workflow from a previous run.
 */
export interface RecoveryState {
  /** The last successfully completed stage */
  lastCompletedStage: WorkflowStage | null;
  /** The ADW ID from the previous run (extracted from comments) */
  adwId: string | null;
  /** The branch name from previous run */
  branchName: string | null;
  /** The plan file path from previous run */
  planPath: string | null;
  /** The PR URL if already created */
  prUrl: string | null;
  /** Whether recovery is possible */
  canResume: boolean;
}

/**
 * GitHub webhook payload for pull_request events.
 */
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

/**
 * Minimal issue comment from GitHub REST API (for listing/deleting).
 */
export interface IssueCommentSummary {
  /** Numeric REST API comment ID (required for deletion). */
  id: number;
  /** Comment body text. */
  body: string;
  /** Comment author login. */
  authorLogin: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/**
 * Agent identifier for consistent naming across the state system.
 */
export type AgentIdentifier =
  | 'orchestrator'
  | 'plan-orchestrator'
  | 'build-orchestrator'
  | 'plan-build-orchestrator'
  | 'plan-build-test-orchestrator'
  | 'plan-build-test-review-orchestrator'
  | 'classifier'
  | 'plan-agent'
  | 'build-agent'
  | 'pr-review-orchestrator'
  | 'pr-review-plan-agent'
  | 'pr-review-build-agent'
  // Test workflow agents
  | 'test-orchestrator'
  | 'test-agent'
  | 'test-resolver-agent'
  // Review workflow agents
  | 'review-agent'
  | 'patch-agent'
  // Git workflow agents
  | 'branch-name-agent'
  | 'commit-agent';

/**
 * Execution status for tracking agent progress.
 */
export type AgentExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

/**
 * Agent execution state for tracking progress.
 */
export interface AgentExecutionState {
  /** Current execution status */
  status: AgentExecutionStatus;
  /** ISO 8601 timestamp when agent started */
  startedAt: string;
  /** ISO 8601 timestamp when agent completed (if applicable) */
  completedAt?: string;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Core agent state stored in state.json.
 * Contains all context needed for workflow execution and recovery.
 */
export interface AgentState {
  /** Unique ADW session identifier */
  adwId: string;
  /** GitHub issue number being addressed */
  issueNumber: number;
  /** Git branch name for the feature/fix */
  branchName?: string;
  /** Path to the implementation plan file */
  planFile?: string;
  /** Issue classification (slash command) */
  issueClass?: IssueClassSlashCommand;
  /** OS process ID of the orchestrator process (for liveness checks) */
  pid?: number;
  /** Agent identifier */
  agentName: AgentIdentifier;
  /** Parent agent identifier (for nested agents) */
  parentAgent?: AgentIdentifier;
  /** Execution state */
  execution: AgentExecutionState;
  /** Agent-specific output or summary */
  output?: string;
  /** Token usage snapshot at time of interruption (for token limit recovery). */
  tokenUsage?: TokenUsageSnapshot;
  /** Additional metadata for agent-specific data */
  metadata?: Record<string, unknown>;
}
