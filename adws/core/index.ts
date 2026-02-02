/**
 * Core module - Configuration, types, and utilities.
 */

// Configuration
export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR } from './config';

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
} from './dataTypes';

// Utilities
export {
  generateAdwId,
  slugify,
  log,
  ensureLogsDirectory,
  type LogLevel,
} from './utils';
