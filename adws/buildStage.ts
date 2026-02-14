/**
 * Build stage execution logic.
 *
 * Runs the build agent with progress reporting, handles state
 * management for the build agent, and returns cost information.
 */

import {
  log,
  IssueClassSlashCommand,
  GitHubIssue,
  AgentStateManager,
} from './core';
import {
  postWorkflowComment,
  WorkflowContext,
} from './github';
import {
  runBuildAgent,
  ProgressCallback,
  ProgressInfo,
} from './agents';

const PROGRESS_UPDATE_INTERVAL_MS = 60000;

/** Runs the build agent stage and returns the cost. */
export const executeBuildStage = async (
  ctx: WorkflowContext,
  orchestratorStatePath: string,
  adwId: string,
  issueNumber: number,
  branchName: string,
  planPath: string,
  planContent: string,
  issueType: IssueClassSlashCommand,
  issue: GitHubIssue,
  logsDir: string
): Promise<number> => {
  postWorkflowComment(issueNumber, 'implementing', ctx);
  log('Running Build Agent...', 'info');

  const buildAgentStatePath = AgentStateManager.initializeState(adwId, 'build-agent', orchestratorStatePath);
  AgentStateManager.writeState(buildAgentStatePath, {
    adwId,
    issueNumber,
    branchName,
    planFile: planPath,
    issueClass: issueType,
    agentName: 'build-agent',
    parentAgent: 'build-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  });

  let lastProgressUpdate = Date.now();

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

  const buildResult = await runBuildAgent(issue, logsDir, planContent, buildProgressCallback, buildAgentStatePath);

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
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      true
    ),
  });

  AgentStateManager.appendLog(orchestratorStatePath, 'Build completed');
  ctx.buildOutput = buildResult.output;
  postWorkflowComment(issueNumber, 'implemented', ctx);

  return buildResult.totalCostUsd || 0;
};
