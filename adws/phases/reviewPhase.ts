/**
 * Review phase function for the standard workflow.
 *
 * Handles running the review agent with retry and patching logic.
 */

import {
  log,
  AgentStateManager,
  MAX_REVIEW_RETRY_ATTEMPTS,
  type ModelUsageMap,
} from '../core';
import {
  postWorkflowComment,
} from '../github';
import {
  getPlanFilePath,
  runReviewWithRetry,
} from '../agents';
import type { WorkflowConfig } from './phaseUtils';

/**
 * Executes the Review phase: run review agent with retry and patching.
 */
export async function executeReviewPhase(config: WorkflowConfig): Promise<{
  costUsd: number;
  modelUsage: ModelUsageMap;
  reviewPassed: boolean;
  totalRetries: number;
}> {
  const { orchestratorStatePath, issueNumber, issue, issueType, ctx, logsDir, worktreePath, branchName, adwId } = config;

  log('Phase: Review', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting review phase');

  const specFile = getPlanFilePath(issueNumber);

  postWorkflowComment(issueNumber, 'review_running', ctx);

  const reviewResult = await runReviewWithRetry({
    adwId,
    specFile,
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_REVIEW_RETRY_ATTEMPTS,
    branchName,
    issueType,
    issueContext: JSON.stringify(issue),
    onReviewFailed: (attempt, maxAttempts) => {
      log(`Review failed (attempt ${attempt}/${maxAttempts}), patching...`, 'info');
      postWorkflowComment(issueNumber, 'review_patching', ctx);
    },
    cwd: worktreePath,
  });

  if (reviewResult.passed) {
    log('Review passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'Review passed');
    postWorkflowComment(issueNumber, 'review_passed', ctx);
  } else {
    const errorMsg = `Review failed after ${MAX_REVIEW_RETRY_ATTEMPTS} attempts with ${reviewResult.blockerIssues.length} remaining blocker(s)`;
    log(errorMsg, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
    ctx.errorMessage = errorMsg;
    postWorkflowComment(issueNumber, 'review_failed', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        errorMsg
      ),
      metadata: { totalCostUsd: reviewResult.costUsd, reviewPassed: false },
    });
  }

  return {
    costUsd: reviewResult.costUsd,
    modelUsage: reviewResult.modelUsage,
    reviewPassed: reviewResult.passed,
    totalRetries: reviewResult.totalRetries,
  };
}
