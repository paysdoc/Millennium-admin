#!/usr/bin/env npx tsx
/**
 * ADW Plan, Build & Test - Self-Sufficient Plan+Build+Test+PR Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue and classify it
 * 2. Setup worktree and initialize state
 * 3. Plan phase: classify, create branch, run plan agent, commit plan
 * 4. Build phase: run build agent, commit implementation
 * 5. Test phase: run unit tests and E2E tests with retry
 * 6. PR phase: create pull request (only if all tests pass)
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts for tests (default: 5)
 */

import * as fs from 'fs';
import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  IssueClassSlashCommand,
  commitPrefixMap,
  AgentStateManager,
  AgentState,
  MAX_TEST_RETRY_ATTEMPTS,
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
} from './core';
import {
  fetchGitHubIssue,
  createFeatureBranch,
  commitChanges,
  createPullRequest,
  postWorkflowComment,
  WorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  generateBranchName,
  ensureWorktree,
} from './github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runBuildAgent,
  runUnitTestsWithRetry,
  runE2ETestsWithRetry,
  ProgressCallback,
  ProgressInfo,
} from './agents';
import { classifyGitHubIssue } from './triggers/issueClassifier';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete Plan+Build+Test+PR workflow.');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY        - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH         - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  GITHUB_PAT               - (Optional) GitHub Personal Access Token');
  console.error('  MAX_TEST_RETRY_ATTEMPTS  - Maximum retry attempts for tests (default: 5)');
  process.exit(1);
}

/**
 * Parses and validates command line arguments.
 */
function parseArguments(args: string[]): { issueNumber: number; adwId: string } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const adwId = args[1] || generateAdwId();

  return { issueNumber, adwId };
}

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, adwId } = parseArguments(args);

  log('===================================', 'info');
  log('ADW Plan, Build & Test Orchestrator', 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log(`Max test retry attempts: ${MAX_TEST_RETRY_ATTEMPTS}`, 'info');
  log('===================================', 'info');

  // Step 1: Fetch issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 2: Classify issue
  log('Classifying issue type...', 'info');
  const classificationResult = await classifyGitHubIssue(issue);
  const issueType: IssueClassSlashCommand = classificationResult.issueType;
  log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');

  // Step 3: Setup worktree
  const defaultBranch = getDefaultBranch();
  const branchName = generateBranchName(issueNumber, issue.title, issueType);
  const worktreePath = ensureWorktree(branchName, defaultBranch);
  log(`Default branch: ${defaultBranch}`, 'info');
  log(`Target branch: ${branchName}`, 'info');
  log(`Worktree path: ${worktreePath}`, 'info');

  // Step 4: Initialize state
  const logsDir = ensureLogsDirectory(adwId);
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'plan-build-test-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    agentName: 'plan-build-test-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ADW Plan, Build & Test workflow for issue #${issueNumber}`);

  // Step 5: Detect recovery state
  const recoveryState = detectRecoveryState(issue.comments);

  // Step 6: Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
    issueType,
  };

  // Step 7: Handle recovery mode
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

  try {
    let totalCostUsd = 0;

    // === PLAN PHASE ===

    // Classify issue (post comment)
    if (shouldExecuteStage('classified', recoveryState)) {
      AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
      AgentStateManager.appendLog(orchestratorStatePath, `Issue classified as: ${issueType}`);
      ctx.issueType = issueType;
      postWorkflowComment(issueNumber, 'classified', ctx);
    }

    // Create branch
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

    // Run plan agent
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
        parentAgent: 'plan-build-test-orchestrator',
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
      totalCostUsd += planResult.totalCostUsd || 0;
      postWorkflowComment(issueNumber, 'plan_created', ctx);
    } else {
      log('Skipping Plan Agent (plan already exists or completed)', 'info');
    }

    // Commit plan
    if (shouldExecuteStage('plan_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'plan_committing', ctx);
      commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`, worktreePath);
    } else {
      log('Skipping plan commit (already completed)', 'info');
    }

    // === BUILD PHASE ===

    // Read plan content
    let planContent: string;
    try {
      planContent = fs.readFileSync(planPath, 'utf-8');
      log(`Plan loaded from: ${planPath}`, 'success');
    } catch (error) {
      throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
    }

    // Run build agent
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
        parentAgent: 'plan-build-test-orchestrator',
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
      totalCostUsd += buildResult.totalCostUsd || 0;
      postWorkflowComment(issueNumber, 'implemented', ctx);
    } else {
      log('Skipping Build Agent (already completed)', 'info');
    }

    // Commit implementation
    if (shouldExecuteStage('implementation_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'implementation_committing', ctx);
      commitChanges(`${commitPrefixMap[issueType]} implement #${issueNumber} - ${issue.title}`, worktreePath);
    } else {
      log('Skipping implementation commit (already completed)', 'info');
    }

    // === TEST PHASE ===

    log('Phase: Unit Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: Unit Tests');

    const unitTestsResult = await runUnitTestsWithRetry({
      logsDir,
      orchestratorStatePath,
      maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    });
    totalCostUsd += unitTestsResult.costUsd;

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
        metadata: { totalCostUsd, unitTestsPassed: false },
      });
      process.exit(1);
    }

    log('Phase: E2E Tests', 'info');
    AgentStateManager.appendLog(orchestratorStatePath, 'Starting test phase: E2E Tests');

    const e2eTestsResult = await runE2ETestsWithRetry({
      logsDir,
      orchestratorStatePath,
      maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    });
    totalCostUsd += e2eTestsResult.costUsd;

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
        metadata: { totalCostUsd, unitTestsPassed: true, e2eTestsPassed: false },
      });
      process.exit(1);
    }

    log('All tests passed!', 'success');
    AgentStateManager.appendLog(orchestratorStatePath, 'All tests passed');

    // === PR PHASE ===

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

    // === COMPLETION ===

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
      metadata: {
        totalCostUsd,
        unitTestsPassed: true,
        e2eTestsPassed: true,
        totalTestRetries: unitTestsResult.totalRetries + e2eTestsResult.totalRetries,
      },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'Plan, Build & Test workflow completed successfully');

    postWorkflowComment(issueNumber, 'completed', ctx);

    log('===================================', 'info');
    log('ADW Plan, Build & Test workflow completed!', 'success');
    if (ctx.prUrl) {
      log(`PR: ${ctx.prUrl}`, 'info');
    }
    log('===================================', 'info');

  } catch (error) {
    ctx.errorMessage = String(error);
    postWorkflowComment(issueNumber, 'error', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        String(error)
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `Plan, Build & Test workflow failed: ${error}`);

    log(`Plan, Build & Test workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
