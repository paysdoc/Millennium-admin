/**
 * Core module - Configuration, types, and utilities.
 */

// Configuration
export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR, AGENTS_STATE_DIR, MAX_TEST_RETRY_ATTEMPTS, MAX_REVIEW_RETRY_ATTEMPTS, WORKTREES_DIR } from './config';

// Data types
export type {
  IssueClassSlashCommand,
  AdwSlashCommand,
  AdwClassificationResult,
  SlashCommand,
  GitHubUser,
  GitHubLabel,
  GitHubMilestone,
  GitHubComment,
  GitHubIssueListItem,
  GitHubIssue,
  AgentPromptRequest,
  AgentPromptResponse,
  AgentTemplateRequest,
  ClaudeCodeResultMessage,
  WorkflowStage,
  PRReviewComment,
  PRDetails,
  PRListItem,
  PRReviewWorkflowStage,
  RecoveryState,
  PullRequestWebhookPayload,
  AgentIdentifier,
  AgentExecutionStatus,
  AgentExecutionState,
  AgentState,
  IssueCommentSummary,
} from './dataTypes';

// Prefix maps for consistent branch naming and commit messages
export { commitPrefixMap, branchPrefixMap, adwCommandToIssueTypeMap, adwCommandToOrchestratorMap } from './dataTypes';

// Utilities
export {
  generateAdwId,
  slugify,
  log,
  ensureLogsDirectory,
  ensureAgentStateDirectory,
  getAgentStatePath,
  type LogLevel,
} from './utils';

// Agent State Management
export {
  AgentStateManager,
  initializeAgentState,
  writeAgentState,
  readAgentState,
  appendAgentLog,
  writeAgentRawOutput,
  readParentAgentState,
} from './agentState';

// Orchestrator shared utilities
export { shouldExecuteStage, hasUncommittedChanges, getNextStage } from './orchestratorLib';

