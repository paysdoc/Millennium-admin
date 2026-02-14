/**
 * Workflow completion and error handling phase functions.
 *
 * Handles writing final state, posting completion/error comments,
 * and committing/pushing for PR review workflows.
 */

import {
  log,
  AgentStateManager,
  COST_REPORT_CURRENCIES,
  type ModelUsageMap,
  buildCostBreakdown,
  formatCostBreakdownMarkdown,
} from '../core';
import {
  postWorkflowComment,
  postPRWorkflowComment,
  pushBranch,
  inferIssueTypeFromBranch,
} from '../github';
import {
  runCommitAgent,
} from '../agents';
import type { WorkflowConfig, PRReviewWorkflowConfig } from './phaseUtils';

/**
 * Completes the workflow: writes final state, posts completion comment, prints banner.
 */
export async function completeWorkflow(
  config: WorkflowConfig,
  totalCostUsd: number,
  additionalMetadata?: Record<string, unknown>,
  modelUsage?: ModelUsageMap,
): Promise<void> {
  const { orchestratorStatePath, orchestratorName, issueNumber, ctx } = config;

  // Build cost breakdown if model usage data is available
  if (modelUsage && Object.keys(modelUsage).length > 0) {
    const costBreakdown = await buildCostBreakdown(modelUsage, [...COST_REPORT_CURRENCIES]);
    ctx.costBreakdown = costBreakdown;
  }

  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      true
    ),
    metadata: { totalCostUsd, ...additionalMetadata },
  });
  AgentStateManager.appendLog(orchestratorStatePath, 'Workflow completed successfully');

  postWorkflowComment(issueNumber, 'completed', ctx);

  log('===================================', 'info');
  log(`${orchestratorName} workflow completed!`, 'success');
  if (ctx.prUrl) {
    log(`PR: ${ctx.prUrl}`, 'info');
  }
  log('===================================', 'info');
}

/**
 * Handles workflow errors: posts error comment, writes failed state, and exits.
 */
export function handleWorkflowError(config: WorkflowConfig, error: unknown): never {
  const { orchestratorStatePath, orchestratorName, issueNumber, ctx } = config;

  ctx.errorMessage = String(error);
  postWorkflowComment(issueNumber, 'error', ctx);

  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      false,
      String(error)
    ),
  });
  AgentStateManager.appendLog(orchestratorStatePath, `${orchestratorName} workflow failed: ${error}`);

  log(`${orchestratorName} workflow failed: ${error}`, 'error');
  process.exit(1);
}

/**
 * Completes the PR review workflow: commits, pushes, and posts completion comments.
 */
export async function completePRReviewWorkflow(config: PRReviewWorkflowConfig, modelUsage?: ModelUsageMap): Promise<void> {
  const { prNumber, prDetails, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  // Build cost breakdown if model usage data is available
  if (modelUsage && Object.keys(modelUsage).length > 0) {
    const costBreakdown = await buildCostBreakdown(modelUsage, [...COST_REPORT_CURRENCIES]);
    ctx.costBreakdown = costBreakdown;
  }

  postPRWorkflowComment(prNumber, 'pr_review_committing', ctx);
  const issueType = inferIssueTypeFromBranch(prDetails.headBranch);
  await runCommitAgent('pr-review-orchestrator', issueType, JSON.stringify(prDetails), logsDir, undefined, worktreePath);

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
}

/**
 * Handles PR review workflow errors: posts error comment, writes failed state, and exits.
 */
export function handlePRReviewWorkflowError(config: PRReviewWorkflowConfig, error: unknown): never {
  const { prNumber, orchestratorStatePath, ctx } = config;

  ctx.errorMessage = String(error);
  postPRWorkflowComment(prNumber, 'pr_review_error', ctx);

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
