/**
 * ADW (AI Developer Workflow) module exports.
 *
 * This file provides a centralized export point for all ADW modules.
 */

// Configuration
export { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR } from './config';

// Utilities
export {
  generateAdwId,
  slugify,
  log,
  ensureLogsDirectory,
  type LogLevel
} from './utils';

// GitHub API
export {
  getRepoInfo,
  fetchGitHubIssue,
  commentOnIssue,
  type RepoInfo
} from './githubApi';

// Git Operations
export {
  getCurrentBranch,
  generateFeatureBranchName,
  createFeatureBranch,
  commitChanges,
  pushBranch
} from './gitOperations';

// Claude Agent
export {
  runClaudeAgent,
  type AgentResult
} from './claudeAgent';

// Plan Agent
export {
  buildPlanPrompt,
  getPlanFilePath,
  runPlanAgent
} from './planAgent';

// Build Agent
export {
  buildImplementPrompt,
  runBuildAgent
} from './buildAgent';

// Pull Request
export { createPullRequest } from './pullRequestCreator';

// Data Types (re-export for convenience)
export type {
  GitHubIssue,
  GitHubUser,
  GitHubLabel,
  GitHubMilestone,
  GitHubComment,
  ClaudeCodeResultMessage
} from './dataTypes';
