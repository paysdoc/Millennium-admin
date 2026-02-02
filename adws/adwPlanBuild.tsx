#!/usr/bin/env npx tsx
/**
 * ADW Plan & Build - AI Developer Workflow
 *
 * Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue details
 * 2. Create feature branch: feature/issue-{number}-{slug}
 * 3. Plan Agent: Generate implementation plan
 * 4. Build Agent: Implement the solution
 * 5. Create PR with full context
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  GitHubIssue,
  IssueClassSlashCommand,
  WorkflowStage,
  RecoveryState,
} from './core';
import {
  fetchGitHubIssue,
  createFeatureBranch,
  commitChanges,
  createPullRequest,
  postWorkflowComment,
  WorkflowContext,
  detectRecoveryState,
  STAGE_ORDER,
  checkoutDefaultBranch,
} from './github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
  runBuildAgent,
  runClaudeAgent,
  ProgressCallback,
  ProgressInfo,
} from './agents';

/**
 * Classifies a GitHub issue as feature, bug, or chore using the haiku model.
 */
async function classifyIssue(issue: GitHubIssue, logsDir: string): Promise<IssueClassSlashCommand> {
  const labelsText = issue.labels.map(l => l.name).join(', ') || 'none';

  const prompt = `Based on the Github Issue below, follow the Instructions to select the appropriate command to execute based on the Command Mapping.

## Instructions

- Based on the details in the Github Issue, select the appropriate command to execute.
- Respond exclusively with '/' followed by the command to execute.
- Use the command mapping to help you decide which command to respond with.
- Think hard about the command to execute.

## Command Mapping

- Respond with /chore if the issue is a chore.
- Respond with /bug if the issue is a bug.
- Respond with /feature if the issue is a feature.
- Respond with 0 if the issue isn't any of the above.

## Github Issue

**Title:** ${issue.title}
**Labels:** ${labelsText}

${issue.body || 'No description provided.'}`;

  const outputFile = path.join(logsDir, 'classifier-agent.jsonl');
  const result = await runClaudeAgent(prompt, 'Classifier', outputFile, 'haiku');

  if (!result.success) {
    log('Classification failed, defaulting to /feature', 'info');
    return '/feature';
  }

  const output = result.output.trim();
  const validCommands: IssueClassSlashCommand[] = ['/feature', '/bug', '/chore'];

  for (const cmd of validCommands) {
    if (output.includes(cmd)) {
      return cmd;
    }
  }

  if (output === '0') {
    log('Issue classified as unknown type, defaulting to /feature', 'info');
    return '/feature';
  }

  log('Could not parse classification result, defaulting to /feature', 'info');
  return '/feature';
}

const commitPrefixMap: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feat:',
  '/bug': 'fix:',
  '/chore': 'chore:',
};

/**
 * Determines if a stage should be executed based on recovery state.
 * Returns false if the stage has already been completed in a previous run.
 */
function shouldExecuteStage(stage: WorkflowStage, recoveryState: RecoveryState): boolean {
  if (!recoveryState.canResume || !recoveryState.lastCompletedStage) {
    return true;
  }

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const lastCompletedIndex = STAGE_ORDER.indexOf(recoveryState.lastCompletedStage);

  return stageIndex > lastCompletedIndex;
}

/**
 * Checks if there are uncommitted changes in the working directory.
 */
function hasUncommittedChanges(): boolean {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Gets the next stage to resume from based on the last completed stage.
 */
function getNextStage(lastCompletedStage: WorkflowStage): WorkflowStage {
  const index = STAGE_ORDER.indexOf(lastCompletedStage);
  if (index === -1 || index >= STAGE_ORDER.length - 1) {
    return 'starting';
  }
  return STAGE_ORDER[index + 1];
}

/**
 * Prints the final workflow summary.
 */
function printWorkflowSummary(
  issueNumber: number,
  issueTitle: string,
  branchName: string,
  logsDir: string,
  prUrl: string,
  planCostUsd: number,
  buildCostUsd: number
): void {
  log('===================================', 'info');
  log('ADW Plan & Build workflow completed!', 'success');
  log(`Issue: #${issueNumber} - ${issueTitle}`, 'info');
  log(`Branch: ${branchName}`, 'info');
  log(`Plan: ${getPlanFilePath(issueNumber)}`, 'info');

  if (prUrl) {
    log(`PR: ${prUrl}`, 'info');
  }

  log(`Logs: ${logsDir}`, 'info');

  const totalCost = planCostUsd + buildCostUsd;
  if (totalCost > 0) {
    log(`Total cost: $${totalCost.toFixed(4)}`, 'info');
  }

  log('===================================', 'info');
}

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('Environment Requirements:');
  console.error('  ANTHROPIC_API_KEY  - Anthropic API key');
  console.error('  CLAUDE_CODE_PATH   - Path to Claude CLI (default: /usr/local/bin/claude)');
  console.error('  GITHUB_PAT         - (Optional) GitHub Personal Access Token');
  process.exit(1);
}

/**
 * Parses and validates command line arguments.
 * Returns the adwId as null if not provided (will be determined during recovery detection).
 */
function parseArguments(args: string[]): { issueNumber: number; providedAdwId: string | null } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const providedAdwId = args[1] || null;

  return { issueNumber, providedAdwId };
}

/**
 * Main workflow orchestrator.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId } = parseArguments(args);

  log(`Starting ADW Plan & Build workflow`, 'info');
  log(`Issue: #${issueNumber}`, 'info');

  // Step 1: Fetch GitHub issue first to detect recovery state
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 1.5: Checkout default branch and pull latest changes
  // This ensures feature branches are created from the latest code
  const defaultBranch = checkoutDefaultBranch();

  // Detect recovery state from existing comments
  const recoveryState = detectRecoveryState(issue.comments);

  // Determine ADW ID - use provided, or recovered, or generate new
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

  // Initialize workflow context
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
  };

  // Check for recovery mode
  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');

    // Warn if there are uncommitted changes
    if (hasUncommittedChanges()) {
      log('Warning: There are uncommitted changes in the working directory', 'info');
    }

    // Pre-populate context from recovery state
    if (recoveryState.branchName) ctx.branchName = recoveryState.branchName;
    if (recoveryState.planPath) ctx.planPath = recoveryState.planPath;
    if (recoveryState.prUrl) ctx.prUrl = recoveryState.prUrl;

    // Post resuming comment
    const nextStage = getNextStage(recoveryState.lastCompletedStage);
    ctx.resumeFrom = nextStage;
    postWorkflowComment(issueNumber, 'resuming', ctx);
  } else {
    // Post starting comment for new workflow
    postWorkflowComment(issueNumber, 'starting', ctx);
  }

  try {
    // Track costs for agents that run
    let planCostUsd = 0;
    let buildCostUsd = 0;
    let branchName = ctx.branchName || '';

    // Step 1.5: Classify issue type
    let issueType: IssueClassSlashCommand;
    if (shouldExecuteStage('classified', recoveryState)) {
      log('Classifying issue type...', 'info');
      issueType = await classifyIssue(issue, logsDir);
      log(`Issue classified as: ${issueType}`, 'success');
      ctx.issueType = issueType;
      postWorkflowComment(issueNumber, 'classified', ctx);
    } else {
      log('Skipping classification (already completed)', 'info');
      // Default to feature if we can't determine from recovery
      issueType = '/feature';
      ctx.issueType = issueType;
    }

    // Step 2: Create feature branch
    if (shouldExecuteStage('branch_created', recoveryState)) {
      log('Creating feature branch...', 'info');
      branchName = createFeatureBranch(issueNumber, issue.title);
      log(`On branch: ${branchName}`, 'success');
      ctx.branchName = branchName;
      postWorkflowComment(issueNumber, 'branch_created', ctx);
    } else {
      log('Skipping branch creation (already completed)', 'info');
      // If we have a branch from recovery state, check it out
      if (recoveryState.branchName) {
        branchName = createFeatureBranch(issueNumber, issue.title);
        ctx.branchName = branchName;
      }
    }

    // Step 3: Run Plan Agent
    const planPath = getPlanFilePath(issueNumber);
    ctx.planPath = planPath;

    if (shouldExecuteStage('plan_created', recoveryState) && !planFileExists(issueNumber)) {
      postWorkflowComment(issueNumber, 'plan_building', ctx);
      log('Running Plan Agent...', 'info');
      const planResult = await runPlanAgent(issue, logsDir, issueType);

      if (!planResult.success) {
        throw new Error(`Plan Agent failed: ${planResult.output}`);
      }

      ctx.planOutput = planResult.output;
      planCostUsd = planResult.totalCostUsd || 0;
      postWorkflowComment(issueNumber, 'plan_created', ctx);
    } else {
      log('Skipping Plan Agent (plan already exists or completed)', 'info');
    }

    // Commit plan (only if there are changes)
    if (shouldExecuteStage('plan_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'plan_committing', ctx);
      commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`);
    } else {
      log('Skipping plan commit (already completed)', 'info');
    }

    // Step 4: Run Build Agent
    if (shouldExecuteStage('implemented', recoveryState)) {
      postWorkflowComment(issueNumber, 'implementing', ctx);
      log('Running Build Agent...', 'info');

      // Read plan content to pass to Build Agent
      let planContent: string;
      try {
        planContent = fs.readFileSync(planPath, 'utf-8');
      } catch (error) {
        throw new Error(`Cannot read plan file at ${planPath}: ${error}`);
      }

      // Track progress and post periodic updates
      let lastProgressUpdate = Date.now();
      const PROGRESS_UPDATE_INTERVAL_MS = 60000; // Post progress every 60 seconds

      const buildProgressCallback: ProgressCallback = (info: ProgressInfo) => {
        // Update context with latest progress info
        ctx.buildProgress = {
          turnCount: info.turnCount || 0,
          toolCount: info.toolCount || 0,
          lastToolName: info.toolName,
          lastText: info.text,
        };

        // Log progress locally
        if (info.type === 'tool_use') {
          log(`  [Turn ${info.turnCount}] Tool: ${info.toolName}`, 'info');
        }

        // Post progress update to GitHub if enough time has passed
        const now = Date.now();
        if (now - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL_MS) {
          postWorkflowComment(issueNumber, 'build_progress', ctx);
          lastProgressUpdate = now;
        }
      };

      const buildResult = await runBuildAgent(issue, logsDir, planContent, buildProgressCallback);

      if (!buildResult.success) {
        throw new Error(`Build Agent failed: ${buildResult.output}`);
      }

      ctx.buildOutput = buildResult.output;
      buildCostUsd = buildResult.totalCostUsd || 0;
      postWorkflowComment(issueNumber, 'implemented', ctx);
    } else {
      log('Skipping Build Agent (already completed)', 'info');
    }

    // Commit implementation (only if there are changes)
    if (shouldExecuteStage('implementation_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'implementation_committing', ctx);
      commitChanges(`feat: implement #${issueNumber} - ${issue.title}`);
    } else {
      log('Skipping implementation commit (already completed)', 'info');
    }

    // Step 5: Create PR
    if (shouldExecuteStage('pr_created', recoveryState) && !ctx.prUrl) {
      postWorkflowComment(issueNumber, 'pr_creating', ctx);
      log('Creating Pull Request...', 'info');
      const prUrl = createPullRequest(issue, ctx.planOutput || '', ctx.buildOutput || '');
      ctx.prUrl = prUrl;
      postWorkflowComment(issueNumber, 'pr_created', ctx);
    } else {
      log('Skipping PR creation (already created)', 'info');
    }

    // Workflow completed
    postWorkflowComment(issueNumber, 'completed', ctx);

    // Final summary
    printWorkflowSummary(
      issueNumber,
      issue.title,
      branchName,
      logsDir,
      ctx.prUrl || '',
      planCostUsd,
      buildCostUsd
    );

  } catch (error) {
    ctx.errorMessage = String(error);
    postWorkflowComment(issueNumber, 'error', ctx);
    log(`Workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
