#!/usr/bin/env npx tsx
/**
 * ADW Test - AI Developer Workflow Testing Phase
 *
 * Usage: npx tsx adws/adwTest.tsx [adw-id]
 *
 * Workflow:
 * 1. Run unit tests using /test command (sonnet model)
 * 2. If tests fail, run /resolve_failed_test for each failure (opus model)
 * 3. Retry unit tests after resolution
 * 4. Discover and run E2E tests using /test_e2e command (sonnet model)
 * 5. If E2E tests fail, run /resolve_failed_e2e_test for each failure (opus model)
 * 6. Retry E2E tests after resolution
 * 7. Continue until all tests pass or MAX_TEST_RETRY_ATTEMPTS exceeded
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts (default: 5)
 */

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  AgentStateManager,
  AgentState,
  MAX_TEST_RETRY_ATTEMPTS,
} from './core';
import {
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  discoverE2ETestFiles,
  TestResult,
  E2ETestResult,
} from './agents';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwTest.tsx [adw-id]');
  console.error('');
  console.error('Runs comprehensive validation tests with automatic failure resolution.');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY        - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH         - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  MAX_TEST_RETRY_ATTEMPTS  - Maximum retry attempts (default: 5)');
  process.exit(1);
}

/**
 * Parses and validates command line arguments.
 */
function parseArguments(args: string[]): { adwId: string } {
  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    printUsageAndExit();
  }

  const adwId = args[0] || generateAdwId();

  return { adwId };
}

/**
 * Prints the test phase summary.
 */
function printTestSummary(
  adwId: string,
  logsDir: string,
  unitTestsPassed: boolean,
  e2eTestsPassed: boolean,
  totalRetries: number,
  totalCostUsd: number
): void {
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
}

/**
 * Runs unit tests with retry logic.
 * Returns true if all tests pass, false otherwise.
 */
async function runUnitTestsWithRetry(
  logsDir: string,
  orchestratorStatePath: string,
  maxRetries: number
): Promise<{ passed: boolean; costUsd: number; totalRetries: number }> {
  let retryCount = 0;
  let costUsd = 0;

  while (retryCount < maxRetries) {
    log(`Running unit tests (attempt ${retryCount + 1}/${maxRetries})...`, 'info');
    AgentStateManager.appendLog(orchestratorStatePath, `Unit test attempt ${retryCount + 1}/${maxRetries}`);

    // Initialize test agent state
    const testAgentStatePath = AgentStateManager.initializeState(
      AgentStateManager.readState(orchestratorStatePath)?.adwId || '',
      'test-agent',
      orchestratorStatePath
    );

    // Run the /test command
    const testResult = await runTestAgent(logsDir, testAgentStatePath);
    costUsd += testResult.totalCostUsd || 0;

    if (!testResult.success) {
      log('Test agent execution failed', 'error');
      AgentStateManager.appendLog(orchestratorStatePath, 'Test agent execution failed');
      retryCount++;
      continue;
    }

    // Check if all tests passed
    if (testResult.allPassed) {
      log(`All ${testResult.testResults.length} tests passed!`, 'success');
      AgentStateManager.appendLog(orchestratorStatePath, `All ${testResult.testResults.length} tests passed`);
      return { passed: true, costUsd, totalRetries: retryCount };
    }

    // Some tests failed - attempt to resolve
    const failedTests = testResult.failedTests;
    log(`${failedTests.length} test(s) failed, attempting resolution...`, 'info');
    AgentStateManager.appendLog(orchestratorStatePath, `${failedTests.length} test(s) failed`);

    // Resolve each failed test
    for (const failedTest of failedTests) {
      log(`Resolving: ${failedTest.test_name}`, 'info');
      AgentStateManager.appendLog(orchestratorStatePath, `Resolving failed test: ${failedTest.test_name}`);

      const resolverStatePath = AgentStateManager.initializeState(
        AgentStateManager.readState(orchestratorStatePath)?.adwId || '',
        'test-resolver-agent',
        orchestratorStatePath
      );

      const resolveResult = await runResolveTestAgent(failedTest, logsDir, resolverStatePath);
      costUsd += resolveResult.totalCostUsd || 0;

      if (!resolveResult.success) {
        log(`Failed to resolve: ${failedTest.test_name}`, 'error');
        AgentStateManager.appendLog(orchestratorStatePath, `Failed to resolve: ${failedTest.test_name}`);
      } else {
        log(`Resolution attempted for: ${failedTest.test_name}`, 'success');
        AgentStateManager.appendLog(orchestratorStatePath, `Resolution attempted for: ${failedTest.test_name}`);
      }
    }

    retryCount++;
  }

  log(`Unit tests still failing after ${maxRetries} attempts`, 'error');
  AgentStateManager.appendLog(orchestratorStatePath, `Unit tests still failing after ${maxRetries} attempts`);
  return { passed: false, costUsd, totalRetries: retryCount };
}

/**
 * Runs E2E tests with retry logic for each test file.
 * Returns true if all E2E tests pass, false otherwise.
 */
async function runE2ETestsWithRetry(
  logsDir: string,
  orchestratorStatePath: string,
  maxRetries: number
): Promise<{ passed: boolean; costUsd: number; totalRetries: number }> {
  const e2eTestFiles = discoverE2ETestFiles();
  let costUsd = 0;
  let totalRetries = 0;

  if (e2eTestFiles.length === 0) {
    log('No E2E test files found in e2e-tests/ directory', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'No E2E test files found - skipping E2E tests');
    return { passed: true, costUsd, totalRetries };
  }

  log(`Discovered ${e2eTestFiles.length} E2E test file(s)`, 'info');
  AgentStateManager.appendLog(orchestratorStatePath, `Discovered ${e2eTestFiles.length} E2E test file(s)`);

  // Track failed E2E tests and their retry counts
  const failedE2ETests: Map<string, { result: E2ETestResult; retryCount: number }> = new Map();

  // Initial run of all E2E tests
  for (const testFile of e2eTestFiles) {
    log(`Running E2E test: ${testFile}`, 'info');
    AgentStateManager.appendLog(orchestratorStatePath, `Running E2E test: ${testFile}`);

    const e2eAgentStatePath = AgentStateManager.initializeState(
      AgentStateManager.readState(orchestratorStatePath)?.adwId || '',
      'test-agent',
      orchestratorStatePath
    );

    const e2eResult = await runE2ETestAgent(testFile, logsDir, e2eAgentStatePath);
    costUsd += e2eResult.totalCostUsd || 0;

    if (!e2eResult.passed && e2eResult.e2eResult) {
      failedE2ETests.set(testFile, { result: e2eResult.e2eResult, retryCount: 0 });
      log(`E2E test failed: ${testFile}`, 'error');
      AgentStateManager.appendLog(orchestratorStatePath, `E2E test failed: ${testFile}`);
    } else if (e2eResult.passed) {
      log(`E2E test passed: ${testFile}`, 'success');
      AgentStateManager.appendLog(orchestratorStatePath, `E2E test passed: ${testFile}`);
    }
  }

  // Retry loop for failed E2E tests
  while (failedE2ETests.size > 0) {
    const testsToRetry = Array.from(failedE2ETests.entries());

    for (const [testFile, { result, retryCount }] of testsToRetry) {
      if (retryCount >= maxRetries) {
        log(`E2E test ${testFile} exceeded max retries`, 'error');
        AgentStateManager.appendLog(orchestratorStatePath, `E2E test ${testFile} exceeded max retries`);
        continue;
      }

      // Attempt to resolve the failure
      log(`Resolving E2E test: ${result.test_name} (attempt ${retryCount + 1}/${maxRetries})`, 'info');
      AgentStateManager.appendLog(orchestratorStatePath, `Resolving E2E test: ${result.test_name}`);

      const resolverStatePath = AgentStateManager.initializeState(
        AgentStateManager.readState(orchestratorStatePath)?.adwId || '',
        'test-resolver-agent',
        orchestratorStatePath
      );

      const resolveResult = await runResolveE2ETestAgent(result, logsDir, resolverStatePath);
      costUsd += resolveResult.totalCostUsd || 0;
      totalRetries++;

      // Re-run the E2E test
      log(`Re-running E2E test: ${testFile}`, 'info');
      const e2eAgentStatePath = AgentStateManager.initializeState(
        AgentStateManager.readState(orchestratorStatePath)?.adwId || '',
        'test-agent',
        orchestratorStatePath
      );

      const retryResult = await runE2ETestAgent(testFile, logsDir, e2eAgentStatePath);
      costUsd += retryResult.totalCostUsd || 0;

      if (retryResult.passed) {
        failedE2ETests.delete(testFile);
        log(`E2E test now passing: ${testFile}`, 'success');
        AgentStateManager.appendLog(orchestratorStatePath, `E2E test now passing: ${testFile}`);
      } else if (retryResult.e2eResult) {
        failedE2ETests.set(testFile, { result: retryResult.e2eResult, retryCount: retryCount + 1 });
        log(`E2E test still failing: ${testFile}`, 'error');
        AgentStateManager.appendLog(orchestratorStatePath, `E2E test still failing: ${testFile}`);
      }
    }

    // Check if all remaining tests have exceeded max retries
    const allExceededMaxRetries = Array.from(failedE2ETests.values()).every(
      ({ retryCount }) => retryCount >= maxRetries
    );
    if (allExceededMaxRetries) {
      break;
    }
  }

  const allPassed = failedE2ETests.size === 0;
  if (allPassed) {
    log('All E2E tests passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'All E2E tests passed');
  } else {
    log(`${failedE2ETests.size} E2E test(s) still failing`, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, `${failedE2ETests.size} E2E test(s) still failing`);
  }

  return { passed: allPassed, costUsd, totalRetries };
}

/**
 * Main test workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { adwId } = parseArguments(args);

  const logsDir = ensureLogsDirectory(adwId);

  log('===================================', 'info');
  log('ADW Test Workflow', 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log(`Max retry attempts: ${MAX_TEST_RETRY_ATTEMPTS}`, 'info');
  log(`Logs: ${logsDir}`, 'info');
  log('===================================', 'info');

  // Initialize orchestrator state
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'test-orchestrator');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber: 0, // Test workflow doesn't require an issue number
    agentName: 'test-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: {
      maxRetryAttempts: MAX_TEST_RETRY_ATTEMPTS,
    },
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting ADW Test workflow');

  try {
    let totalCostUsd = 0;
    let totalRetries = 0;

    // Phase 1: Run Unit Tests
    log('Phase 1: Unit Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting Phase 1: Unit Tests');

    const unitTestsResult = await runUnitTestsWithRetry(
      logsDir,
      orchestratorStatePath,
      MAX_TEST_RETRY_ATTEMPTS
    );
    totalCostUsd += unitTestsResult.costUsd;
    totalRetries += unitTestsResult.totalRetries;

    // Phase 2: Run E2E Tests (only if unit tests pass)
    let e2eTestsPassed = true;
    if (unitTestsResult.passed) {
      log('Phase 2: E2E Tests', 'info');
      AgentStateManager.appendLog(orchestratorStatePath, 'Starting Phase 2: E2E Tests');

      const e2eTestsResult = await runE2ETestsWithRetry(
        logsDir,
        orchestratorStatePath,
        MAX_TEST_RETRY_ATTEMPTS
      );
      totalCostUsd += e2eTestsResult.costUsd;
      totalRetries += e2eTestsResult.totalRetries;
      e2eTestsPassed = e2eTestsResult.passed;
    } else {
      log('Skipping E2E tests due to unit test failures', 'info');
      AgentStateManager.appendLog(orchestratorStatePath, 'Skipping E2E tests due to unit test failures');
    }

    // Update final orchestrator state
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

    // Print summary
    printTestSummary(
      adwId,
      logsDir,
      unitTestsResult.passed,
      e2eTestsPassed,
      totalRetries,
      totalCostUsd
    );

    // Exit with appropriate code
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
}

main();
