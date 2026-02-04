#!/usr/bin/env npx tsx
/**
 * ADW Plan - AI Developer Workflow Planning Phase
 *
 * Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue details
 * 2. Checkout default branch and pull latest changes
 * 3. Detect recovery state from existing comments
 * 4. Classify issue type (feature, bug, chore, pr_review)
 * 5. Create feature branch: {type}/issue-{number}-{slug}
 * 6. Run Plan Agent: Generate implementation plan
 * 7. Commit the plan
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import * as path from 'path';
import { execSync } from 'child_process';
import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  GitHubIssue,
  IssueClassSlashCommand,
  WorkflowStage,
  RecoveryState,
  commitPrefixMap,
  AgentStateManager,
  AgentState,
} from './core';
import {
  fetchGitHubIssue,
  createFeatureBranch,
  commitChanges,
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
  runClaudeAgentWithCommand,
} from './agents';

/**
 * Classifies a GitHub issue as feature, bug, or chore using the haiku model.
 * Uses the /classify_issue slash command from .claude/commands/classify_issue.md
 *
 * @param issue - GitHub issue to classify
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
async function classifyIssue(
  issue: GitHubIssue,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<IssueClassSlashCommand> {
  const labelsText = issue.labels.map(l => l.name).join(', ') || 'none';

  const args = `**Title:** ${issue.title}
**Labels:** ${labelsText}

${issue.body || 'No description provided.'}`;

  const outputFile = path.join(logsDir, 'classifier-agent.jsonl');
  const result = await runClaudeAgentWithCommand(
    '/classify_issue',
    args,
    'Classifier',
    outputFile,
    'haiku',
    undefined,
    statePath,
    cwd
  );

  if (!result.success) {
    log('Classification failed, defaulting to /feature', 'info');
    return '/feature';
  }

  const output = result.output.trim();
  const validCommands: IssueClassSlashCommand[] = ['/feature', '/bug', '/chore', '/pr_review'];

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

/**
 * Determines if a stage should be executed based on recovery state.
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
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id] [--cwd <path>]');
  console.error('');
  console.error('Options:');
  console.error('  --cwd <path>       Working directory for git operations (worktree path)');
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
function parseArguments(args: string[]): { issueNumber: number; providedAdwId: string | null; cwd: string | null } {
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

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const providedAdwId = args[1] || null;

  return { issueNumber, providedAdwId, cwd };
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
  const { issueNumber, providedAdwId, cwd } = parseArguments(args);

  log(`Starting ADW Plan workflow`, 'info');
  log(`Issue: #${issueNumber}`, 'info');
  if (cwd) {
    log(`Working directory: ${cwd}`, 'info');
  }

  // Step 1: Fetch GitHub issue
  log('Fetching GitHub issue...', 'info');
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Step 2: Checkout default branch and pull latest changes
  // Skip if cwd is provided (worktree already has the correct starting point)
  if (!cwd) {
    checkoutDefaultBranch();
  } else {
    log('Skipping checkout (using worktree)', 'info');
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

  // Handle recovery mode
  if (recoveryState.canResume && recoveryState.lastCompletedStage) {
    log(`Recovery mode active: last completed stage was '${recoveryState.lastCompletedStage}'`, 'info');

    if (hasUncommittedChanges()) {
      log('Warning: There are uncommitted changes in the working directory', 'info');
    }

    if (recoveryState.branchName) ctx.branchName = recoveryState.branchName;
    if (recoveryState.planPath) ctx.planPath = recoveryState.planPath;

    const nextStage = getNextStage(recoveryState.lastCompletedStage);
    ctx.resumeFrom = nextStage;
    postWorkflowComment(issueNumber, 'resuming', ctx);
  } else {
    postWorkflowComment(issueNumber, 'starting', ctx);
  }

  try {
    let planCostUsd = 0;
    let branchName = ctx.branchName || '';

    // Step 5: Classify issue type
    let issueType: IssueClassSlashCommand;
    if (shouldExecuteStage('classified', recoveryState)) {
      log('Classifying issue type...', 'info');
      const classifierStatePath = AgentStateManager.initializeState(adwId, 'classifier', orchestratorStatePath);
      AgentStateManager.writeState(classifierStatePath, {
        adwId,
        issueNumber,
        agentName: 'classifier',
        parentAgent: 'plan-orchestrator',
        execution: AgentStateManager.createExecutionState('running'),
      });

      issueType = await classifyIssue(issue, logsDir, classifierStatePath, cwd || undefined);
      log(`Issue classified as: ${issueType}`, 'success');
      ctx.issueType = issueType;

      AgentStateManager.writeState(classifierStatePath, {
        issueClass: issueType,
        output: issueType,
        execution: AgentStateManager.completeExecution(
          AgentStateManager.createExecutionState('running'),
          true
        ),
      });

      AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
      AgentStateManager.appendLog(orchestratorStatePath, `Issue classified as: ${issueType}`);

      postWorkflowComment(issueNumber, 'classified', ctx);
    } else {
      log('Skipping classification (already completed)', 'info');
      issueType = '/feature';
      ctx.issueType = issueType;
    }

    // Step 6: Create branch
    if (shouldExecuteStage('branch_created', recoveryState)) {
      log('Creating branch...', 'info');
      branchName = createFeatureBranch(issueNumber, issue.title, issueType, cwd || undefined);
      log(`On branch: ${branchName}`, 'success');
      ctx.branchName = branchName;

      AgentStateManager.writeState(orchestratorStatePath, { branchName });
      AgentStateManager.appendLog(orchestratorStatePath, `Branch created: ${branchName}`);

      postWorkflowComment(issueNumber, 'branch_created', ctx);
    } else {
      log('Skipping branch creation (already completed)', 'info');
      if (recoveryState.branchName) {
        branchName = createFeatureBranch(issueNumber, issue.title, issueType, cwd || undefined);
        ctx.branchName = branchName;
      }
    }

    // Step 7: Run Plan Agent
    const planPath = getPlanFilePath(issueNumber);
    ctx.planPath = planPath;

    if (shouldExecuteStage('plan_created', recoveryState) && !planFileExists(issueNumber)) {
      postWorkflowComment(issueNumber, 'plan_building', ctx);
      log('Running Plan Agent...', 'info');

      const planAgentStatePath = AgentStateManager.initializeState(adwId, 'plan-agent', orchestratorStatePath);
      AgentStateManager.writeState(planAgentStatePath, {
        adwId,
        issueNumber,
        branchName,
        issueClass: issueType,
        agentName: 'plan-agent',
        parentAgent: 'plan-orchestrator',
        execution: AgentStateManager.createExecutionState('running'),
      });

      const planResult = await runPlanAgent(issue, logsDir, issueType, planAgentStatePath, cwd || undefined);

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
      planCostUsd = planResult.totalCostUsd || 0;
      postWorkflowComment(issueNumber, 'plan_created', ctx);
    } else {
      log('Skipping Plan Agent (plan already exists or completed)', 'info');
    }

    // Step 8: Commit plan
    if (shouldExecuteStage('plan_committing', recoveryState)) {
      postWorkflowComment(issueNumber, 'plan_committing', ctx);
      commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`, cwd || undefined);
    } else {
      log('Skipping plan commit (already completed)', 'info');
    }

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
    ctx.errorMessage = String(error);
    postWorkflowComment(issueNumber, 'error', ctx);

    AgentStateManager.writeState(orchestratorStatePath, {
      execution: AgentStateManager.completeExecution(
        AgentStateManager.createExecutionState('running'),
        false,
        String(error)
      ),
    });
    AgentStateManager.appendLog(orchestratorStatePath, `Plan workflow failed: ${error}`);

    log(`Plan workflow failed: ${error}`, 'error');
    process.exit(1);
  }
}

main();
