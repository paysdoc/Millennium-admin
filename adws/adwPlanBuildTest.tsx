#!/usr/bin/env npx tsx
/**
 * ADW Plan, Build & Test - Self-Sufficient Plan+Build+Test+PR Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue
 * 2. Setup worktree (with latest code from default branch)
 * 3. Detect recovery state from existing comments
 * 4. Classify issue type (feature, bug, chore, pr_review)
 * 5. Create feature branch: {type}/issue-{number}-{slug}
 * 6. Run Plan Agent: generate implementation plan
 * 7. Commit the plan
 * 8. Run Build Agent: implement the plan
 * 9. Commit the implementation
 * 10. Run unit tests (with retry on failure)
 * 11. Run E2E tests (with retry on failure)
 * 12. Create Pull Request (only if all tests pass)
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts for tests (default: 5)
 */

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  IssueClassSlashCommand,
  AgentStateManager,
  AgentState,
  MAX_TEST_RETRY_ATTEMPTS,
  setupWorktreeWithLatestCode,
  handleRecoveryMode,
  executeClassifyStep,
  executeCreateBranchStep,
  executePlanAgentStep,
  executeCommitPlanStep,
  readPlanContent,
  executeBuildAgentStep,
  executeCommitImplementationStep,
  executePRCreationStep,
  completeWorkflow,
  handleWorkflowError,
  WorkflowParams,
} from './core';
import {
  fetchGitHubIssue,
  WorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  generateBranchName,
  postWorkflowComment,
} from './github';
import {
  getPlanFilePath,
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
} from './agents';
import { classifyGitHubIssue } from './triggers/issueClassifier';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete Plan+Build+Test+PR workflow.');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY        - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH         - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  GITHUB_PAT               - (Optional) GitHub Personal Access Token');
  console.error('  MAX_TEST_RETRY_ATTEMPTS  - Maximum retry attempts for tests (default: 5)');
  process.exit(1);
}

/**
 * Parses and validates command line arguments.
 */
function parseArguments(args: string[]): { issueNumber: number; adwId: string } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const adwId = args[1] || generateAdwId();

  return { issueNumber, adwId };
}

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, adwId } = parseArguments(args);

  log('===================================', 'info');
  log('ADW Plan, Build & Test Orchestrator', 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log(`Max test retry attempts: ${MAX_TEST_RETRY_ATTEMPTS}`, 'info');
  log('===================================', 'info');

  // Step 1: Fetch issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 2: Setup worktree with latest code
  const defaultBranch = getDefaultBranch();
  const tempBranchName = generateBranchName(issueNumber, issue.title, '/feature');
  const worktreePath = setupWorktreeWithLatestCode(tempBranchName, defaultBranch);
  log(`Default branch: ${defaultBranch}`, 'info');

  // Step 3: Detect recovery state
  const recoveryState = detectRecoveryState(issue.comments);

  // Step 4: Classify issue
  log('Classifying issue type...', 'info');
  const classificationResult = await classifyGitHubIssue(issue);
  const issueType: IssueClassSlashCommand = classificationResult.issueType;
  log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');

  // Initialize state
  const logsDir = ensureLogsDirectory(adwId);
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'plan-build-test-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    agentName: 'plan-build-test-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ADW Plan, Build & Test workflow for issue #${issueNumber}`);

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
    issueType,
  };

  // Build workflow params
  const params: WorkflowParams = {
    issueNumber,
    adwId,
    issue,
    issueType,
    recoveryState,
    orchestratorStatePath,
    orchestratorName: 'plan-build-test-orchestrator',
    ctx,
    workingDir: worktreePath,
    logsDir,
  };

  // Handle recovery mode
  handleRecoveryMode(params);

  try {
    let totalCostUsd = 0;

    // === PLAN PHASE ===
    executeClassifyStep(params);
    const currentBranch = executeCreateBranchStep(params);
    totalCostUsd += await executePlanAgentStep(params, currentBranch);
    executeCommitPlanStep(params);

    // === BUILD PHASE ===
    const planPath = getPlanFilePath(issueNumber);
    const planContent = readPlanContent(planPath);
    totalCostUsd += await executeBuildAgentStep(params, planContent, currentBranch);
    executeCommitImplementationStep(params);

    // === TEST PHASE ===

    log('Phase: Unit Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: Unit Tests');

    const unitTestsResult = await runUnitTestsWithRetry({
      logsDir,
      orchestratorStatePath,
      maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    });
    totalCostUsd += unitTestsResult.costUsd;

    if (!unitTestsResult.passed) {
      const errorMsg = 'Unit tests failed after maximum retry attempts. No PR was created.';
      log(errorMsg, 'error');
      AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
      ctx.errorMessage = errorMsg;
      postWorkflowComment(issueNumber, 'error', ctx);

      AgentStateManager.writeState(orchestratorStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          errorMsg
        ),
        metadata: { totalCostUsd, unitTestsPassed: false },
      });
      process.exit(1);
    }

    log('Phase: E2E Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: E2E Tests');

    const e2eTestsResult = await runE2ETestsWithRetry({
      logsDir,
      orchestratorStatePath,
      maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    });
    totalCostUsd += e2eTestsResult.costUsd;

    if (!e2eTestsResult.passed) {
      const errorMsg = 'E2E tests failed after maximum retry attempts. No PR was created.';
      log(errorMsg, 'error');
      AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
      ctx.errorMessage = errorMsg;
      postWorkflowComment(issueNumber, 'error', ctx);

      AgentStateManager.writeState(orchestratorStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          errorMsg
        ),
        metadata: { totalCostUsd, unitTestsPassed: true, e2eTestsPassed: false },
      });
      process.exit(1);
    }

    log('All tests passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'All tests passed');

    // === PR PHASE ===
    executePRCreationStep(params, defaultBranch);

    // === COMPLETION ===
    completeWorkflow(orchestratorStatePath, ctx, issueNumber, {
      totalCostUsd,
      unitTestsPassed: true,
      e2eTestsPassed: true,
      totalTestRetries: unitTestsResult.totalRetries + e2eTestsResult.totalRetries,
    });

    log('===================================', 'info');
    log('ADW Plan, Build & Test workflow completed!', 'success');
    if (ctx.prUrl) {
      log(`PR: ${ctx.prUrl}`, 'info');
    }
    log('===================================', 'info');

  } catch (error) {
    handleWorkflowError(error, orchestratorStatePath, ctx, issueNumber, 'Plan, Build & Test workflow');
  }
}

main();
