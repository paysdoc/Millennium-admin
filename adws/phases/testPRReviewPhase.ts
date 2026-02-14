/**
 * PR review test phase: runs unit and E2E tests with retry for PR reviews.
 */

import {
  log,
  AgentStateManager,
  MAX_TEST_RETRY_ATTEMPTS,
} from '../core';
import { postPRWorkflowComment } from '../github';
import { runUnitTestsWithRetry, runE2ETestsWithRetry } from '../agents';
import type { PRReviewWorkflowConfig } from './phaseUtils';

/**
 * Executes the PR review Test phase: runs unit and E2E tests with retry.
 */
export async function executePRReviewTestPhase(config: PRReviewWorkflowConfig): Promise<void> {
  const { prNumber, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  postPRWorkflowComment(prNumber, 'pr_review_testing', ctx);
  log('Running validation tests...', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting validation tests');

  const onTestFailed = (attempt: number, maxAttempts: number) => {
    ctx.testAttempt = attempt;
    ctx.maxTestAttempts = maxAttempts;
    postPRWorkflowComment(prNumber, 'pr_review_test_failed', ctx);
  };

  const unitTestsResult = await runUnitTestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    onTestFailed,
    cwd: worktreePath,
  });

  if (!unitTestsResult.passed) {
    ctx.failedTests = unitTestsResult.failedTests;
    ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
    postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        `Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
      ),
      metadata: { prNumber, reviewComments: unaddressedComments.length, testFailure: true, failedTests: unitTestsResult.failedTests },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: unit tests exceeded max retry attempts');

    log(`Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
    process.exit(1);
  }

  const e2eTestsResult = await runE2ETestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    onTestFailed,
    cwd: worktreePath,
  });

  if (!e2eTestsResult.passed) {
    ctx.failedTests = e2eTestsResult.failedTests;
    ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
    postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        `E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
      ),
      metadata: { prNumber, reviewComments: unaddressedComments.length, testFailure: true, failedTests: e2eTestsResult.failedTests },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: E2E tests exceeded max retry attempts');

    log(`E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
    process.exit(1);
  }

  postPRWorkflowComment(prNumber, 'pr_review_test_passed', ctx);
  log('All validation tests passed!', 'success');
  AgentStateManager.appendLog(orchestratorStatePath, 'All validation tests passed');
}
