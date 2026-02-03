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
  commitChanges,
  pushBranch,
  postPRWorkflowComment,
  PRReviewWorkflowContext,
  getUnaddressedComments,
  inferIssueTypeFromBranch,
  ensureWorktree,
} from './github';
import {
  runPrReviewPlanAgent,
  getPlanFilePath,
  runPrReviewBuildAgent,
  ProgressCallback,
  ProgressInfo,
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
} from './agents';

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

  const prDetails = fetchPRDetails(prNumber);
  log(`Fetched PR: ${prDetails.title}`, 'success');

  if (prDetails.state === 'CLOSED' || prDetails.state === 'MERGED') {
    log(`PR #${prNumber} is ${prDetails.state}, skipping`, 'info');
    return;
  }

  const unaddressedComments = getUnaddressedComments(prNumber);

  if (unaddressedComments.length === 0) {
    log(`No unaddressed review comments on PR #${prNumber}, exiting`, 'info');
    return;
  }

  log(`Found ${unaddressedComments.length} unaddressed review comment(s)`, 'info');

  const adwId = generateAdwId();
  const logsDir = ensureLogsDirectory(adwId);
  log(`ADW ID: ${adwId}`, 'info');

  const issueNumber = prDetails.issueNumber;
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  const initialOrchestratorState: Partial<AgentState> = {
    adwId,
    issueNumber: issueNumber || 0,
    branchName: prDetails.headBranch,
    agentName: 'orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { prNumber, reviewComments: unaddressedComments.length },
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

  postPRWorkflowComment(prNumber, 'pr_review_starting', ctx);

  try {
    // Create worktree for the PR branch instead of checking out
    const worktreePath = ensureWorktree(prDetails.headBranch);
    log(`Worktree path: ${worktreePath}`, 'info');

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

    postPRWorkflowComment(prNumber, 'pr_review_planning', ctx);
    log('Running PR Review Plan Agent...', 'info');

    const planAgentStatePath = AgentStateManager.initializeState(adwId, 'pr-review-plan-agent', orchestratorStatePath);
    AgentStateManager.writeState(planAgentStatePath, {
      adwId,
      issueNumber: issueNumber || 0,
      branchName: prDetails.headBranch,
      agentName: 'pr-review-plan-agent',
      parentAgent: 'orchestrator',
      execution: AgentStateManager.createExecutionState('running'),
      metadata: { prNumber, reviewComments: unaddressedComments.length },
    });

    const planResult = await runPrReviewPlanAgent(prDetails, unaddressedComments, existingPlanContent, logsDir, planAgentStatePath);

    if (!planResult.success) {
      AgentStateManager.writeState(planAgentStatePath, {
        execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), false, planResult.output),
      });
      throw new Error(`PR Review Plan Agent failed: ${planResult.output}`);
    }

    AgentStateManager.writeState(planAgentStatePath, {
      output: planResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review Plan completed');

    ctx.revisionPlanOutput = planResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_planned', ctx);

    postPRWorkflowComment(prNumber, 'pr_review_implementing', ctx);
    log('Running PR Review Build Agent...', 'info');

    const buildAgentStatePath = AgentStateManager.initializeState(adwId, 'pr-review-build-agent', orchestratorStatePath);
    AgentStateManager.writeState(buildAgentStatePath, {
      adwId,
      issueNumber: issueNumber || 0,
      branchName: prDetails.headBranch,
      agentName: 'pr-review-build-agent',
      parentAgent: 'orchestrator',
      execution: AgentStateManager.createExecutionState('running'),
      metadata: { prNumber, reviewComments: unaddressedComments.length },
    });

    const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
      if (info.type === 'tool_use') {
        log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
      }
    };

    const buildResult = await runPrReviewBuildAgent(prDetails, planResult.output, logsDir, buildProgressCallback, buildAgentStatePath);

    if (!buildResult.success) {
      AgentStateManager.writeState(buildAgentStatePath, {
        execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), false, buildResult.output),
      });
      throw new Error(`PR Review Build Agent failed: ${buildResult.output}`);
    }

    AgentStateManager.writeState(buildAgentStatePath, {
      output: buildResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review Build completed');

    ctx.revisionBuildOutput = buildResult.output;
    postPRWorkflowComment(prNumber, 'pr_review_implemented', ctx);

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

    postPRWorkflowComment(prNumber, 'pr_review_committing', ctx);
    const issueType = inferIssueTypeFromBranch(prDetails.headBranch);
    const commitPrefix = commitPrefixMap[issueType];
    const commitMsg = issueNumber
      ? `${commitPrefix} address PR review comments for #${issueNumber}`
      : `${commitPrefix} address PR review comments`;
    commitChanges(commitMsg, worktreePath);

    pushBranch(prDetails.headBranch, worktreePath);
    postPRWorkflowComment(prNumber, 'pr_review_pushed', ctx);
    postPRWorkflowComment(prNumber, 'pr_review_completed', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow completed successfully');

    log('ADW PR Review workflow completed!', 'success');
    log(`PR: ${prDetails.url}`, 'info');
    log(`Comments addressed: ${unaddressedComments.length}`, 'info');
  } catch (error) {
    ctx.errorMessage = String(error);
    postPRWorkflowComment(prNumber, 'pr_review_error', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), false, String(error)),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `PR Review workflow failed: ${error}`);

    log(`PR Review workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
