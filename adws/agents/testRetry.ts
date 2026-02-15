/**
 * Shared test retry logic for unit and E2E tests.
 * Used by both adwTest.tsx and adwPrReview.tsx workflows.
 */

import { log, AgentStateManager, type ModelUsageMap, mergeModelUsageMaps, emptyModelUsageMap, persistTokenCounts } from '../core';
import { retryWithResolution, initAgentState, trackCost, type AgentRunResult } from '../core/retryOrchestrator';
import {
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  discoverE2ETestFiles,
  isValidE2ETestResult,
  TestResult,
  E2ETestResult,
  type TestAgentResult,
} from './testAgent';

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

export async function runUnitTestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;

  const result = await retryWithResolution<TestAgentResult, TestResult>({
    maxRetries,
    statePath,
    label: 'unit tests',
    run: () => runTestAgent(logsDir, initAgentState(statePath, 'test-agent'), cwd),
    isPassed: (r) => r.allPassed,
    extractFailures: (r) => r.failedTests,
    onRetryFailed: onTestFailed,
    resolveFailures: async (failures) => {
      let costUsd = 0;
      let modelUsage = emptyModelUsageMap();

      for (const failedTest of failures) {
        log(`Resolving: ${failedTest.test_name}`, 'info');
        AgentStateManager.appendLog(statePath, `Resolving failed test: ${failedTest.test_name}`);
        const resolveResult = await runResolveTestAgent(failedTest, logsDir, initAgentState(statePath, 'test-resolver-agent'), cwd);
        costUsd += resolveResult.totalCostUsd || 0;
        if (resolveResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, resolveResult.modelUsage);
        persistTokenCounts(statePath, costUsd, modelUsage);
        const msg = resolveResult.success ? 'Resolution attempted for' : 'Failed to resolve';
        log(`${msg}: ${failedTest.test_name}`, resolveResult.success ? 'success' : 'error');
        AgentStateManager.appendLog(statePath, `${msg}: ${failedTest.test_name}`);
      }

      return { success: true, totalCostUsd: costUsd, modelUsage };
    },
  });

  return {
    passed: result.passed,
    costUsd: result.costUsd,
    totalRetries: result.totalRetries,
    failedTests: result.failures.map(t => t.test_name),
    modelUsage: result.modelUsage,
  };
}

export async function runE2ETestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;
  const e2eTestFiles = discoverE2ETestFiles(cwd);
  const costState = { costUsd: 0, modelUsage: emptyModelUsageMap() };
  let totalRetries = 0;

  if (e2eTestFiles.length === 0) {
    log('No E2E test files found in e2e-tests/ directory', 'info');
    AgentStateManager.appendLog(statePath, 'No E2E test files found - skipping E2E tests');
    return { passed: true, costUsd: 0, totalRetries, failedTests: [], modelUsage: costState.modelUsage };
  }

  log(`Discovered ${e2eTestFiles.length} E2E test file(s)`, 'info');
  AgentStateManager.appendLog(statePath, `Discovered ${e2eTestFiles.length} E2E test file(s)`);

  const failedE2ETests: Map<string, { result: E2ETestResult; retryCount: number }> = new Map();

  // Initial run of all E2E tests
  for (const testFile of e2eTestFiles) {
    log(`Running E2E test: ${testFile}`, 'info');
    AgentStateManager.appendLog(statePath, `Running E2E test: ${testFile}`);
    const e2eResult = await runE2ETestAgent(testFile, logsDir, initAgentState(statePath, 'test-agent'), cwd);
    trackCost(e2eResult as AgentRunResult, costState, statePath);

    if (!e2eResult.passed && e2eResult.e2eResult) {
      failedE2ETests.set(testFile, { result: e2eResult.e2eResult, retryCount: 0 });
      log(`E2E test failed: ${testFile}`, 'error');
      AgentStateManager.appendLog(statePath, `E2E test failed: ${testFile}`);
    } else if (e2eResult.passed) {
      log(`E2E test passed: ${testFile}`, 'success');
      AgentStateManager.appendLog(statePath, `E2E test passed: ${testFile}`);
    }
  }

  // Retry loop for failed E2E tests
  while (failedE2ETests.size > 0) {
    const testsToRetry = Array.from(failedE2ETests.entries());
    if (testsToRetry.every(([, { retryCount }]) => retryCount >= maxRetries)) break;

    onTestFailed?.(Math.min(...testsToRetry.map(([, { retryCount }]) => retryCount)) + 1, maxRetries);

    for (const [testFile, { result, retryCount }] of testsToRetry) {
      if (retryCount >= maxRetries) {
        log(`E2E test ${testFile} exceeded max retries`, 'error');
        AgentStateManager.appendLog(statePath, `E2E test ${testFile} exceeded max retries`);
        continue;
      }

      if (!isValidE2ETestResult(result)) {
        log(`Skipping E2E test resolution: missing or invalid test_name`, 'error');
        AgentStateManager.appendLog(statePath, `Skipping E2E test resolution: missing or invalid test_name`);
        failedE2ETests.set(testFile, { result, retryCount: retryCount + 1 });
        continue;
      }

      log(`Resolving E2E test: ${result.test_name ?? 'unknown'} (attempt ${retryCount + 1}/${maxRetries})`, 'info');
      AgentStateManager.appendLog(statePath, `Resolving E2E test: ${result.test_name ?? 'unknown'}`);

      const resolveResult = await runResolveE2ETestAgent(result, logsDir, initAgentState(statePath, 'test-resolver-agent'), cwd);
      trackCost(resolveResult as AgentRunResult, costState, statePath);
      totalRetries++;

      log(`Re-running E2E test: ${testFile}`, 'info');
      const retryResult = await runE2ETestAgent(testFile, logsDir, initAgentState(statePath, 'test-agent'), cwd);
      trackCost(retryResult as AgentRunResult, costState, statePath);

      if (retryResult.passed) {
        failedE2ETests.delete(testFile);
        log(`E2E test now passing: ${testFile}`, 'success');
        AgentStateManager.appendLog(statePath, `E2E test now passing: ${testFile}`);
      } else if (retryResult.e2eResult) {
        failedE2ETests.set(testFile, { result: retryResult.e2eResult, retryCount: retryCount + 1 });
        log(`E2E test still failing: ${testFile}`, 'error');
        AgentStateManager.appendLog(statePath, `E2E test still failing: ${testFile}`);
      }
    }
  }

  const allPassed = failedE2ETests.size === 0;
  const failedTestNames = Array.from(failedE2ETests.values()).map(({ result }) => result.test_name);
  const msg = allPassed ? 'All E2E tests passed' : `${failedE2ETests.size} E2E test(s) still failing`;
  log(msg + (allPassed ? '!' : ''), allPassed ? 'success' : 'error');
  AgentStateManager.appendLog(statePath, msg);
  return { passed: allPassed, costUsd: costState.costUsd, totalRetries, failedTests: failedTestNames, modelUsage: costState.modelUsage };
}
