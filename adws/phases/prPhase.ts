/**
 * PR creation phase for workflows.
 * Uses the /pull_request skill via a Claude agent.
 */

import {
  log,
  shouldExecuteStage,
  type ModelUsageMap,
  emptyModelUsageMap,
} from '../core';
import {
  postWorkflowComment,
} from '../github';
import {
  getPlanFilePath,
  runPullRequestAgent,
} from '../agents';
import type { WorkflowConfig } from './workflowLifecycle';

/**
 * Executes the PR phase: create pull request via the /pull_request skill.
 */
export async function executePRPhase(config: WorkflowConfig): Promise<{ costUsd: number; modelUsage: ModelUsageMap }> {
  const { recoveryState, issueNumber, issue, ctx, worktreePath, logsDir, adwId, branchName } = config;

  let costUsd = 0;
  let modelUsage = emptyModelUsageMap();

  if (shouldExecuteStage('pr_created', recoveryState)) {
    postWorkflowComment(issueNumber, 'pr_creating', ctx);
    log('Creating Pull Request...', 'info');

    const planFile = getPlanFilePath(issueNumber, worktreePath);
    const currentBranch = ctx.branchName || branchName || '';

    const result = await runPullRequestAgent(
      currentBranch,
      JSON.stringify(issue),
      planFile,
      adwId,
      logsDir,
      undefined,
      worktreePath,
    );

    ctx.prUrl = result.prUrl;
    costUsd = result.totalCostUsd || 0;
    if (result.modelUsage) modelUsage = result.modelUsage;

    postWorkflowComment(issueNumber, 'pr_created', ctx);
    log(`Pull Request created: ${result.prUrl}`, 'success');
  } else {
    log('Skipping PR creation (already completed)', 'info');
  }

  return { costUsd, modelUsage };
}
