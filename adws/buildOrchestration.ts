/**
 * Build orchestration logic extracted from adwBuild.tsx.
 *
 * Contains the core build workflow: fetch issue, verify plan, run build agent,
 * commit implementation, and handle recovery.
 */

import * as fs from 'fs';
import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  AgentStateManager,
  AgentState,
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
} from './core';
import {
  fetchGitHubIssue,
  postWorkflowComment,
  WorkflowContext,
  detectRecoveryState,
  getCurrentBranch,
  inferIssueTypeFromBranch,
} from './github';
import {
  runCommitAgent,
  getPlanFilePath,
  planFileExists,
} from './agents';
import { executeBuildStage } from './buildStage';

/** Prints the build phase summary. */
export const printBuildSummary = (
  issueNumber: number,
  issueTitle: string,
  branchName: string,
  logsDir: string,
  prUrl: string,
  costUsd: number
): void => {
  log('===================================', 'info');
  log('ADW Build workflow completed!', 'success');
  log(`Issue: #${issueNumber} - ${issueTitle}`, 'info');
  log(`Branch: ${branchName}`, 'info');
  if (prUrl) log(`PR: ${prUrl}`, 'info');
  log(`Logs: ${logsDir}`, 'info');
  if (costUsd > 0) log(`Cost: $${costUsd.toFixed(4)}`, 'info');
  log('===================================', 'info');
};

/** Reads the plan file content or exits with an error. */
const readPlanContent = (planPath: string): string => {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    log(`Plan loaded from: ${planPath}`, 'success');
    return content;
  } catch (error) {
    log(`Cannot read plan file at ${planPath}: ${error}`, 'error');
    process.exit(1);
  }
};

/** Runs the full build workflow including recovery detection. */
export const runBuildWorkflow = async (
  issueNumber: number,
  providedAdwId: string | null,
  cwd: string | null
): Promise<void> => {
  log('Starting ADW Build workflow', 'info');
  log(`Issue: #${issueNumber}`, 'info');
  if (cwd) log(`Working directory: ${cwd}`, 'info');

  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  const adwId = providedAdwId || generateAdwId(issue.title);
  const logsDir = ensureLogsDirectory(adwId);
  log(`ADW ID: ${adwId}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const branchName = getCurrentBranch(cwd || undefined);
  log(`Current branch: ${branchName}`, 'info');

  const planPath = getPlanFilePath(issueNumber);
  if (!planFileExists(issueNumber)) {
    log(`Plan file not found: ${planPath}`, 'error');
    log('Run adwPlan.tsx first to generate the plan.', 'error');
    process.exit(1);
  }

  const planContent = readPlanContent(planPath);
  const issueType = inferIssueTypeFromBranch(branchName);
  log(`Issue type (from branch): ${issueType}`, 'info');

  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'build-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    branchName,
    issueClass: issueType,
    planFile: planPath,
    agentName: 'build-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ADW Build workflow for issue #${issueNumber}`);

  const recoveryState = detectRecoveryState(issue.comments);
  const ctx: WorkflowContext = { issueNumber, adwId, branchName, planPath, issueType };

  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');
    if (hasUncommittedChanges()) log('Warning: There are uncommitted changes in the working directory', 'info');
    if (recoveryState.prUrl) ctx.prUrl = recoveryState.prUrl;
    ctx.resumeFrom = getNextStage(recoveryState.lastCompletedStage);
    postWorkflowComment(issueNumber, 'resuming', ctx);
  }

  try {
    const buildCostUsd = shouldExecuteStage('implemented', recoveryState)
      ? await executeBuildStage(ctx, orchestratorStatePath, adwId, issueNumber, branchName, planPath, planContent, issueType, issue, logsDir)
      : (log('Skipping Build Agent (already completed)', 'info'), 0);

    if (shouldExecuteStage('implementation_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'implementation_committing', ctx);
      await runCommitAgent('build-orchestrator', issueType, JSON.stringify(issue), logsDir, undefined, cwd || undefined);
    } else {
      log('Skipping implementation commit (already completed)', 'info');
    }

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
      metadata: { totalCostUsd: buildCostUsd },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'Build phase completed successfully');
    printBuildSummary(issueNumber, issue.title, branchName, logsDir, '', buildCostUsd);
  } catch (error) {
    ctx.errorMessage = String(error);
    postWorkflowComment(issueNumber, 'error', ctx);
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), false, String(error)),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `Build workflow failed: ${error}`);
    log(`Build workflow failed: ${error}`, 'error');
    process.exit(1);
  }
};
