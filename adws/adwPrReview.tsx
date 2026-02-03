#!/usr/bin/env npx tsx
/**
 * ADW PR Review - AI Developer Workflow for PR Review Comments
 *
 * Usage: npx tsx adws/adwPrReview.tsx <pr-number>
 *
 * Workflow:
 * 1. Fetch PR details and review comments
 * 2. Detect unaddressed review comments
 * 3. Run Plan Agent to create revision plan
 * 4. Run Build Agent to implement changes
 * 5. Run validation tests with automatic failure resolution
 * 6. Commit and push to the PR branch (only if tests pass)
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 */

import * as fs from 'fs';
import { log, generateAdwId, ensureLogsDirectory, commitPrefixMap, AgentStateManager, AgentState, MAX_TEST_RETRY_ATTEMPTS } from './core';
import {
  fetchPRDetails,
  checkoutBranch,
  commitChanges,
  pushBranch,
  postPRWorkflowComment,
  PRReviewWorkflowContext,
  getUnaddressedComments,
  inferIssueTypeFromBranch,
} from './github';
import {
  runPrReviewPlanAgent,
  getPlanFilePath,
  runPrReviewBuildAgent,
  ProgressCallback,
  ProgressInfo,
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  discoverE2ETestFiles,
  TestResult,
  E2ETestResult,
} from './agents';

/**
 * Result from running tests with retry logic.
 */
interface TestRetryResult {
  passed: boolean;
  costUsd: number;
  totalRetries: number;
  failedTests: string[];
}

/**
 * Runs unit tests with retry logic.
 * Returns result including pass status, cost, retry count, and failed test names.
 */
async function runUnitTestsWithRetry(
  logsDir: string,
  orchestratorStatePath: string,
  maxRetries: number,
  prNumber: number,
  ctx: PRReviewWorkflowContext
): Promise<TestRetryResult> {
  let retryCount = 0;
  let costUsd = 0;
  let lastFailedTests: TestResult[] = [];

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
      return { passed: true, costUsd, totalRetries: retryCount, failedTests: [] };
    }

    // Some tests failed - attempt to resolve
    lastFailedTests = testResult.failedTests;
    log(`${lastFailedTests.length} test(s) failed, attempting resolution...`, 'info');
    AgentStateManager.appendLog(orchestratorStatePath, `${lastFailedTests.length} test(s) failed`);

    // Post test failed comment
    ctx.testAttempt = retryCount + 1;
    ctx.maxTestAttempts = maxRetries;
    postPRWorkflowComment(prNumber, 'pr_review_test_failed', ctx);

    // Resolve each failed test
    for (const failedTest of lastFailedTests) {
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
  return {
    passed: false,
    costUsd,
    totalRetries: retryCount,
    failedTests: lastFailedTests.map(t => t.test_name),
  };
}

/**
 * Runs E2E tests with retry logic.
 * Returns result including pass status, cost, retry count, and failed test names.
 */
async function runE2ETestsWithRetry(
  logsDir: string,
  orchestratorStatePath: string,
  maxRetries: number,
  prNumber: number,
  ctx: PRReviewWorkflowContext
): Promise<TestRetryResult> {
  const e2eTestFiles = discoverE2ETestFiles();
  let costUsd = 0;
  let totalRetries = 0;

  if (e2eTestFiles.length === 0) {
    log('No E2E test files found in e2e-tests/ directory', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'No E2E test files found - skipping E2E tests');
    return { passed: true, costUsd, totalRetries, failedTests: [] };
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

    // Check if all remaining tests have exceeded max retries
    const allExceededMaxRetries = testsToRetry.every(([, { retryCount }]) => retryCount >= maxRetries);
    if (allExceededMaxRetries) {
      break;
    }

    // Post test failed comment
    ctx.testAttempt = Math.min(...testsToRetry.map(([, { retryCount }]) => retryCount)) + 1;
    ctx.maxTestAttempts = maxRetries;
    postPRWorkflowComment(prNumber, 'pr_review_test_failed', ctx);

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
  }

  const allPassed = failedE2ETests.size === 0;
  const failedTestNames = Array.from(failedE2ETests.values()).map(({ result }) => result.test_name);

  if (allPassed) {
    log('All E2E tests passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'All E2E tests passed');
  } else {
    log(`${failedE2ETests.size} E2E test(s) still failing`, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, `${failedE2ETests.size} E2E test(s) still failing`);
  }

  return { passed: allPassed, costUsd, totalRetries, failedTests: failedTestNames };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: npx tsx adws/adwPrReview.tsx <pr-number>');
    process.exit(1);
  }

  const prNumber = parseInt(args[0], 10);
  if (isNaN(prNumber)) {
    console.error(`Invalid PR number: ${args[0]}`);
    process.exit(1);
  }

  log(`Starting ADW PR Review workflow for PR #${prNumber}`, 'info');

  // Step 1: Fetch PR details
  const prDetails = fetchPRDetails(prNumber);
  log(`Fetched PR: ${prDetails.title}`, 'success');

  // Exit early if PR is closed or merged
  if (prDetails.state === 'CLOSED' || prDetails.state === 'MERGED') {
    log(`PR #${prNumber} is ${prDetails.state}, skipping`, 'info');
    return;
  }

  // Step 2: Detect unaddressed review comments
  const unaddressedComments = getUnaddressedComments(prNumber);

  if (unaddressedComments.length === 0) {
    log(`No unaddressed review comments on PR #${prNumber}, exiting`, 'info');
    return;
  }

  log(`Found ${unaddressedComments.length} unaddressed review comment(s)`, 'info');

  // Step 3: Generate ADW ID and create logs directory
  const adwId = generateAdwId();
  const logsDir = ensureLogsDirectory(adwId);
  log(`ADW ID: ${adwId}`, 'info');

  const issueNumber = prDetails.issueNumber;

  // Initialize orchestrator state directory
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  // Write initial orchestrator state
  const initialOrchestratorState: Partial<AgentState> = {
    adwId,
    issueNumber: issueNumber || 0,
    branchName: prDetails.headBranch,
    agentName: 'orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: {
      prNumber,
      reviewComments: unaddressedComments.length,
    },
  };
  AgentStateManager.writeState(orchestratorStatePath, initialOrchestratorState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting PR Review workflow for PR #${prNumber}`);

  const ctx: PRReviewWorkflowContext = {
    issueNumber: issueNumber || 0,
    adwId,
    prNumber,
    reviewComments: unaddressedComments.length,
    branchName: prDetails.headBranch,
  };

  // Step 4: Post starting comment on PR
  postPRWorkflowComment(prNumber, 'pr_review_starting', ctx);

  try {
    // Step 5: Checkout the PR's head branch
    checkoutBranch(prDetails.headBranch);

    // Step 6: Read existing plan file
    let existingPlanContent = '';
    if (issueNumber) {
      const planPath = getPlanFilePath(issueNumber);
      try {
        existingPlanContent = fs.readFileSync(planPath, 'utf-8');
        log(`Read existing plan from ${planPath}`, 'success');
      } catch {
        log(`No existing plan file found at ${planPath}, using PR body as context`, 'info');
        existingPlanContent = prDetails.body;
      }
    } else {
      log('No issue number found in PR body, using PR body as context', 'info');
      existingPlanContent = prDetails.body;
    }

    // Step 7: Run PR Review Plan Agent
    postPRWorkflowComment(prNumber, 'pr_review_planning', ctx);
    log('Running PR Review Plan Agent...', 'info');

    // Initialize plan agent state
    const planAgentStatePath = AgentStateManager.initializeState(adwId, 'pr-review-plan-agent', orchestratorStatePath);
    AgentStateManager.writeState(planAgentStatePath, {
      adwId,
      issueNumber: issueNumber || 0,
      branchName: prDetails.headBranch,
      agentName: 'pr-review-plan-agent',
      parentAgent: 'orchestrator',
      execution: AgentStateManager.createExecutionState('running'),
      metadata: {
        prNumber,
        reviewComments: unaddressedComments.length,
      },
    });

    const planResult = await runPrReviewPlanAgent(
      prDetails,
      unaddressedComments,
      existingPlanContent,
      logsDir,
      planAgentStatePath
    );

    if (!planResult.success) {
      AgentStateManager.writeState(planAgentStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          planResult.output
        ),
      });
      throw new Error(`PR Review Plan Agent failed: ${planResult.output}`);
    }

    // Update plan agent state with result
    AgentStateManager.writeState(planAgentStatePath, {
      output: planResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review Plan completed');

    ctx.revisionPlanOutput = planResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_planned', ctx);

    // Step 8: Run PR Review Build Agent
    postPRWorkflowComment(prNumber, 'pr_review_implementing', ctx);
    log('Running PR Review Build Agent...', 'info');

    // Initialize build agent state
    const buildAgentStatePath = AgentStateManager.initializeState(adwId, 'pr-review-build-agent', orchestratorStatePath);
    AgentStateManager.writeState(buildAgentStatePath, {
      adwId,
      issueNumber: issueNumber || 0,
      branchName: prDetails.headBranch,
      agentName: 'pr-review-build-agent',
      parentAgent: 'orchestrator',
      execution: AgentStateManager.createExecutionState('running'),
      metadata: {
        prNumber,
        reviewComments: unaddressedComments.length,
      },
    });

    const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
      if (info.type === 'tool_use') {
        log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
      }
    };

    const buildResult = await runPrReviewBuildAgent(
      prDetails,
      planResult.output,
      logsDir,
      buildProgressCallback,
      buildAgentStatePath
    );

    if (!buildResult.success) {
      AgentStateManager.writeState(buildAgentStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          buildResult.output
        ),
      });
      throw new Error(`PR Review Build Agent failed: ${buildResult.output}`);
    }

    // Update build agent state with result
    AgentStateManager.writeState(buildAgentStatePath, {
      output: buildResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review Build completed');

    ctx.revisionBuildOutput = buildResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_implemented', ctx);

    // Step 9: Run validation tests before committing
    postPRWorkflowComment(prNumber, 'pr_review_testing', ctx);
    log('Running validation tests...', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting validation tests');

    // Run unit tests with retry logic
    const unitTestsResult = await runUnitTestsWithRetry(
      logsDir,
      orchestratorStatePath,
      MAX_TEST_RETRY_ATTEMPTS,
      prNumber,
      ctx
    );

    if (!unitTestsResult.passed) {
      // Unit tests failed after max attempts
      ctx.failedTests = unitTestsResult.failedTests;
      ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
      postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

      AgentStateManager.writeState(orchestratorStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          `Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
        ),
        metadata: {
          prNumber,
          reviewComments: unaddressedComments.length,
          testFailure: true,
          failedTests: unitTestsResult.failedTests,
        },
      });
      AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: unit tests exceeded max retry attempts');

      log(`Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
      process.exit(1);
    }

    // Run E2E tests with retry logic (only if unit tests pass)
    const e2eTestsResult = await runE2ETestsWithRetry(
      logsDir,
      orchestratorStatePath,
      MAX_TEST_RETRY_ATTEMPTS,
      prNumber,
      ctx
    );

    if (!e2eTestsResult.passed) {
      // E2E tests failed after max attempts
      ctx.failedTests = e2eTestsResult.failedTests;
      ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
      postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

      AgentStateManager.writeState(orchestratorStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          `E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
        ),
        metadata: {
          prNumber,
          reviewComments: unaddressedComments.length,
          testFailure: true,
          failedTests: e2eTestsResult.failedTests,
        },
      });
      AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: E2E tests exceeded max retry attempts');

      log(`E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
      process.exit(1);
    }

    // All tests passed
    postPRWorkflowComment(prNumber, 'pr_review_test_passed', ctx);
    log('All validation tests passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'All validation tests passed');

    // Step 10: Commit changes with correct prefix based on branch type
    postPRWorkflowComment(prNumber, 'pr_review_committing', ctx);
    const issueType = inferIssueTypeFromBranch(prDetails.headBranch);
    const commitPrefix = commitPrefixMap[issueType];
    const commitMsg = issueNumber
      ? `${commitPrefix} address PR review comments for #${issueNumber}`
      : `${commitPrefix} address PR review comments`;
    commitChanges(commitMsg);

    // Step 11: Push to the PR branch
    pushBranch(prDetails.headBranch);
    postPRWorkflowComment(prNumber, 'pr_review_pushed', ctx);

    // Step 12: Post completed comment
    postPRWorkflowComment(prNumber, 'pr_review_completed', ctx);

    // Update final orchestrator state
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow completed successfully');

    log('ADW PR Review workflow completed!', 'success');
    log(`PR: ${prDetails.url}`, 'info');
    log(`Comments addressed: ${unaddressedComments.length}`, 'info');

  } catch (error) {
    ctx.errorMessage = String(error);
    postPRWorkflowComment(prNumber, 'pr_review_error', ctx);

    // Update orchestrator state with error
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        String(error)
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `PR Review workflow failed: ${error}`);

    log(`PR Review workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
