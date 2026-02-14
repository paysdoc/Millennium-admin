/**
 * Shared test retry logic for unit and E2E tests.
 * Used by both adwTest.tsx and adwPrReview.tsx workflows.
 *
 * Unit test retries use the recursive retryRecursive utility.
 * E2E test retries are in e2eTestRetry.ts (per-file retry tracking).
 */

import { log, AgentStateManager, type AgentIdentifier, type ModelUsageMap } from '../core';
import { retryRecursive, reduceAsync, addCost, emptyRetryCost, type RetryCost } from '../core/retryUtils';
import { runTestAgent, runResolveTestAgent, type TestResult } from './testAgent';

export { runE2ETestsWithRetry } from './e2eTestRetry';

export interface TestRetryResult {
  passed: boolean;
  costUsd: number;
  totalRetries: number;
  failedTests: string[];
  modelUsage: ModelUsageMap;
}

export interface TestRetryOptions {
  logsDir: string;
  orchestratorStatePath: string;
  maxRetries: number;
  onTestFailed?: (attempt: number, maxAttempts: number) => void;
  /** Optional working directory for agent operations (defaults to process.cwd()) */
  cwd?: string;
}

const getAdwId = (statePath: string): string =>
  AgentStateManager.readState(statePath)?.adwId || '';

const initState = (statePath: string, agentName: AgentIdentifier): string =>
  AgentStateManager.initializeState(getAdwId(statePath), agentName, statePath);

/** Resolve all failed tests sequentially, accumulating costs immutably. */
const resolveFailedTests = (
  failedTests: readonly TestResult[],
  logsDir: string,
  statePath: string,
  cwd: string | undefined,
): Promise<RetryCost> =>
  reduceAsync(
    failedTests,
    async (cost, failedTest) => {
      log(`Resolving: ${failedTest.test_name}`, 'info');
      AgentStateManager.appendLog(statePath, `Resolving failed test: ${failedTest.test_name}`);
      const result = await runResolveTestAgent(failedTest, logsDir, initState(statePath, 'test-resolver-agent'), cwd);
      const msg = result.success ? 'Resolution attempted for' : 'Failed to resolve';
      log(`${msg}: ${failedTest.test_name}`, result.success ? 'success' : 'error');
      AgentStateManager.appendLog(statePath, `${msg}: ${failedTest.test_name}`);
      return addCost(cost, result.totalCostUsd || 0, result.modelUsage);
    },
    emptyRetryCost(),
  );

export async function runUnitTestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;

  let cost: RetryCost = emptyRetryCost();
  let lastFailedTests: readonly TestResult[] = [];

  const { result: passed, attempts } = await retryRecursive(
    async (attempt) => {
      log(`Running unit tests (attempt ${attempt + 1}/${maxRetries})...`, 'info');
      AgentStateManager.appendLog(statePath, `Unit test attempt ${attempt + 1}/${maxRetries}`);

      const testResult = await runTestAgent(logsDir, initState(statePath, 'test-agent'), cwd);
      cost = addCost(cost, testResult.totalCostUsd || 0, testResult.modelUsage);

      if (!testResult.success) {
        log('Test agent execution failed', 'error');
        AgentStateManager.appendLog(statePath, 'Test agent execution failed');
        return { done: false, value: false };
      }

      if (testResult.allPassed) {
        log(`All ${testResult.testResults.length} tests passed!`, 'success');
        AgentStateManager.appendLog(statePath, `All ${testResult.testResults.length} tests passed`);
        lastFailedTests = [];
        return { done: true, value: true };
      }

      lastFailedTests = testResult.failedTests;
      log(`${lastFailedTests.length} test(s) failed, attempting resolution...`, 'info');
      AgentStateManager.appendLog(statePath, `${lastFailedTests.length} test(s) failed`);
      onTestFailed?.(attempt + 1, maxRetries);

      const resolveCost = await resolveFailedTests(lastFailedTests, logsDir, statePath, cwd);
      cost = addCost(cost, resolveCost.costUsd, resolveCost.modelUsage);
      return { done: false, value: false };
    },
    { maxRetries },
  );

  if (!passed) {
    log(`Unit tests still failing after ${maxRetries} attempts`, 'error');
    AgentStateManager.appendLog(statePath, `Unit tests still failing after ${maxRetries} attempts`);
  }

  return {
    passed,
    costUsd: cost.costUsd,
    totalRetries: passed ? attempts - 1 : attempts,
    failedTests: lastFailedTests.map(t => t.test_name),
    modelUsage: cost.modelUsage,
  };
}
