/**
 * Agent-related types and constants for ADW agents.
 */

import { IssueClassSlashCommand, SlashCommand } from './workflow';

/** Maps issue classification to commit message prefixes (conventional commits). */
export const commitPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feat:',
  '/bug': 'fix:',
  '/chore': 'chore:',
  '/pr_review': 'review:',
};

/** Maps issue classification to branch name prefixes (Git branching conventions). */
export const branchPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feature',
  '/bug': 'bugfix',
  '/chore': 'chore',
  '/pr_review': 'review',
};

/** Agent identifier for consistent naming across the state system. */
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
  | 'test-orchestrator'
  | 'test-agent'
  | 'test-resolver-agent'
  | 'review-agent'
  | 'patch-agent'
  | 'branch-name-agent'
  | 'commit-agent';

/** Execution status for tracking agent progress. */
export type AgentExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Agent execution state for tracking progress. */
export interface AgentExecutionState {
  status: AgentExecutionStatus;
  /** ISO 8601 timestamp when agent started */
  startedAt: string;
  /** ISO 8601 timestamp when agent completed (if applicable) */
  completedAt?: string;
  errorMessage?: string;
}

/**
 * Core agent state stored in state.json.
 * Contains all context needed for workflow execution and recovery.
 */
export interface AgentState {
  adwId: string;
  issueNumber: number;
  branchName?: string;
  planFile?: string;
  issueClass?: IssueClassSlashCommand;
  agentName: AgentIdentifier;
  parentAgent?: AgentIdentifier;
  execution: AgentExecutionState;
  output?: string;
  metadata?: Record<string, unknown>;
}

/** Claude Code agent prompt configuration. */
export interface AgentPromptRequest {
  prompt: string;
  adwId: string;
  agentName: string;
  model: 'sonnet' | 'opus' | 'haiku';
  dangerouslySkipPermissions: boolean;
  outputFile: string;
}

/** Claude Code agent response. */
export interface AgentPromptResponse {
  output: string;
  success: boolean;
  sessionId?: string | null;
}

/** Claude Code agent template execution request. */
export interface AgentTemplateRequest {
  agentName: string;
  slashCommand: SlashCommand;
  args: string[];
  adwId: string;
  model: 'sonnet' | 'opus' | 'haiku';
}

/** Claude Code JSONL result message (last line). */
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
  /** Per-model token usage breakdown from the Claude CLI. */
  modelUsage?: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    costUSD: number;
  }>;
}
