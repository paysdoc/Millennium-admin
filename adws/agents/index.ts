/**
 * Agents module - Claude Code agent runners.
 * All agents use slash commands from .claude/commands/ for consistent prompt templates.
 */

// Claude Agent (base runners)
export {
  runClaudeAgent,
  runClaudeAgentWithCommand,
  type AgentResult,
  type ProgressInfo,
  type ProgressCallback,
} from './claudeAgent';

// Plan Agent
export {
  getPlanFilePath,
  planFileExists,
  runPrReviewPlanAgent,
  runPlanAgent,
} from './planAgent';

// Build Agent
export {
  runPrReviewBuildAgent,
  runBuildAgent,
} from './buildAgent';

// Test Agent
export {
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  discoverE2ETestFiles,
  type TestResult,
  type E2ETestResult,
  type TestAgentResult,
  type E2ETestAgentResult,
} from './testAgent';

// Git Agent
export {
  runGenerateBranchNameAgent,
  runCommitAgent,
} from './gitAgent';

// Test Retry (shared test retry logic)
export {
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
  type TestRetryResult,
  type TestRetryOptions,
} from './testRetry';

