/**
 * ADW (AI Developer Workflow) module exports.
 *
 * This file provides a centralized export point for all ADW modules.
 */

// Core module - Configuration, types, and utilities
export {
  // Configuration
  CLAUDE_CODE_PATH,
  GITHUB_PAT,
  LOGS_DIR,
  SPECS_DIR,
  // Utilities
  generateAdwId,
  slugify,
  log,
  ensureLogsDirectory,
  type LogLevel,
  // Data types
  type IssueClassSlashCommand,
  type SlashCommand,
  type GitHubUser,
  type GitHubLabel,
  type GitHubMilestone,
  type GitHubComment,
  type GitHubIssueListItem,
  type GitHubIssue,
  type AgentPromptRequest,
  type AgentPromptResponse,
  type AgentTemplateRequest,
  type ClaudeCodeResultMessage,
  type WorkflowStage,
  type PRReviewComment,
  type PRDetails,
  type PRListItem,
  type PRReviewWorkflowStage,
  type RecoveryState,
  // Orchestrator shared utilities
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
} from './core';

// Agents module - Claude Code agent runners
// All agents use slash commands from .claude/commands/ for consistent prompt templates
export {
  runClaudeAgent,
  runClaudeAgentWithCommand,
  type AgentResult,
  type ProgressInfo,
  type ProgressCallback,
  getPlanFilePath,
  planFileExists,
  runPrReviewPlanAgent,
  runPlanAgent,
  runPrReviewBuildAgent,
  runBuildAgent,
} from './agents';

// GitHub module - GitHub API and git operations
export {
  getRepoInfo,
  fetchGitHubIssue,
  fetchPRDetails,
  fetchPRReviews,
  fetchPRReviewComments,
  commentOnPR,
  fetchPRList,
  commentOnIssue,
  type RepoInfo,
  getCurrentBranch,
  generateFeatureBranchName,
  createFeatureBranch,
  checkoutBranch,
  commitChanges,
  pushBranch,
  createPullRequest,
  getLastAdwCommitTimestamp,
  getUnaddressedComments,
  hasUnaddressedComments,
  STAGE_ORDER,
  parseWorkflowStageFromComment,
  extractAdwIdFromComment,
  extractBranchNameFromComment,
  extractPrUrlFromComment,
  extractPlanPathFromComment,
  detectRecoveryState,
  formatResumingComment,
  formatWorkflowComment,
  postWorkflowComment,
  formatPRReviewWorkflowComment,
  postPRWorkflowComment,
  type WorkflowContext,
  type PRReviewWorkflowContext,
} from './github';
