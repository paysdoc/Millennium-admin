/**
 * Composable workflow phase functions for orchestrators.
 *
 * Provides high-level phase functions that compose lower-level operations
 * from core/, github/, agents/, and triggers/ modules. Each orchestrator
 * composes these phases in its main() function.
 *
 * Located at adws/ level (not in core/) because it imports from
 * agents/, github/, triggers/, and core/.
 */

import * as fs from 'fs';
import {
  log,
  ensureLogsDirectory,
  type IssueClassSlashCommand,
  type GitHubIssue,
  commitPrefixMap,
  AgentStateManager,
  type AgentState,
  type AgentIdentifier,
  type RecoveryState,
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
  MAX_TEST_RETRY_ATTEMPTS,
} from './core';
import {
  fetchGitHubIssue,
  createFeatureBranch,
  commitChanges,
  createPullRequest,
  postWorkflowComment,
  type WorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  generateBranchName,
  ensureWorktree,
  getWorktreeForBranch,
  checkoutDefaultBranch,
  mergeLatestFromDefaultBranch,
  copyEnvToWorktree,
} from './github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runBuildAgent,
  type ProgressCallback,
  type ProgressInfo,
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
} from './agents';
import { classifyGitHubIssue } from './triggers/issueClassifier';

/**
 * Configuration shared across all workflow phase functions.
 * Created by initializeWorkflow() and passed to every phase.
 */
export interface WorkflowConfig {
  issueNumber: number;
  adwId: string;
  issue: GitHubIssue;
  issueType: IssueClassSlashCommand;
  worktreePath: string;
  defaultBranch: string;
  logsDir: string;
  orchestratorStatePath: string;
  orchestratorName: AgentIdentifier;
  recoveryState: RecoveryState;
  ctx: WorkflowContext;
}

/**
 * Sets up a worktree with the latest code from the default branch.
 * For new worktrees: checks out default branch first, then creates worktree.
 * For existing worktrees: merges latest from origin/{defaultBranch}.
 */
function setupWorktreeWithLatestCode(branchName: string, defaultBranch: string): string {
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
 * Initializes a workflow: fetches issue, classifies type, sets up worktree,
 * initializes state, and detects recovery mode.
 */
export async function initializeWorkflow(
  issueNumber: number,
  adwId: string,
  orchestratorName: AgentIdentifier,
  options?: { cwd?: string; issueType?: IssueClassSlashCommand }
): Promise<WorkflowConfig> {
  log('===================================', 'info');
  log(`${orchestratorName}`, 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log('===================================', 'info');

  // Fetch issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Classify issue type
  let issueType: IssueClassSlashCommand;
  if (options?.issueType) {
    log(`Using pre-classified issue type: ${options.issueType}`, 'info');
    issueType = options.issueType;
  } else {
    log('Classifying issue type...', 'info');
    const classificationResult = await classifyGitHubIssue(issue);
    issueType = classificationResult.issueType;
    log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');
  }

  // Setup worktree with branch sync
  const defaultBranch = getDefaultBranch();
  let worktreePath: string;
  if (options?.cwd) {
    mergeLatestFromDefaultBranch(defaultBranch, options.cwd);
    worktreePath = options.cwd;
    log('Using provided worktree (merged latest code)', 'info');
  } else {
    const tempBranchName = generateBranchName(issueNumber, issue.title, issueType);
    worktreePath = setupWorktreeWithLatestCode(tempBranchName, defaultBranch);
  }

  // Initialize logs and state
  const logsDir = ensureLogsDirectory(adwId);
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, orchestratorName);
  log(`State: ${orchestratorStatePath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    agentName: orchestratorName,
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ${orchestratorName} workflow for issue #${issueNumber}`);

  // Detect recovery state
  const recoveryState = detectRecoveryState(issue.comments);

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
    issueType,
  };

  // Handle recovery mode
  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');

    if (hasUncommittedChanges(worktreePath)) {
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

  return {
    issueNumber,
    adwId,
    issue,
    issueType,
    worktreePath,
    defaultBranch,
    logsDir,
    orchestratorStatePath,
    orchestratorName,
    recoveryState,
    ctx,
  };
}

/**
 * Executes the Plan phase: classify issue, create branch, run plan agent, commit plan.
 */
export async function executePlanPhase(config: WorkflowConfig): Promise<{ costUsd: number }> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, worktreePath, logsDir } = config;

  // Classify step
  if (shouldExecuteStage('classified', recoveryState)) {
    AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
    AgentStateManager.appendLog(orchestratorStatePath, `Issue classified as: ${issueType}`);
    ctx.issueType = issueType;
    postWorkflowComment(issueNumber, 'classified', ctx);
  }

  // Create branch step
  let currentBranch = ctx.branchName || '';
  if (shouldExecuteStage('branch_created', recoveryState)) {
    log('Creating branch...', 'info');
    currentBranch = createFeatureBranch(issueNumber, issue.title, issueType, worktreePath);
    log(`On branch: ${currentBranch}`, 'success');
    ctx.branchName = currentBranch;

    AgentStateManager.writeState(orchestratorStatePath, { branchName: currentBranch });
    AgentStateManager.appendLog(orchestratorStatePath, `Branch created: ${currentBranch}`);
    postWorkflowComment(issueNumber, 'branch_created', ctx);
  } else {
    log('Skipping branch creation (already completed)', 'info');
    if (recoveryState.branchName) {
      currentBranch = createFeatureBranch(issueNumber, issue.title, issueType, worktreePath);
      ctx.branchName = currentBranch;
    }
  }

  // Plan agent step
  const planPath = getPlanFilePath(issueNumber);
  ctx.planPath = planPath;
  let costUsd = 0;

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
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
    });

    AgentStateManager.writeState(orchestratorStatePath, { planFile: planPath });
    AgentStateManager.appendLog(orchestratorStatePath, `Plan created: ${planPath}`);

    ctx.planOutput = planResult.output;
    postWorkflowComment(issueNumber, 'plan_created', ctx);
    costUsd = planResult.totalCostUsd || 0;
  } else {
    log('Skipping Plan Agent (plan already exists or completed)', 'info');
  }

  // Commit plan step
  if (shouldExecuteStage('plan_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'plan_committing', ctx);
    commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`, worktreePath);
  } else {
    log('Skipping plan commit (already completed)', 'info');
  }

  return { costUsd };
}

/**
 * Executes the Build phase: read plan, run build agent, commit implementation.
 */
export async function executeBuildPhase(config: WorkflowConfig): Promise<{ costUsd: number }> {
  const { recoveryState, orchestratorStatePath, orchestratorName, adwId, issueNumber, issue, issueType, ctx, worktreePath, logsDir } = config;

  // Read plan content
  const planPath = getPlanFilePath(issueNumber);
  let planContent: string;
  try {
    planContent = fs.readFileSync(planPath, 'utf-8');
    log(`Plan loaded from: ${planPath}`, 'success');
  } catch (error) {
    throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
  }

  // Build agent step
  let costUsd = 0;
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
    costUsd = buildResult.totalCostUsd || 0;
  } else {
    log('Skipping Build Agent (already completed)', 'info');
  }

  // Commit implementation step
  if (shouldExecuteStage('implementation_committing', recoveryState)) {
    postWorkflowComment(issueNumber, 'implementation_committing', ctx);
    commitChanges(`${commitPrefixMap[issueType]} implement #${issueNumber} - ${issue.title}`, worktreePath);
  } else {
    log('Skipping implementation commit (already completed)', 'info');
  }

  return { costUsd };
}

/**
 * Executes the Test phase: run unit tests and E2E tests with retry.
 */
export async function executeTestPhase(config: WorkflowConfig): Promise<{
  costUsd: number;
  unitTestsPassed: boolean;
  e2eTestsPassed: boolean;
  totalRetries: number;
}> {
  const { orchestratorStatePath, issueNumber, ctx, logsDir } = config;
  let costUsd = 0;

  // Unit tests
  log('Phase: Unit Tests', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: Unit Tests');

  const unitTestsResult = await runUnitTestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
  });
  costUsd += unitTestsResult.costUsd;

  if (!unitTestsResult.passed) {
    const errorMsg = 'Unit tests failed after maximum retry attempts. No PR was created.';
    log(errorMsg, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
    ctx.errorMessage = errorMsg;
    postWorkflowComment(issueNumber, 'error', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        errorMsg
      ),
      metadata: { totalCostUsd: costUsd, unitTestsPassed: false },
    });
    process.exit(1);
  }

  // E2E tests
  log('Phase: E2E Tests', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: E2E Tests');

  const e2eTestsResult = await runE2ETestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
  });
  costUsd += e2eTestsResult.costUsd;

  if (!e2eTestsResult.passed) {
    const errorMsg = 'E2E tests failed after maximum retry attempts. No PR was created.';
    log(errorMsg, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
    ctx.errorMessage = errorMsg;
    postWorkflowComment(issueNumber, 'error', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        errorMsg
      ),
      metadata: { totalCostUsd: costUsd, unitTestsPassed: true, e2eTestsPassed: false },
    });
    process.exit(1);
  }

  log('All tests passed!', 'success');
  AgentStateManager.appendLog(orchestratorStatePath, 'All tests passed');

  return {
    costUsd,
    unitTestsPassed: true,
    e2eTestsPassed: true,
    totalRetries: unitTestsResult.totalRetries + e2eTestsResult.totalRetries,
  };
}

/**
 * Executes the PR phase: create pull request.
 */
export function executePRPhase(config: WorkflowConfig): void {
  const { recoveryState, issueNumber, issue, ctx, defaultBranch, worktreePath } = config;

  if (shouldExecuteStage('pr_created', recoveryState)) {
    postWorkflowComment(issueNumber, 'pr_creating', ctx);
    log('Creating Pull Request...', 'info');

    const prUrl = createPullRequest(issue, '', '', defaultBranch, worktreePath);
    ctx.prUrl = prUrl;

    postWorkflowComment(issueNumber, 'pr_created', ctx);
    log(`Pull Request created: ${prUrl}`, 'success');
  } else {
    log('Skipping PR creation (already completed)', 'info');
  }
}

/**
 * Completes the workflow: writes final state, posts completion comment, prints banner.
 */
export function completeWorkflow(
  config: WorkflowConfig,
  totalCostUsd: number,
  additionalMetadata?: Record<string, unknown>
): void {
  const { orchestratorStatePath, orchestratorName, issueNumber, ctx } = config;

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
