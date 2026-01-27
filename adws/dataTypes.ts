/**
 * Data types for GitHub API responses and Claude Code agent.
 * Converted from Python Pydantic models in data_types.py
 */

/**
 * Supported slash commands for issue classification.
 * These should align with your custom slash commands in .claude/commands that you want to run.
 */
export type IssueClassSlashCommand = '/chore' | '/bug' | '/feature';

/**
 * All slash commands used in the ADW system.
 * Includes issue classification commands and ADW-specific commands.
 */
export type SlashCommand =
  // Issue classification commands
  | '/chore'
  | '/bug'
  | '/feature'
  // ADW workflow commands
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
  | 'error';

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
