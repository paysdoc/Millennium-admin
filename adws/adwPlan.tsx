#!/usr/bin/env npx tsx
/**
 * ADW Plan - AI Developer Workflow Planning Phase
 *
 * Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id] [--cwd <path>] [--issue-type <type>]
 *
 * Workflow:
 * 1. Fetch GitHub issue
 * 2. Setup worktree (with latest code from default branch)
 * 3. Detect recovery state from existing comments
 * 4. Classify issue type (feature, bug, chore, pr_review)
 * 5. Create feature branch: {type}/issue-{number}-{slug}
 * 6. Run Plan Agent: generate implementation plan
 * 7. Commit the plan
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
  shouldExecuteStage,
  handleRecoveryMode,
  executeClassifyStep,
  executeCreateBranchStep,
  executePlanAgentStep,
  executeCommitPlanStep,
  handleWorkflowError,
  setupWorktreeWithLatestCode,
  WorkflowParams,
} from './core';
import {
  fetchGitHubIssue,
  postWorkflowComment,
  WorkflowContext,
  detectRecoveryState,
  getDefaultBranch,
  generateBranchName,
  mergeLatestFromDefaultBranch,
} from './github';
import { getPlanFilePath } from './agents';
import { classifyGitHubIssue } from './triggers/issueClassifier';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id] [--cwd <path>] [--issue-type <type>]');
  console.error('');
  console.error('Options:');
  console.error('  --cwd <path>         Working directory for git operations (worktree path)');
  console.error('  --issue-type <type>  Pre-classified issue type (skips classification step)');
  console.error('                       Valid values: /feature, /bug, /chore, /pr_review');
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
function parseArguments(args: string[]): {
  issueNumber: number;
  providedAdwId: string | null;
  cwd: string | null;
  providedIssueType: IssueClassSlashCommand | null;
} {
  if (args.length < 1) {
    printUsageAndExit();
  }

  // Parse --cwd option
  let cwd: string | null = null;
  const cwdIndex = args.indexOf('--cwd');
  if (cwdIndex !== -1 && args[cwdIndex + 1]) {
    cwd = args[cwdIndex + 1];
    args.splice(cwdIndex, 2);
  }

  // Parse --issue-type option
  let providedIssueType: IssueClassSlashCommand | null = null;
  const issueTypeIndex = args.indexOf('--issue-type');
  if (issueTypeIndex !== -1 && args[issueTypeIndex + 1]) {
    const typeValue = args[issueTypeIndex + 1];
    const validTypes: IssueClassSlashCommand[] = ['/feature', '/bug', '/chore', '/pr_review'];
    if (validTypes.includes(typeValue as IssueClassSlashCommand)) {
      providedIssueType = typeValue as IssueClassSlashCommand;
    } else {
      console.error(`Invalid issue type: ${typeValue}. Valid values: ${validTypes.join(', ')}`);
      process.exit(1);
    }
    args.splice(issueTypeIndex, 2);
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const providedAdwId = args[1] || null;

  return { issueNumber, providedAdwId, cwd, providedIssueType };
}

/**
 * Prints the planning phase summary.
 */
function printPlanSummary(
  issueNumber: number,
  issueTitle: string,
  adwId: string,
  branchName: string,
  planPath: string,
  logsDir: string,
  costUsd: number
): void {
  log('===================================', 'info');
  log('ADW Plan workflow completed!', 'success');
  log(`Issue: #${issueNumber} - ${issueTitle}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log(`Branch: ${branchName}`, 'info');
  log(`Plan: ${planPath}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  if (costUsd > 0) {
    log(`Cost: $${costUsd.toFixed(4)}`, 'info');
  }

  log('===================================', 'info');
}

/**
 * Main planning workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId, cwd, providedIssueType } = parseArguments(args);

  log(`Starting ADW Plan workflow`, 'info');
  log(`Issue: #${issueNumber}`, 'info');
  if (cwd) {
    log(`Working directory: ${cwd}`, 'info');
  }
  if (providedIssueType) {
    log(`Pre-classified issue type: ${providedIssueType}`, 'info');
  }

  // Step 1: Fetch GitHub issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 2: Setup working directory
  const defaultBranch = getDefaultBranch();
  let workingDir: string;
  if (cwd) {
    mergeLatestFromDefaultBranch(defaultBranch, cwd);
    workingDir = cwd;
    log('Using provided worktree (merged latest code)', 'info');
  } else {
    const tempBranchName = generateBranchName(issueNumber, issue.title, providedIssueType || '/feature');
    workingDir = setupWorktreeWithLatestCode(tempBranchName, defaultBranch);
  }

  // Step 3: Detect recovery state from existing comments
  const recoveryState = detectRecoveryState(issue.comments);

  // Step 4: Determine ADW ID
  let adwId: string;
  if (providedAdwId) {
    adwId = providedAdwId;
  } else if (recoveryState.canResume && recoveryState.adwId) {
    adwId = recoveryState.adwId;
    log(`Recovery mode: using existing ADW ID: ${adwId}`, 'info');
  } else {
    adwId = generateAdwId();
  }

  const logsDir = ensureLogsDirectory(adwId);
  log(`ADW ID: ${adwId}`, 'info');
  log(`Logs: ${logsDir}`, 'info');

  // Initialize orchestrator state
  const orchestratorStatePath = AgentStateManager.initializeState(adwId, 'plan-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId,
    issueNumber,
    agentName: 'plan-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting ADW Plan workflow for issue #${issueNumber}`);

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
  };

  // Step 5: Classify issue type (adwPlan has unique --issue-type flag handling)
  let issueType: IssueClassSlashCommand;
  if (providedIssueType) {
    log(`Using pre-classified issue type: ${providedIssueType}`, 'info');
    issueType = providedIssueType;
  } else {
    log('Classifying issue type...', 'info');
    const classificationResult = await classifyGitHubIssue(issue);
    issueType = classificationResult.issueType;
    log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');
  }
  ctx.issueType = issueType;

  // Build workflow params
  const params: WorkflowParams = {
    issueNumber,
    adwId,
    issue,
    issueType,
    recoveryState,
    orchestratorStatePath,
    orchestratorName: 'plan-orchestrator',
    ctx,
    workingDir,
    logsDir,
  };

  // Handle recovery mode
  handleRecoveryMode(params);

  try {
    // Classify step (post comment for classification)
    executeClassifyStep(params);

    // Create branch
    const branchName = executeCreateBranchStep(params);

    // Run Plan Agent
    const planCostUsd = await executePlanAgentStep(params, branchName);

    // Commit plan
    executeCommitPlanStep(params);

    // Update final state
    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        true
      ),
      metadata: {
        totalCostUsd: planCostUsd,
      },
    });
    AgentStateManager.appendLog(orchestratorStatePath, 'Plan workflow completed successfully');

    // Print summary
    const planPath = getPlanFilePath(issueNumber);
    printPlanSummary(
      issueNumber,
      issue.title,
      adwId,
      branchName,
      planPath,
      logsDir,
      planCostUsd
    );

  } catch (error) {
    handleWorkflowError(error, orchestratorStatePath, ctx, issueNumber, 'Plan workflow');
  }
}

main();
