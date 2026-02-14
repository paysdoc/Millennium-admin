/**
 * Build phase function for standard workflows.
 *
 * Handles reading the plan, running the build agent, and committing
 * the implementation.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  log,
  AgentStateManager,
  shouldExecuteStage,
  emptyModelUsageMap,
  type ModelUsageMap,
} from '../core';
import { postWorkflowComment } from '../github';
import {
  getPlanFilePath,
  runBuildAgent,
  runCommitAgent,
  type ProgressCallback,
  type ProgressInfo,
} from '../agents';
import type { WorkflowConfig } from './phaseUtils';

/**
 * Executes the Build phase: read plan, run build agent, commit implementation.
 */
export async function executeBuildPhase(config: WorkflowConfig): Promise<{ costUsd: number; modelUsage: ModelUsageMap }> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, worktreePath, logsDir } = config;

  // Read plan content
  const planPath = path.join(worktreePath, getPlanFilePath(issueNumber));
  let planContent: string;
  try {
    planContent = fs.readFileSync(planPath, 'utf-8');
    log(`Plan loaded from: ${planPath}`, 'success');
  } catch (error) {
    throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
  }

  // Build agent step
  let costUsd = 0;
  let modelUsage = emptyModelUsageMap();
  const currentBranch = ctx.branchName || '';

  if (shouldExecuteStage('implemented', recoveryState)) {
    postWorkflowComment(issueNumber, 'implementing', ctx);
    log('Running Build Agent...', 'info');

    const buildAgentStatePath = AgentStateManager.initializeState(adwId, 'build-agent', orchestratorStatePath);
    AgentStateManager.writeState(buildAgentStatePath, {
      adwId,
      issueNumber,
      branchName: currentBranch,
      planFile: planPath,
      issueClass: issueType,
      agentName: 'build-agent',
      parentAgent: orchestratorName,
      execution: AgentStateManager.createExecutionState('running'),
    });

    let lastProgressUpdate = Date.now();
    const PROGRESS_UPDATE_INTERVAL_MS = 60000;

    const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
      ctx.buildProgress = {
        turnCount: info.turnCount || 0,
        toolCount: info.toolCount || 0,
        lastToolName: info.toolName,
        lastText: info.text,
      };

      if (info.type === 'tool_use') {
        log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
      }

      const now = Date.now();
      if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
        postWorkflowComment(issueNumber, 'build_progress', ctx);
        lastProgressUpdate = now;
      }
    };

    const buildResult = await runBuildAgent(issue, logsDir, planContent, buildProgressCallback, buildAgentStatePath, worktreePath);

    if (!buildResult.success) {
      AgentStateManager.writeState(buildAgentStatePath, {
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          false,
          buildResult.output
        ),
      });
      throw new Error(`Build Agent failed: ${buildResult.output}`);
    }

    AgentStateManager.writeState(buildAgentStatePath, {
      output: buildResult.output.substring(0, 1000),
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
    });

    AgentStateManager.appendLog(orchestratorStatePath, 'Build completed');

    ctx.buildOutput = buildResult.output;
    postWorkflowComment(issueNumber, 'implemented', ctx);
    costUsd = buildResult.totalCostUsd || 0;
    if (buildResult.modelUsage) modelUsage = buildResult.modelUsage;
  } else {
    log('Skipping Build Agent (already completed)', 'info');
  }

  // Commit implementation step
  if (shouldExecuteStage('implementation_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'implementation_committing', ctx);
    await runCommitAgent('build-agent', issueType, JSON.stringify(issue), logsDir, undefined, worktreePath);
  } else {
    log('Skipping implementation commit (already completed)', 'info');
  }

  return { costUsd, modelUsage };
}
