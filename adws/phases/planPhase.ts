/**
 * Plan phase function for standard workflows.
 *
 * Handles issue classification, branch creation, running the plan agent,
 * and committing the plan file.
 */

import {
  log,
  AgentStateManager,
  shouldExecuteStage,
  emptyModelUsageMap,
  type ModelUsageMap,
} from '../core';
import { postWorkflowComment } from '../github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runCommitAgent,
} from '../agents';
import type { WorkflowConfig } from './phaseUtils';

/**
 * Executes the Plan phase: classify issue, create branch, run plan agent, commit plan.
 */
export async function executePlanPhase(config: WorkflowConfig): Promise<{ costUsd: number; modelUsage: ModelUsageMap }> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, worktreePath, logsDir } = config;

  // Classify step
  if (shouldExecuteStage('classified', recoveryState)) {
    AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
    AgentStateManager.appendLog(orchestratorStatePath, `Issue classified as: ${issueType}`);
    ctx.issueType = issueType;
    postWorkflowComment(issueNumber, 'classified', ctx);
  }

  // Branch was already created during initializeWorkflow()
  const currentBranch = ctx.branchName || config.branchName || recoveryState.branchName || '';
  if (shouldExecuteStage('branch_created', recoveryState)) {
    log(`Using branch: ${currentBranch}`, 'success');
    ctx.branchName = currentBranch;

    AgentStateManager.writeState(orchestratorStatePath, { branchName: currentBranch });
    AgentStateManager.appendLog(orchestratorStatePath, `Branch created: ${currentBranch}`);
    postWorkflowComment(issueNumber, 'branch_created', ctx);
  } else {
    log('Skipping branch creation (already completed)', 'info');
    if (recoveryState.branchName) ctx.branchName = recoveryState.branchName;
  }

  // Plan agent step
  const planPath = getPlanFilePath(issueNumber);
  ctx.planPath = planPath;
  let costUsd = 0;
  let modelUsage = emptyModelUsageMap();

  if (shouldExecuteStage('plan_created', recoveryState) && !planFileExists(issueNumber, worktreePath)) {
    postWorkflowComment(issueNumber, 'plan_building', ctx);
    log('Running Plan Agent...', 'info');

    const planAgentStatePath = AgentStateManager.initializeState(adwId, 'plan-agent', orchestratorStatePath);
    AgentStateManager.writeState(planAgentStatePath, {
      adwId,
      issueNumber,
      branchName: currentBranch,
      issueClass: issueType,
      agentName: 'plan-agent',
      parentAgent: orchestratorName,
      execution: AgentStateManager.createExecutionState('running'),
    });

    const planResult = await runPlanAgent(issue, logsDir, issueType, planAgentStatePath, worktreePath);

    if (!planResult.success) {
      AgentStateManager.writeState(planAgentStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          planResult.output
        ),
      });
      throw new Error(`Plan Agent failed: ${planResult.output}`);
    }

    AgentStateManager.writeState(planAgentStatePath, {
      planFile: planPath,
      output: planResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
    });

    AgentStateManager.writeState(orchestratorStatePath, { planFile: planPath });
    AgentStateManager.appendLog(orchestratorStatePath, `Plan created: ${planPath}`);

    ctx.planOutput = planResult.output;
    postWorkflowComment(issueNumber, 'plan_created', ctx);
    costUsd = planResult.totalCostUsd || 0;
    if (planResult.modelUsage) modelUsage = planResult.modelUsage;
  } else {
    log('Skipping Plan Agent (plan already exists or completed)', 'info');
  }

  // Commit plan step
  if (shouldExecuteStage('plan_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'plan_committing', ctx);
    await runCommitAgent('plan-orchestrator', issueType, JSON.stringify(issue), logsDir, undefined, worktreePath);
  } else {
    log('Skipping plan commit (already completed)', 'info');
  }

  return { costUsd, modelUsage };
}
