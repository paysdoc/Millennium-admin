/**
 * E2E test retry logic with per-file retry tracking.
 * Split from testRetry.ts due to the more complex per-test retry model.
 */
import { log, AgentStateManager, type AgentIdentifier } from '../core';
import { reduceAsync, addCost, emptyRetryCost, type RetryCost } from '../core/retryUtils';
import {
  runE2ETestAgent, runResolveE2ETestAgent, discoverE2ETestFiles, isValidE2ETestResult,
  type E2ETestResult,
} from './testAgent';
import type { TestRetryResult, TestRetryOptions } from './testRetry';

interface FailedE2EEntry {
  readonly testFile: string;
  readonly result: E2ETestResult;
  readonly retryCount: number;
}

const getAdwId = (statePath: string): string =>
  AgentStateManager.readState(statePath)?.adwId || '';
const initState = (statePath: string, agentName: AgentIdentifier): string =>
  AgentStateManager.initializeState(getAdwId(statePath), agentName, statePath);
const logAndAppend = (statePath: string, msg: string, level: 'info' | 'error' | 'success') => {
  log(msg, level);
  AgentStateManager.appendLog(statePath, msg);
};

/** Run initial E2E tests for all discovered files, returning failures and costs. */
const runInitialE2ETests = (
  testFiles: readonly string[], logsDir: string, statePath: string, cwd: string | undefined,
): Promise<{ failures: readonly FailedE2EEntry[]; cost: RetryCost }> =>
  reduceAsync(testFiles, async (acc, testFile) => {
    logAndAppend(statePath, `Running E2E test: ${testFile}`, 'info');
    const e2eResult = await runE2ETestAgent(testFile, logsDir, initState(statePath, 'test-agent'), cwd);
    const updatedCost = addCost(acc.cost, e2eResult.totalCostUsd || 0, e2eResult.modelUsage);
    if (!e2eResult.passed && e2eResult.e2eResult) {
      logAndAppend(statePath, `E2E test failed: ${testFile}`, 'error');
      return { failures: [...acc.failures, { testFile, result: e2eResult.e2eResult, retryCount: 0 }], cost: updatedCost };
    }
    if (e2eResult.passed) logAndAppend(statePath, `E2E test passed: ${testFile}`, 'success');
    return { ...acc, cost: updatedCost };
  }, { failures: [] as readonly FailedE2EEntry[], cost: emptyRetryCost() });

/** Recursively retry failed E2E tests until all pass or max retries exhausted. */
const retryFailedE2ETests = async (
  failures: readonly FailedE2EEntry[], logsDir: string, statePath: string,
  maxRetries: number, cwd: string | undefined, onTestFailed: TestRetryOptions['onTestFailed'],
  cost: RetryCost, totalRetries: number,
): Promise<{ failures: readonly FailedE2EEntry[]; cost: RetryCost; totalRetries: number }> => {
  if (failures.length === 0 || failures.every(({ retryCount }) => retryCount >= maxRetries))
    return { failures, cost, totalRetries };

  onTestFailed?.(Math.min(...failures.map(({ retryCount }) => retryCount)) + 1, maxRetries);

  const processed = await reduceAsync(failures, async (acc, entry) => {
    if (entry.retryCount >= maxRetries) {
      logAndAppend(statePath, `E2E test ${entry.testFile} exceeded max retries`, 'error');
      return { ...acc, remaining: [...acc.remaining, entry] };
    }
    if (!isValidE2ETestResult(entry.result)) {
      logAndAppend(statePath, `Skipping E2E test resolution: missing or invalid test_name`, 'error');
      return { ...acc, remaining: [...acc.remaining, { ...entry, retryCount: entry.retryCount + 1 }] };
    }
    const testName = entry.result.test_name ?? 'unknown';
    logAndAppend(statePath, `Resolving E2E test: ${testName} (attempt ${entry.retryCount + 1}/${maxRetries})`, 'info');

    const resolveResult = await runResolveE2ETestAgent(entry.result, logsDir, initState(statePath, 'test-resolver-agent'), cwd);
    let updatedCost = addCost(acc.cost, resolveResult.totalCostUsd || 0, resolveResult.modelUsage);

    logAndAppend(statePath, `Re-running E2E test: ${entry.testFile}`, 'info');
    const retryResult = await runE2ETestAgent(entry.testFile, logsDir, initState(statePath, 'test-agent'), cwd);
    updatedCost = addCost(updatedCost, retryResult.totalCostUsd || 0, retryResult.modelUsage);

    if (retryResult.passed) {
      logAndAppend(statePath, `E2E test now passing: ${entry.testFile}`, 'success');
      return { cost: updatedCost, remaining: acc.remaining, retries: acc.retries + 1 };
    }
    const updated: FailedE2EEntry = retryResult.e2eResult
      ? { testFile: entry.testFile, result: retryResult.e2eResult, retryCount: entry.retryCount + 1 }
      : { ...entry, retryCount: entry.retryCount + 1 };
    logAndAppend(statePath, `E2E test still failing: ${entry.testFile}`, 'error');
    return { cost: updatedCost, remaining: [...acc.remaining, updated], retries: acc.retries + 1 };
  }, { cost, remaining: [] as readonly FailedE2EEntry[], retries: 0 });

  return retryFailedE2ETests(
    processed.remaining, logsDir, statePath, maxRetries, cwd, onTestFailed,
    processed.cost, totalRetries + processed.retries,
  );
};

export async function runE2ETestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;
  const e2eTestFiles = discoverE2ETestFiles(cwd);

  if (e2eTestFiles.length === 0) {
    log('No E2E test files found in e2e-tests/ directory', 'info');
    AgentStateManager.appendLog(statePath, 'No E2E test files found - skipping E2E tests');
    return { passed: true, costUsd: 0, totalRetries: 0, failedTests: [], modelUsage: {} };
  }

  logAndAppend(statePath, `Discovered ${e2eTestFiles.length} E2E test file(s)`, 'info');
  const initial = await runInitialE2ETests(e2eTestFiles, logsDir, statePath, cwd);
  const final = await retryFailedE2ETests(
    initial.failures, logsDir, statePath, maxRetries, cwd, onTestFailed, initial.cost, 0,
  );
  const allPassed = final.failures.length === 0;
  const msg = allPassed ? 'All E2E tests passed!' : `${final.failures.length} E2E test(s) still failing`;
  logAndAppend(statePath, msg, allPassed ? 'success' : 'error');
  return {
    passed: allPassed, costUsd: final.cost.costUsd, totalRetries: final.totalRetries,
    failedTests: final.failures.map(({ result }) => result.test_name), modelUsage: final.cost.modelUsage,
  };
}
