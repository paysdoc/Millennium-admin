#!/usr/bin/env npx tsx
/**
 * ADW Plan - AI Developer Workflow Planning Phase
 *
 * Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Fetch GitHub issue details
 * 2. Setup worktree or checkout default branch
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

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  IssueClassSlashCommand,
  commitPrefixMap,
  AgentStateManager,
  AgentState,
  shouldExecuteStage,
  hasUncommittedChanges,
  getNextStage,
} from './core';
import {
  fetchGitHubIssue,
  createFeatureBranch,
  commitChanges,
  postWorkflowComment,
  WorkflowContext,
  detectRecoveryState,
  checkoutDefaultBranch,
  getDefaultBranch,
  generateBranchName,
  ensureWorktree,
} from './github';
import {
  runPlanAgent,
  getPlanFilePath,
  planFileExists,
} from './agents';
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
  let workingDir = cwd;
  if (!workingDir) {
    // Create a worktree for isolated execution
    const defaultBranch = getDefaultBranch();
    const tempBranchName = generateBranchName(issueNumber, issue.title, providedIssueType || '/feature');
    workingDir = ensureWorktree(tempBranchName, defaultBranch);
    log(`Worktree path: ${workingDir}`, 'info');
  } else {
    log('Skipping checkout (using provided worktree)', 'info');
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

    if (hasUncommittedChanges(workingDir || undefined)) {
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
    if (providedIssueType) {
      // Issue type was provided via CLI (from orchestrator), skip classification
      log(`Using pre-classified issue type: ${providedIssueType}`, 'info');
      issueType = providedIssueType;
      ctx.issueType = issueType;

      AgentStateManager.writeState(orchestratorStatePath, { issueClass: issueType });
      AgentStateManager.appendLog(orchestratorStatePath, `Using pre-classified issue type: ${issueType}`);

      postWorkflowComment(issueNumber, 'classified', ctx);
    } else if (shouldExecuteStage('classified', recoveryState)) {
      log('Classifying issue type...', 'info');

      const classificationResult = await classifyGitHubIssue(issue);
      issueType = classificationResult.issueType;
      log(`Issue classified as: ${issueType}`, classificationResult.success ? 'success' : 'info');
      ctx.issueType = issueType;

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
      branchName = createFeatureBranch(issueNumber, issue.title, issueType, workingDir || undefined);
      log(`On branch: ${branchName}`, 'success');
      ctx.branchName = branchName;

      AgentStateManager.writeState(orchestratorStatePath, { branchName });
      AgentStateManager.appendLog(orchestratorStatePath, `Branch created: ${branchName}`);

      postWorkflowComment(issueNumber, 'branch_created', ctx);
    } else {
      log('Skipping branch creation (already completed)', 'info');
      if (recoveryState.branchName) {
        branchName = createFeatureBranch(issueNumber, issue.title, issueType, workingDir || undefined);
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

      const planResult = await runPlanAgent(issue, logsDir, issueType, planAgentStatePath, workingDir || undefined);

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
      commitChanges(`${commitPrefixMap[issueType]} add implementation plan for #${issueNumber}`, workingDir || undefined);
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
