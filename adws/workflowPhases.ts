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
import * as path from 'path';
import {
  log,
  ensureLogsDirectory,
  generateAdwId,
  type IssueClassSlashCommand,
  type GitHubIssue,
  type PRDetails,
  type PRReviewComment,
  AgentStateManager,
  type AgentState,
  type AgentIdentifier,
  type RecoveryState,
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
  MAX_TEST_RETRY_ATTEMPTS,
  MAX_REVIEW_RETRY_ATTEMPTS,
  COST_REPORT_CURRENCIES,
  type ModelUsageMap,
  mergeModelUsageMaps,
  emptyModelUsageMap,
  buildCostBreakdown,
  formatCostBreakdownMarkdown,
  persistTokenCounts,
} from './core';
import {
  fetchGitHubIssue,
  fetchPRDetails,
  getUnaddressedComments,
  pushBranch,
  createPullRequest,
  postWorkflowComment,
  postPRWorkflowComment,
  type WorkflowContext,
  type PRReviewWorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  checkoutDefaultBranch,
  ensureWorktree,
  getWorktreeForBranch,
  mergeLatestFromDefaultBranch,
  copyEnvToWorktree,
  inferIssueTypeFromBranch,
} from './github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runBuildAgent,
  runPrReviewPlanAgent,
  runPrReviewBuildAgent,
  runGenerateBranchNameAgent,
  runCommitAgent,
  type ProgressCallback,
  type ProgressInfo,
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
  runReviewWithRetry,
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
  branchName: string;
}

/**
 * Initializes a workflow: fetches issue, classifies type, sets up worktree,
 * initializes state, and detects recovery mode.
 */
export async function initializeWorkflow(
  issueNumber: number,
  adwId: string | null,
  orchestratorName: AgentIdentifier,
  options?: { cwd?: string; issueType?: IssueClassSlashCommand }
): Promise<WorkflowConfig> {
  // Fetch issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Detect recovery state early to reuse existing ADW ID and branch name
  const recoveryState = detectRecoveryState(issue.comments);

  // Resolve ADW ID: use provided, recovered from prior workflow, or generate new
  const resolvedAdwId = adwId ?? recoveryState.adwId ?? generateAdwId(issue.title);

  log('===================================', 'info');
  log(`${orchestratorName}`, 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${resolvedAdwId}`, 'info');
  log('===================================', 'info');

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

  // Initialize logs early so agents can use the directory
  const logsDir = ensureLogsDirectory(resolvedAdwId);

  // Setup worktree with branch sync
  const defaultBranch = getDefaultBranch();
  let worktreePath: string;
  let branchName = '';
  if (options?.cwd) {
    mergeLatestFromDefaultBranch(defaultBranch, options.cwd);
    worktreePath = options.cwd;
    log('Using provided worktree (merged latest code)', 'info');
  } else {
    // Reuse recovered branch name or generate a new one
    if (recoveryState.branchName) {
      branchName = recoveryState.branchName;
      log(`Reusing branch from previous workflow: ${branchName}`, 'info');
    } else {
      const branchResult = await runGenerateBranchNameAgent(
        issueType, resolvedAdwId, issue, logsDir
      );
      branchName = branchResult.branchName;
      log(`Branch name generated: ${branchName}`, 'success');
    }

    // Check if a worktree already exists for this branch
    const existingWorktree = getWorktreeForBranch(branchName);
    if (existingWorktree) {
      log(`Reusing existing worktree at ${existingWorktree}`, 'info');
      mergeLatestFromDefaultBranch(defaultBranch, existingWorktree);
      copyEnvToWorktree(existingWorktree);
      worktreePath = existingWorktree;
    } else {
      // Ensure main repo is on default branch with latest code
      checkoutDefaultBranch();
      // Create worktree with new branch atomically via git worktree add -b
      worktreePath = ensureWorktree(branchName, defaultBranch);
    }
    log(`Worktree path: ${worktreePath}`, 'info');
  }
  const orchestratorStatePath = AgentStateManager.initializeState(resolvedAdwId, orchestratorName);
  log(`State: ${orchestratorStatePath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId: resolvedAdwId,
    issueNumber,
    agentName: orchestratorName,
    pid: process.pid,
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ${orchestratorName} workflow for issue #${issueNumber}`);

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId: resolvedAdwId,
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
    adwId: resolvedAdwId,
    issue,
    issueType,
    worktreePath,
    defaultBranch,
    logsDir,
    orchestratorStatePath,
    orchestratorName,
    recoveryState,
    ctx,
    branchName,
  };
}

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
    if (recoveryState.branchName) {
      ctx.branchName = recoveryState.branchName;
    }
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
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
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

/**
 * Executes the Test phase: run unit tests and E2E tests with retry.
 */
export async function executeTestPhase(config: WorkflowConfig): Promise<{
  costUsd: number;
  modelUsage: ModelUsageMap;
  unitTestsPassed: boolean;
  e2eTestsPassed: boolean;
  totalRetries: number;
}> {
  const { orchestratorStatePath, issueNumber, ctx, logsDir, worktreePath } = config;
  let costUsd = 0;
  let modelUsage = emptyModelUsageMap();

  // Unit tests
  log('Phase: Unit Tests', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: Unit Tests');

  const unitTestsResult = await runUnitTestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    cwd: worktreePath,
  });
  costUsd += unitTestsResult.costUsd;
  modelUsage = mergeModelUsageMaps(modelUsage, unitTestsResult.modelUsage);

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
    cwd: worktreePath,
  });
  costUsd += e2eTestsResult.costUsd;
  modelUsage = mergeModelUsageMaps(modelUsage, e2eTestsResult.modelUsage);

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
    modelUsage,
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
export async function completeWorkflow(
  config: WorkflowConfig,
  totalCostUsd: number,
  additionalMetadata?: Record<string, unknown>,
  modelUsage?: ModelUsageMap,
): Promise<void> {
  const { orchestratorStatePath, orchestratorName, issueNumber, ctx } = config;

  // Build cost breakdown if model usage data is available
  if (modelUsage && Object.keys(modelUsage).length > 0) {
    const costBreakdown = await buildCostBreakdown(modelUsage, [...COST_REPORT_CURRENCIES]);
    ctx.costBreakdown = costBreakdown;
  }

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
 * Executes the Review phase: run review agent with retry and patching.
 */
export async function executeReviewPhase(config: WorkflowConfig): Promise<{
  costUsd: number;
  modelUsage: ModelUsageMap;
  reviewPassed: boolean;
  totalRetries: number;
}> {
  const { orchestratorStatePath, issueNumber, issue, issueType, ctx, logsDir, worktreePath, branchName, adwId } = config;

  log('Phase: Review', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting review phase');

  const specFile = getPlanFilePath(issueNumber);

  postWorkflowComment(issueNumber, 'review_running', ctx);

  const reviewResult = await runReviewWithRetry({
    adwId,
    specFile,
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_REVIEW_RETRY_ATTEMPTS,
    branchName,
    issueType,
    issueContext: JSON.stringify(issue),
    onReviewFailed: (attempt, maxAttempts) => {
      log(`Review failed (attempt ${attempt}/${maxAttempts}), patching...`, 'info');
      postWorkflowComment(issueNumber, 'review_patching', ctx);
    },
    cwd: worktreePath,
  });

  if (reviewResult.passed) {
    log('Review passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'Review passed');
    postWorkflowComment(issueNumber, 'review_passed', ctx);
  } else {
    const errorMsg = `Review failed after ${MAX_REVIEW_RETRY_ATTEMPTS} attempts with ${reviewResult.blockerIssues.length} remaining blocker(s)`;
    log(errorMsg, 'error');
    AgentStateManager.appendLog(orchestratorStatePath, errorMsg);
    ctx.errorMessage = errorMsg;
    postWorkflowComment(issueNumber, 'review_failed', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        errorMsg
      ),
      metadata: { totalCostUsd: reviewResult.costUsd, reviewPassed: false },
    });
  }

  return {
    costUsd: reviewResult.costUsd,
    modelUsage: reviewResult.modelUsage,
    reviewPassed: reviewResult.passed,
    totalRetries: reviewResult.totalRetries,
  };
}

/**
 * Handles workflow errors: posts error comment, writes failed state, and exits.
 * Optionally persists accumulated token counts so cost data survives the crash.
 */
export function handleWorkflowError(
  config: WorkflowConfig,
  error: unknown,
  costUsd?: number,
  modelUsage?: ModelUsageMap,
): never {
  const { orchestratorStatePath, orchestratorName, issueNumber, ctx } = config;

  if (costUsd !== undefined && modelUsage) {
    persistTokenCounts(orchestratorStatePath, costUsd, modelUsage);
  }

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

// ============================================================================
// PR Review Workflow Phases
// ============================================================================

/**
 * Configuration shared across all PR review workflow phase functions.
 * Created by initializePRReviewWorkflow() and passed to every phase.
 */
export interface PRReviewWorkflowConfig {
  prNumber: number;
  issueNumber: number;
  adwId: string;
  prDetails: PRDetails;
  unaddressedComments: PRReviewComment[];
  worktreePath: string;
  logsDir: string;
  orchestratorStatePath: string;
  ctx: PRReviewWorkflowContext;
}

/**
 * Initializes a PR review workflow: fetches PR details, checks for unaddressed
 * comments, sets up worktree, and initializes state.
 */
export function initializePRReviewWorkflow(prNumber: number, adwId: string | null): PRReviewWorkflowConfig {
  const prDetails = fetchPRDetails(prNumber);
  log(`Fetched PR: ${prDetails.title}`, 'success');

  // Resolve ADW ID: use provided or generate from PR title
  const resolvedAdwId = adwId ?? generateAdwId(prDetails.title);

  log('===================================', 'info');
  log('PR Review Orchestrator', 'info');
  log(`PR: #${prNumber}`, 'info');
  log(`ADW ID: ${resolvedAdwId}`, 'info');
  log('===================================', 'info');

  if (prDetails.state === 'CLOSED' || prDetails.state === 'MERGED') {
    log(`PR #${prNumber} is ${prDetails.state}, skipping`, 'info');
    process.exit(0);
  }

  const unaddressedComments = getUnaddressedComments(prNumber);

  if (unaddressedComments.length === 0) {
    log(`No unaddressed review comments on PR #${prNumber}, exiting`, 'info');
    process.exit(0);
  }

  log(`Found ${unaddressedComments.length} unaddressed review comment(s)`, 'info');

  const logsDir = ensureLogsDirectory(resolvedAdwId);
  const issueNumber = prDetails.issueNumber || 0;
  const orchestratorStatePath = AgentStateManager.initializeState(resolvedAdwId, 'pr-review-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId: resolvedAdwId,
    issueNumber,
    branchName: prDetails.headBranch,
    agentName: 'pr-review-orchestrator',
    pid: process.pid,
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { prNumber, reviewComments: unaddressedComments.length },
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting PR Review workflow for PR #${prNumber}`);

  const ctx: PRReviewWorkflowContext = {
    issueNumber,
    adwId: resolvedAdwId,
    prNumber,
    reviewComments: unaddressedComments.length,
    branchName: prDetails.headBranch,
  };

  const worktreePath = ensureWorktree(prDetails.headBranch);
  log(`Worktree path: ${worktreePath}`, 'info');

  postPRWorkflowComment(prNumber, 'pr_review_starting', ctx);

  return {
    prNumber,
    issueNumber,
    adwId: resolvedAdwId,
    prDetails,
    unaddressedComments,
    worktreePath,
    logsDir,
    orchestratorStatePath,
    ctx,
  };
}

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

/**
 * Executes the PR review Test phase: runs unit and E2E tests with retry.
 */
export async function executePRReviewTestPhase(config: PRReviewWorkflowConfig): Promise<void> {
  const { prNumber, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  postPRWorkflowComment(prNumber, 'pr_review_testing', ctx);
  log('Running validation tests...', 'info');
  AgentStateManager.appendLog(orchestratorStatePath, 'Starting validation tests');

  const onTestFailed = (attempt: number, maxAttempts: number) => {
    ctx.testAttempt = attempt;
    ctx.maxTestAttempts = maxAttempts;
    postPRWorkflowComment(prNumber, 'pr_review_test_failed', ctx);
  };

  const unitTestsResult = await runUnitTestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    onTestFailed,
    cwd: worktreePath,
  });

  if (!unitTestsResult.passed) {
    ctx.failedTests = unitTestsResult.failedTests;
    ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
    postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        `Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
      ),
      metadata: { prNumber, reviewComments: unaddressedComments.length, testFailure: true, failedTests: unitTestsResult.failedTests },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: unit tests exceeded max retry attempts');

    log(`Unit tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
    process.exit(1);
  }

  const e2eTestsResult = await runE2ETestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    onTestFailed,
    cwd: worktreePath,
  });

  if (!e2eTestsResult.passed) {
    ctx.failedTests = e2eTestsResult.failedTests;
    ctx.maxTestAttempts = MAX_TEST_RETRY_ATTEMPTS;
    postPRWorkflowComment(prNumber, 'pr_review_test_max_attempts', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        `E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts`
      ),
      metadata: { prNumber, reviewComments: unaddressedComments.length, testFailure: true, failedTests: e2eTestsResult.failedTests },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow failed: E2E tests exceeded max retry attempts');

    log(`E2E tests failed after ${MAX_TEST_RETRY_ATTEMPTS} attempts. Changes not pushed.`, 'error');
    process.exit(1);
  }

  postPRWorkflowComment(prNumber, 'pr_review_test_passed', ctx);
  log('All validation tests passed!', 'success');
  AgentStateManager.appendLog(orchestratorStatePath, 'All validation tests passed');
}

/**
 * Completes the PR review workflow: commits, pushes, and posts completion comments.
 */
export async function completePRReviewWorkflow(config: PRReviewWorkflowConfig, modelUsage?: ModelUsageMap): Promise<void> {
  const { prNumber, prDetails, unaddressedComments, worktreePath, logsDir, orchestratorStatePath, ctx } = config;

  // Build cost breakdown if model usage data is available
  if (modelUsage && Object.keys(modelUsage).length > 0) {
    const costBreakdown = await buildCostBreakdown(modelUsage, [...COST_REPORT_CURRENCIES]);
    ctx.costBreakdown = costBreakdown;
  }

  postPRWorkflowComment(prNumber, 'pr_review_committing', ctx);
  const issueType = inferIssueTypeFromBranch(prDetails.headBranch);
  await runCommitAgent('pr-review-orchestrator', issueType, JSON.stringify(prDetails), logsDir, undefined, worktreePath);

  pushBranch(prDetails.headBranch, worktreePath);
  postPRWorkflowComment(prNumber, 'pr_review_pushed', ctx);
  postPRWorkflowComment(prNumber, 'pr_review_completed', ctx);

  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(AgentStateManager.createExecutionState('running'), true),
  });
  AgentStateManager.appendLog(orchestratorStatePath, 'PR Review workflow completed successfully');

  log('ADW PR Review workflow completed!', 'success');
  log(`PR: ${prDetails.url}`, 'info');
  log(`Comments addressed: ${unaddressedComments.length}`, 'info');
}

/**
 * Handles PR review workflow errors: posts error comment, writes failed state, and exits.
 */
export function handlePRReviewWorkflowError(config: PRReviewWorkflowConfig, error: unknown): never {
  const { prNumber, orchestratorStatePath, ctx } = config;

  ctx.errorMessage = String(error);
  postPRWorkflowComment(prNumber, 'pr_review_error', ctx);

  AgentStateManager.writeState(orchestratorStatePath, {
    execution: AgentStateManager.completeExecution(
      AgentStateManager.createExecutionState('running'),
      false,
      String(error)
    ),
  });
  AgentStateManager.appendLog(orchestratorStatePath, `PR Review workflow failed: ${error}`);

  log(`PR Review workflow failed: ${error}`, 'error');
  process.exit(1);
}
