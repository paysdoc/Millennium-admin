/**
 * PR review build phase: runs the PR review build agent.
 */

import {
  log,
  AgentStateManager,
} from '../core';
import { postPRWorkflowComment } from '../github';
import {
  runPrReviewBuildAgent,
  type ProgressCallback,
  type ProgressInfo,
} from '../agents';
import type { PRReviewWorkflowConfig } from './phaseUtils';

/**
 * Executes the PR review Build phase: runs PR review build agent.
 */
export async function executePRReviewBuildPhase(config: PRReviewWorkflowConfig, planOutput: string): Promise<void> {
  const { prNumber, issueNumber, adwId, prDetails, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  postPRWorkflowComment(prNumber, 'pr_review_implementing', ctx);
  log('Running PR Review Build Agent...', 'info');

  const buildAgentStatePath = AgentStateManager.initializeState(adwId, 'pr-review-build-agent', orchestratorStatePath);
  AgentStateManager.writeState(buildAgentStatePath, {
    adwId,
    issueNumber,
    branchName: prDetails.headBranch,
    agentName: 'pr-review-build-agent',
    parentAgent: 'pr-review-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { prNumber, reviewComments: unaddressedComments.length },
  });

  const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
    if (info.type === 'tool_use') {
      log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
    }
  };

  const buildResult = await runPrReviewBuildAgent(prDetails, planOutput, logsDir, buildProgressCallback, buildAgentStatePath, worktreePath);

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
}
