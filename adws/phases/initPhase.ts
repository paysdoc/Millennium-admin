/**
 * Workflow initialization phase: fetches issues, classifies types,
 * sets up worktrees, initializes state, and detects recovery mode.
 */

import {
  log, ensureLogsDirectory, generateAdwId,
  type IssueClassSlashCommand, type AgentState, type AgentIdentifier,
  AgentStateManager, shouldExecuteStage, hasUncommittedChanges, getNextStage,
} from '../core';
import {
  fetchGitHubIssue, postWorkflowComment, type WorkflowContext,
  detectRecoveryState, getDefaultBranch, checkoutDefaultBranch,
  ensureWorktree, getWorktreeForBranch, mergeLatestFromDefaultBranch, copyEnvToWorktree,
} from '../github';
import { runGenerateBranchNameAgent } from '../agents';
import { classifyGitHubIssue } from '../triggers/issueClassifier';
import type { WorkflowConfig } from './phaseUtils';

/** Initializes a workflow: fetches issue, classifies type, sets up worktree, initializes state. */
export async function initializeWorkflow(
  issueNumber: number,
  adwId: string | null,
  orchestratorName: AgentIdentifier,
  options?: { cwd?: string; issueType?: IssueClassSlashCommand }
): Promise<WorkflowConfig> {
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  const recoveryState = detectRecoveryState(issue.comments);
  const resolvedAdwId = adwId ?? recoveryState.adwId ?? generateAdwId(issue.title);

  log(`=== ${orchestratorName} | Issue #${issueNumber} | ADW ID: ${resolvedAdwId} ===`, 'info');

  // Classify issue type
  let issueType: IssueClassSlashCommand;
  if (options?.issueType) {
    log(`Using pre-classified issue type: ${options.issueType}`, 'info');
    issueType = options.issueType;
  } else {
    const classificationResult = await classifyGitHubIssue(issue);
    issueType = classificationResult.issueType;
    log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');
  }

  const logsDir = ensureLogsDirectory(resolvedAdwId);
  const defaultBranch = getDefaultBranch();
  let worktreePath: string;
  let branchName = '';

  if (options?.cwd) {
    mergeLatestFromDefaultBranch(defaultBranch, options.cwd);
    worktreePath = options.cwd;
    log('Using provided worktree (merged latest code)', 'info');
  } else {
    if (recoveryState.branchName) {
      branchName = recoveryState.branchName;
      log(`Reusing branch from previous workflow: ${branchName}`, 'info');
    } else {
      const branchResult = await runGenerateBranchNameAgent(issueType, resolvedAdwId, issue, logsDir);
      branchName = branchResult.branchName;
      log(`Branch name generated: ${branchName}`, 'success');
    }

    const existingWorktree = getWorktreeForBranch(branchName);
    if (existingWorktree) {
      log(`Reusing existing worktree at ${existingWorktree}`, 'info');
      mergeLatestFromDefaultBranch(defaultBranch, existingWorktree);
      copyEnvToWorktree(existingWorktree);
      worktreePath = existingWorktree;
    } else {
      checkoutDefaultBranch();
      worktreePath = ensureWorktree(branchName, defaultBranch);
    }
    log(`Worktree path: ${worktreePath}`, 'info');
  }

  const orchestratorStatePath = AgentStateManager.initializeState(resolvedAdwId, orchestratorName);
  log(`State: ${orchestratorStatePath} | Logs: ${logsDir}`, 'info');

  AgentStateManager.writeState(orchestratorStatePath, {
    adwId: resolvedAdwId, issueNumber, agentName: orchestratorName,
    execution: AgentStateManager.createExecutionState('running'),
  } as Partial<AgentState>);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ${orchestratorName} workflow for issue #${issueNumber}`);

  const ctx: WorkflowContext = { issueNumber, adwId: resolvedAdwId, issueType };

  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');
    if (hasUncommittedChanges(worktreePath)) log('Warning: uncommitted changes in working directory', 'info');
    if (recoveryState.branchName) ctx.branchName = recoveryState.branchName;
    if (recoveryState.planPath) ctx.planPath = recoveryState.planPath;
    if (recoveryState.prUrl) ctx.prUrl = recoveryState.prUrl;
    ctx.resumeFrom = getNextStage(recoveryState.lastCompletedStage);
    postWorkflowComment(issueNumber, 'resuming', ctx);
  } else {
    postWorkflowComment(issueNumber, 'starting', ctx);
  }

  return {
    issueNumber, adwId: resolvedAdwId, issue, issueType, worktreePath,
    defaultBranch, logsDir, orchestratorStatePath, orchestratorName,
    recoveryState, ctx, branchName,
  };
}
