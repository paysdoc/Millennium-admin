#!/usr/bin/env npx tsx
/**
 * ADW Plan & Build - Self-Sufficient Plan+Build+PR Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue
 * 2. Setup worktree (with latest code from default branch)
 * 3. Detect recovery state from existing comments
 * 4. Classify issue type (feature, bug, chore, pr_review)
 * 5. Create feature branch: {type}/issue-{number}-{slug}
 * 6. Run Plan Agent: generate implementation plan
 * 7. Commit the plan
 * 8. Run Build Agent: implement the plan
 * 9. Commit the implementation
 * 10. Create Pull Request
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  IssueClassSlashCommand,
  AgentStateManager,
  AgentState,
  setupWorktreeWithLatestCode,
  handleRecoveryMode,
  executeClassifyStep,
  executeCreateBranchStep,
  executePlanAgentStep,
  executeCommitPlanStep,
  readPlanContent,
  executeBuildAgentStep,
  executeCommitImplementationStep,
  executePRCreationStep,
  completeWorkflow,
  handleWorkflowError,
  WorkflowParams,
} from './core';
import {
  fetchGitHubIssue,
  WorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  generateBranchName,
} from './github';
import { getPlanFilePath } from './agents';
import { classifyGitHubIssue } from './triggers/issueClassifier';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete Plan+Build+PR workflow.');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY  - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH   - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  GITHUB_PAT         - (Optional) GitHub Personal Access Token');
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
  log('ADW Plan & Build Orchestrator', 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log('===================================', 'info');

  // Step 1: Fetch issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 2: Setup worktree with latest code
  const defaultBranch = getDefaultBranch();
  const tempBranchName = generateBranchName(issueNumber, issue.title, '/feature');
  const worktreePath = setupWorktreeWithLatestCode(tempBranchName, defaultBranch);
  log(`Default branch: ${defaultBranch}`, 'info');

  // Step 3: Detect recovery state
  const recoveryState = detectRecoveryState(issue.comments);

  // Step 4: Classify issue
  log('Classifying issue type...', 'info');
  const classificationResult = await classifyGitHubIssue(issue);
  const issueType: IssueClassSlashCommand = classificationResult.issueType;
  log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');

  // Initialize state
  const logsDir = ensureLogsDirectory(adwId);
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'plan-build-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    agentName: 'plan-build-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ADW Plan & Build workflow for issue #${issueNumber}`);

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
    issueType,
  };

  // Build workflow params
  const params: WorkflowParams = {
    issueNumber,
    adwId,
    issue,
    issueType,
    recoveryState,
    orchestratorStatePath,
    orchestratorName: 'plan-build-orchestrator',
    ctx,
    workingDir: worktreePath,
    logsDir,
  };

  // Handle recovery mode
  handleRecoveryMode(params);

  try {
    let totalCostUsd = 0;

    // === PLAN PHASE ===
    executeClassifyStep(params);
    const currentBranch = executeCreateBranchStep(params);
    totalCostUsd += await executePlanAgentStep(params, currentBranch);
    executeCommitPlanStep(params);

    // === BUILD PHASE ===
    const planPath = getPlanFilePath(issueNumber);
    const planContent = readPlanContent(planPath);
    totalCostUsd += await executeBuildAgentStep(params, planContent, currentBranch);
    executeCommitImplementationStep(params);

    // === PR PHASE ===
    executePRCreationStep(params, defaultBranch);

    // === COMPLETION ===
    completeWorkflow(orchestratorStatePath, ctx, issueNumber, { totalCostUsd });

    log('===================================', 'info');
    log('ADW Plan & Build workflow completed!', 'success');
    if (ctx.prUrl) {
      log(`PR: ${ctx.prUrl}`, 'info');
    }
    log('===================================', 'info');

  } catch (error) {
    handleWorkflowError(error, orchestratorStatePath, ctx, issueNumber, 'Plan & Build workflow');
  }
}

main();
