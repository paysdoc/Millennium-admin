/**
 * Core module - Configuration, types, and utilities.
 */

// Configuration
export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR, AGENTS_STATE_DIR, MAX_TEST_RETRY_ATTEMPTS } from './config';

// Data types
export type {
  IssueClassSlashCommand,
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
} from './dataTypes';

// Prefix maps for consistent branch naming and commit messages
export { commitPrefixMap, branchPrefixMap } from './dataTypes';

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
