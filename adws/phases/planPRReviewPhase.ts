/**
 * PR review plan phase: reads existing plan and runs PR review plan agent.
 */

import * as fs from 'fs';
import * as path from 'path';
import { log, AgentStateManager } from '../core';
import { postPRWorkflowComment } from '../github';
import { getPlanFilePath, runPrReviewPlanAgent } from '../agents';
import type { PRReviewWorkflowConfig } from './phaseUtils';

/**
 * Executes the PR review Plan phase: reads existing plan, runs PR review plan agent.
 */
export async function executePRReviewPlanPhase(config: PRReviewWorkflowConfig): Promise<{ planOutput: string }> {
  const { prNumber, issueNumber, adwId, prDetails, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  let existingPlanContent = '';
  if (issueNumber) {
    const planPath = path.join(worktreePath, getPlanFilePath(issueNumber));
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
    issueNumber,
    branchName: prDetails.headBranch,
    agentName: 'pr-review-plan-agent',
    parentAgent: 'pr-review-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { prNumber, reviewComments: unaddressedComments.length },
  });

  const planResult = await runPrReviewPlanAgent(prDetails, unaddressedComments, existingPlanContent, logsDir, planAgentStatePath, worktreePath);

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

  return { planOutput: planResult.output };
}
