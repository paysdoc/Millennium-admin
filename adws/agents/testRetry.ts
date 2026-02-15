/**
 * Shared test retry logic for unit and E2E tests.
 * Used by both adwTest.tsx and adwPrReview.tsx workflows.
 */

import { log, AgentStateManager, AgentIdentifier, type ModelUsageMap, mergeModelUsageMaps, emptyModelUsageMap, persistTokenCounts } from '../core';
import {
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  discoverE2ETestFiles,
  isValidE2ETestResult,
  TestResult,
  E2ETestResult,
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

function getAdwId(statePath: string): string {
  return AgentStateManager.readState(statePath)?.adwId || '';
}

function initState(statePath: string, agentName: AgentIdentifier): string {
  return AgentStateManager.initializeState(getAdwId(statePath), agentName, statePath);
}

export async function runUnitTestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;
  let retryCount = 0, costUsd = 0, lastFailedTests: TestResult[] = [];
  let modelUsage = emptyModelUsageMap();

  while (retryCount < maxRetries) {
    log(`Running unit tests (attempt ${retryCount + 1}/${maxRetries})...`, 'info');
    AgentStateManager.appendLog(statePath, `Unit test attempt ${retryCount + 1}/${maxRetries}`);

    const testResult = await runTestAgent(logsDir, initState(statePath, 'test-agent'), cwd);
    costUsd += testResult.totalCostUsd || 0;
    if (testResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, testResult.modelUsage);
    persistTokenCounts(statePath, costUsd, modelUsage);

    if (!testResult.success) {
      log('Test agent execution failed', 'error');
      AgentStateManager.appendLog(statePath, 'Test agent execution failed');
      retryCount++;
      continue;
    }

    if (testResult.allPassed) {
      log(`All ${testResult.testResults.length} tests passed!`, 'success');
      AgentStateManager.appendLog(statePath, `All ${testResult.testResults.length} tests passed`);
      return { passed: true, costUsd, totalRetries: retryCount, failedTests: [], modelUsage };
    }

    lastFailedTests = testResult.failedTests;
    log(`${lastFailedTests.length} test(s) failed, attempting resolution...`, 'info');
    AgentStateManager.appendLog(statePath, `${lastFailedTests.length} test(s) failed`);
    onTestFailed?.(retryCount + 1, maxRetries);

    for (const failedTest of lastFailedTests) {
      log(`Resolving: ${failedTest.test_name}`, 'info');
      AgentStateManager.appendLog(statePath, `Resolving failed test: ${failedTest.test_name}`);
      const result = await runResolveTestAgent(failedTest, logsDir, initState(statePath, 'test-resolver-agent'), cwd);
      costUsd += result.totalCostUsd || 0;
      if (result.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, result.modelUsage);
      persistTokenCounts(statePath, costUsd, modelUsage);
      const msg = result.success ? 'Resolution attempted for' : 'Failed to resolve';
      log(`${msg}: ${failedTest.test_name}`, result.success ? 'success' : 'error');
      AgentStateManager.appendLog(statePath, `${msg}: ${failedTest.test_name}`);
    }
    retryCount++;
  }

  log(`Unit tests still failing after ${maxRetries} attempts`, 'error');
  AgentStateManager.appendLog(statePath, `Unit tests still failing after ${maxRetries} attempts`);
  return { passed: false, costUsd, totalRetries: retryCount, failedTests: lastFailedTests.map(t => t.test_name), modelUsage };
}

export async function runE2ETestsWithRetry(opts: TestRetryOptions): Promise<TestRetryResult> {
  const { logsDir, orchestratorStatePath: statePath, maxRetries, onTestFailed, cwd } = opts;
  const e2eTestFiles = discoverE2ETestFiles(cwd);
  let costUsd = 0, totalRetries = 0;
  let modelUsage = emptyModelUsageMap();

  if (e2eTestFiles.length === 0) {
    log('No E2E test files found in e2e-tests/ directory', 'info');
    AgentStateManager.appendLog(statePath, 'No E2E test files found - skipping E2E tests');
    return { passed: true, costUsd, totalRetries, failedTests: [], modelUsage };
  }

  log(`Discovered ${e2eTestFiles.length} E2E test file(s)`, 'info');
  AgentStateManager.appendLog(statePath, `Discovered ${e2eTestFiles.length} E2E test file(s)`);

  const failedE2ETests: Map<string, { result: E2ETestResult; retryCount: number }> = new Map();

  for (const testFile of e2eTestFiles) {
    log(`Running E2E test: ${testFile}`, 'info');
    AgentStateManager.appendLog(statePath, `Running E2E test: ${testFile}`);
    const e2eResult = await runE2ETestAgent(testFile, logsDir, initState(statePath, 'test-agent'), cwd);
    costUsd += e2eResult.totalCostUsd || 0;
    if (e2eResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, e2eResult.modelUsage);
    persistTokenCounts(statePath, costUsd, modelUsage);

    if (!e2eResult.passed && e2eResult.e2eResult) {
      failedE2ETests.set(testFile, { result: e2eResult.e2eResult, retryCount: 0 });
      log(`E2E test failed: ${testFile}`, 'error');
      AgentStateManager.appendLog(statePath, `E2E test failed: ${testFile}`);
    } else if (e2eResult.passed) {
      log(`E2E test passed: ${testFile}`, 'success');
      AgentStateManager.appendLog(statePath, `E2E test passed: ${testFile}`);
    }
  }

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

      // Skip resolution if the result is missing a valid test_name
      if (!isValidE2ETestResult(result)) {
        log(`Skipping E2E test resolution: missing or invalid test_name`, 'error');
        AgentStateManager.appendLog(statePath, `Skipping E2E test resolution: missing or invalid test_name`);
        failedE2ETests.set(testFile, { result, retryCount: retryCount + 1 });
        continue;
      }

      log(`Resolving E2E test: ${result.test_name ?? 'unknown'} (attempt ${retryCount + 1}/${maxRetries})`, 'info');
      AgentStateManager.appendLog(statePath, `Resolving E2E test: ${result.test_name ?? 'unknown'}`);

      const resolveResult = await runResolveE2ETestAgent(result, logsDir, initState(statePath, 'test-resolver-agent'), cwd);
      costUsd += resolveResult.totalCostUsd || 0;
      if (resolveResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, resolveResult.modelUsage);
      persistTokenCounts(statePath, costUsd, modelUsage);
      totalRetries++;

      log(`Re-running E2E test: ${testFile}`, 'info');
      const retryResult = await runE2ETestAgent(testFile, logsDir, initState(statePath, 'test-agent'), cwd);
      costUsd += retryResult.totalCostUsd || 0;
      if (retryResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, retryResult.modelUsage);
      persistTokenCounts(statePath, costUsd, modelUsage);

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
  return { passed: allPassed, costUsd, totalRetries, failedTests: failedTestNames, modelUsage };
}
