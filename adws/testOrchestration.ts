/**
 * Test orchestration logic extracted from adwTest.tsx.
 *
 * Contains the core test workflow: initialize state, run unit tests with retry,
 * run E2E tests with retry, update state, and print summary.
 */

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  AgentStateManager,
  AgentState,
  MAX_TEST_RETRY_ATTEMPTS,
} from './core';
import { runUnitTestsWithRetry, runE2ETestsWithRetry } from './agents';

/** Prints the test phase summary. */
export const printTestSummary = (
  adwId: string,
  logsDir: string,
  unitTestsPassed: boolean,
  e2eTestsPassed: boolean,
  totalRetries: number,
  totalCostUsd: number
): void => {
  log('===================================', 'info');
  if (unitTestsPassed && e2eTestsPassed) {
    log('ADW Test workflow completed!', 'success');
  } else {
    log('ADW Test workflow failed!', 'error');
  }
  log(`ADW ID: ${adwId}`, 'info');
  log(`Unit tests: ${unitTestsPassed ? 'PASSED' : 'FAILED'}`, unitTestsPassed ? 'success' : 'error');
  log(`E2E tests: ${e2eTestsPassed ? 'PASSED' : 'FAILED'}`, e2eTestsPassed ? 'success' : 'error');
  log(`Total retries: ${totalRetries}`, 'info');
  log(`Logs: ${logsDir}`, 'info');
  if (totalCostUsd > 0) {
    log(`Cost: $${totalCostUsd.toFixed(4)}`, 'info');
  }
  log('===================================', 'info');
};

/** Runs the full test workflow including unit and E2E tests with retry. */
export const runTestWorkflow = async (
  providedAdwId: string | null,
  cwd: string | null
): Promise<void> => {
  const adwId = providedAdwId || generateAdwId();
  const logsDir = ensureLogsDirectory(adwId);

  log('===================================', 'info');
  log('ADW Test Workflow', 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log(`Max retry attempts: ${MAX_TEST_RETRY_ATTEMPTS}`, 'info');
  log(`Logs: ${logsDir}`, 'info');
  if (cwd) {
    log(`Working directory: ${cwd}`, 'info');
  }
  log('===================================', 'info');

  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'test-orchestrator');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber: 0,
    agentName: 'test-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { maxRetryAttempts: MAX_TEST_RETRY_ATTEMPTS },
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting ADW Test workflow');

  try {
    let totalCostUsd = 0;
    let totalRetries = 0;

    log('Phase 1: Unit Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting Phase 1: Unit Tests');

    const unitTestsResult = await runUnitTestsWithRetry({
      logsDir,
      orchestratorStatePath,
      maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    });
    totalCostUsd += unitTestsResult.costUsd;
    totalRetries += unitTestsResult.totalRetries;

    let e2eTestsPassed = true;
    if (unitTestsResult.passed) {
      log('Phase 2: E2E Tests', 'info');
      AgentStateManager.appendLog(orchestratorStatePath, 'Starting Phase 2: E2E Tests');

      const e2eTestsResult = await runE2ETestsWithRetry({
        logsDir,
        orchestratorStatePath,
        maxRetries: MAX_TEST_RETRY_ATTEMPTS,
      });
      totalCostUsd += e2eTestsResult.costUsd;
      totalRetries += e2eTestsResult.totalRetries;
      e2eTestsPassed = e2eTestsResult.passed;
    } else {
      log('Skipping E2E tests due to unit test failures', 'info');
      AgentStateManager.appendLog(orchestratorStatePath, 'Skipping E2E tests due to unit test failures');
    }

    const allPassed = unitTestsResult.passed && e2eTestsPassed;
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        allPassed,
        allPassed ? undefined : 'Some tests failed after maximum retry attempts'
      ),
      metadata: {
        maxRetryAttempts: MAX_TEST_RETRY_ATTEMPTS,
        unitTestsPassed: unitTestsResult.passed,
        e2eTestsPassed,
        totalRetries,
        totalCostUsd,
      },
    });

    if (allPassed) {
      AgentStateManager.appendLog(orchestratorStatePath, 'Test workflow completed successfully');
    } else {
      AgentStateManager.appendLog(orchestratorStatePath, 'Test workflow completed with failures');
    }

    printTestSummary(adwId, logsDir, unitTestsResult.passed, e2eTestsPassed, totalRetries, totalCostUsd);

    if (!allPassed) {
      process.exit(1);
    }
  } catch (error) {
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        String(error)
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `Test workflow failed: ${error}`);
    log(`Test workflow failed: ${error}`, 'error');
    process.exit(1);
  }
};
