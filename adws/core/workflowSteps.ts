/**
 * Shared workflow step functions used by all orchestrators.
 *
 * Extracts duplicated plan, build, PR, recovery, and lifecycle logic
 * from adwPlan.tsx, adwPlanBuild.tsx, and adwPlanBuildTest.tsx into
 * reusable step functions.
 */

import * as fs from 'fs';
import {
  IssueClassSlashCommand,
  GitHubIssue,
  RecoveryState,
  AgentIdentifier,
  commitPrefixMap,
} from './dataTypes';
import { log, AgentStateManager } from './index';
import { shouldExecuteStage, hasUncommittedChanges, getNextStage } from './orchestratorLib';
import {
  postWorkflowComment,
  WorkflowContext,
  createFeatureBranch,
  commitChanges,
  createPullRequest,
  getWorktreeForBranch,
  ensureWorktree,
  checkoutDefaultBranch,
  copyEnvToWorktree,
  mergeLatestFromDefaultBranch,
} from '../github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runBuildAgent,
  ProgressCallback,
  ProgressInfo,
} from '../agents';

/**
 * Parameters shared across all workflow step functions.
 * Created once by each orchestrator and passed to every step.
 */
export interface WorkflowParams {
  issueNumber: number;
  adwId: string;
  issue: GitHubIssue;
  issueType: IssueClassSlashCommand;
  recoveryState: RecoveryState;
  orchestratorStatePath: string;
  orchestratorName: AgentIdentifier;
  ctx: WorkflowContext;
  workingDir: string;
  logsDir: string;
}

/**
 * Sets up a worktree with the latest code from the default branch.
 * For new worktrees: checks out default branch first to ensure latest code, then creates worktree.
 * For existing worktrees: merges latest from origin/{defaultBranch}.
 */
export function setupWorktreeWithLatestCode(branchName: string, defaultBranch: string): string {
  const existingPath = getWorktreeForBranch(branchName);

  if (existingPath) {
    log(`Worktree for branch '${branchName}' already exists at ${existingPath}, reusing`, 'info');
    mergeLatestFromDefaultBranch(defaultBranch, existingPath);
    copyEnvToWorktree(existingPath);
    return existingPath;
  }

  checkoutDefaultBranch();
  const worktreePath = ensureWorktree(branchName, defaultBranch);
  log(`Worktree path: ${worktreePath}`, 'info');
  return worktreePath;
}

/**
 * Handles recovery mode detection and context restoration.
 * If resuming: restores branch/plan/PR state from recovery, posts 'resuming' comment.
 * If fresh: posts 'starting' comment.
 */
export function handleRecoveryMode(params: WorkflowParams): void {
  const { recoveryState, ctx, issueNumber, workingDir } = params;

  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');

    if (hasUncommittedChanges(workingDir)) {
      log('Warning: There are uncommitted changes in the working directory', 'info');
    }

    if (recoveryState.branchName) ctx.branchName = recoveryState.branchName;
    if (recoveryState.planPath) ctx.planPath = recoveryState.planPath;
    if (recoveryState.prUrl) ctx.prUrl = recoveryState.prUrl;

    const nextStage = getNextStage(recoveryState.lastCompletedStage);
    ctx.resumeFrom = nextStage;
    postWorkflowComment(issueNumber, 'resuming', ctx);
  } else {
    postWorkflowComment(issueNumber, 'starting', ctx);
  }
}

/**
 * Executes the classify step: writes issue class to state and posts 'classified' comment.
 */
export function executeClassifyStep(params: WorkflowParams): void {
  const { recoveryState, orchestratorStatePath, issueType, issueNumber, ctx } = params;

  if (shouldExecuteStage('classified', recoveryState)) {
    AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
    AgentStateManager.appendLog(orchestratorStatePath, `Issue classified as: ${issueType}`);
    ctx.issueType = issueType;
    postWorkflowComment(issueNumber, 'classified', ctx);
  }
}

/**
 * Executes the create branch step.
 * Returns the branch name (created or restored from recovery).
 */
export function executeCreateBranchStep(params: WorkflowParams): string {
  const { recoveryState, orchestratorStatePath, issueNumber, issue, issueType, ctx, workingDir } = params;

  let currentBranch = ctx.branchName || '';

  if (shouldExecuteStage('branch_created', recoveryState)) {
    log('Creating branch...', 'info');
    currentBranch = createFeatureBranch(issueNumber, issue.title, issueType, workingDir);
    log(`On branch: ${currentBranch}`, 'success');
    ctx.branchName = currentBranch;

    AgentStateManager.writeState(orchestratorStatePath, { branchName: currentBranch });
    AgentStateManager.appendLog(orchestratorStatePath, `Branch created: ${currentBranch}`);

    postWorkflowComment(issueNumber, 'branch_created', ctx);
  } else {
    log('Skipping branch creation (already completed)', 'info');
    if (recoveryState.branchName) {
      currentBranch = createFeatureBranch(issueNumber, issue.title, issueType, workingDir);
      ctx.branchName = currentBranch;
    }
  }

  return currentBranch;
}

/**
 * Executes the plan agent step.
 * Returns the cost in USD from the plan agent run.
 */
export async function executePlanAgentStep(params: WorkflowParams, currentBranch: string): Promise<number> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, workingDir, logsDir } = params;

  const planPath = getPlanFilePath(issueNumber);
  ctx.planPath = planPath;

  if (shouldExecuteStage('plan_created', recoveryState) && !planFileExists(issueNumber)) {
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

    const planResult = await runPlanAgent(issue, logsDir, issueType, planAgentStatePath, workingDir);

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
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
    });

    AgentStateManager.writeState(orchestratorStatePath, { planFile: planPath });
    AgentStateManager.appendLog(orchestratorStatePath, `Plan created: ${planPath}`);

    ctx.planOutput = planResult.output;
    postWorkflowComment(issueNumber, 'plan_created', ctx);
    return planResult.totalCostUsd || 0;
  }

  log('Skipping Plan Agent (plan already exists or completed)', 'info');
  return 0;
}

/**
 * Executes the commit plan step.
 */
export function executeCommitPlanStep(params: WorkflowParams): void {
  const { recoveryState, issueNumber, issueType, ctx, workingDir } = params;

  if (shouldExecuteStage('plan_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'plan_committing', ctx);
    commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`, workingDir);
  } else {
    log('Skipping plan commit (already completed)', 'info');
  }
}

/**
 * Reads plan content from the plan file path.
 */
export function readPlanContent(planPath: string): string {
  try {
    const content = fs.readFileSync(planPath, 'utf-8');
    log(`Plan loaded from: ${planPath}`, 'success');
    return content;
  } catch (error) {
    throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
  }
}

/**
 * Executes the build agent step.
 * Returns the cost in USD from the build agent run.
 */
export async function executeBuildAgentStep(params: WorkflowParams, planContent: string, currentBranch: string): Promise<number> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, logsDir } = params;

  if (shouldExecuteStage('implemented', recoveryState)) {
    postWorkflowComment(issueNumber, 'implementing', ctx);
    log('Running Build Agent...', 'info');

    const planPath = getPlanFilePath(issueNumber);
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
  }

  log('Skipping Build Agent (already completed)', 'info');
  return 0;
}

/**
 * Executes the commit implementation step.
 */
export function executeCommitImplementationStep(params: WorkflowParams): void {
  const { recoveryState, orchestratorStatePath, issueNumber, issue, issueType, ctx, workingDir } = params;

  if (shouldExecuteStage('implementation_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'implementation_committing', ctx);
    commitChanges(`${commitPrefixMap[issueType]} implement #${issueNumber} - ${issue.title}`, workingDir);
  } else {
    log('Skipping implementation commit (already completed)', 'info');
  }
}

/**
 * Executes the PR creation step.
 */
export function executePRCreationStep(params: WorkflowParams, defaultBranch: string): void {
  const { recoveryState, issueNumber, issue, ctx, workingDir } = params;

  if (shouldExecuteStage('pr_created', recoveryState)) {
    postWorkflowComment(issueNumber, 'pr_creating', ctx);
    log('Creating Pull Request...', 'info');

    const prUrl = createPullRequest(issue, '', '', defaultBranch, workingDir);
    ctx.prUrl = prUrl;

    postWorkflowComment(issueNumber, 'pr_created', ctx);
    log(`Pull Request created: ${prUrl}`, 'success');
  } else {
    log('Skipping PR creation (already completed)', 'info');
  }
}

/**
 * Completes the workflow: writes final state with metadata and posts 'completed' comment.
 */
export function completeWorkflow(
  orchestratorStatePath: string,
  ctx: WorkflowContext,
  issueNumber: number,
  metadata: Record<string, unknown>
): void {
  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      true
    ),
    metadata,
  });
  AgentStateManager.appendLog(orchestratorStatePath, 'Workflow completed successfully');

  postWorkflowComment(issueNumber, 'completed', ctx);
}

/**
 * Handles workflow errors: posts error comment, writes failed state, and exits.
 */
export function handleWorkflowError(
  error: unknown,
  orchestratorStatePath: string,
  ctx: WorkflowContext,
  issueNumber: number,
  label: string
): never {
  ctx.errorMessage = String(error);
  postWorkflowComment(issueNumber, 'error', ctx);

  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      false,
      String(error)
    ),
  });
  AgentStateManager.appendLog(orchestratorStatePath, `${label} failed: ${error}`);

  log(`${label} failed: ${error}`, 'error');
  process.exit(1);
}
