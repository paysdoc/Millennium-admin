#!/usr/bin/env npx tsx
/**
 * ADW Plan & Build - AI Developer Workflow Orchestrator
 *
 * This script orchestrates the complete ADW workflow by calling:
 * 1. adwPlan.tsx - Planning phase (classification, branch creation, plan generation)
 * 2. adwBuild.tsx - Build phase (implementation, commit)
 * 3. Create PR after build completes
 *
 * Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import { execSync, SpawnSyncReturns } from 'child_process';
import { log, generateAdwId } from './core';
import {
  createPullRequest,
  fetchGitHubIssue,
  postWorkflowComment,
  WorkflowContext,
  getCurrentBranch,
  getDefaultBranch,
  generateBranchName,
  ensureWorktree,
} from './github';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete ADW workflow:');
  console.error('  1. adwPlan.tsx  - Plan generation');
  console.error('  2. adwBuild.tsx - Implementation and commit');
  console.error('  3. Create Pull Request');
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
 * Executes a subprocess and returns success status.
 * @param command - The command to execute
 * @param description - Description for logging
 * @param cwd - Optional working directory for the subprocess
 */
function runSubprocess(command: string, description: string, cwd?: string): boolean {
  log(`Starting: ${description}`, 'info');

  try {
    execSync(command, { stdio: 'inherit', cwd });
    log(`Completed: ${description}`, 'success');
    return true;
  } catch (error) {
    const execError = error as SpawnSyncReturns<Buffer>;
    log(`Failed: ${description} (exit code: ${execError.status})`, 'error');
    return false;
  }
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

  // Fetch issue details first to generate branch name
  const issue = await fetchGitHubIssue(issueNumber);
  log(`Fetched issue: ${issue.title}`, 'success');

  // Get default branch and create worktree
  const defaultBranch = getDefaultBranch();
  log(`Default branch: ${defaultBranch}`, 'info');

  // Generate branch name (will be created by adwPlan in the worktree)
  const branchName = generateBranchName(issueNumber, issue.title);
  log(`Target branch: ${branchName}`, 'info');

  // Create or get worktree for this branch
  const worktreePath = ensureWorktree(branchName, defaultBranch);
  log(`Worktree path: ${worktreePath}`, 'info');

  // Phase 1: Run Plan (in worktree)
  const planCommand = `npx tsx adws/adwPlan.tsx ${issueNumber} ${adwId} --cwd "${worktreePath}"`;
  if (!runSubprocess(planCommand, 'Plan Phase', worktreePath)) {
    log('Plan phase failed. Aborting workflow.', 'error');
    process.exit(1);
  }

  // Phase 2: Run Build (in worktree)
  const buildCommand = `npx tsx adws/adwBuild.tsx ${issueNumber} ${adwId} --cwd "${worktreePath}"`;
  if (!runSubprocess(buildCommand, 'Build Phase', worktreePath)) {
    log('Build phase failed. Aborting workflow.', 'error');
    process.exit(1);
  }

  // Phase 3: Create PR (after build completes)
  log('Build completed! Creating Pull Request...', 'info');

  // Get current branch from worktree
  const currentBranch = getCurrentBranch(worktreePath);
  const ctx: WorkflowContext = {
    issueNumber,
    adwId,
    branchName: currentBranch,
  };

  try {
    // Issue already fetched above

    // Post workflow comment indicating PR creation is starting
    postWorkflowComment(issueNumber, 'pr_creating', ctx);

    // Create the PR
    const prUrl = createPullRequest(issue, '', '');
    ctx.prUrl = prUrl;

    // Post workflow comment indicating PR was created
    postWorkflowComment(issueNumber, 'pr_created', ctx);

    log(`Pull Request created: ${prUrl}`, 'success');

    // Post workflow completed comment
    postWorkflowComment(issueNumber, 'completed', ctx);

    log('===================================', 'info');
    log('ADW Plan & Build workflow completed!', 'success');
    log(`PR: ${prUrl}`, 'info');
    log('===================================', 'info');
  } catch (error) {
    ctx.errorMessage = `Failed to create PR: ${error}`;
    postWorkflowComment(issueNumber, 'error', ctx);
    log(`Failed to create PR: ${error}`, 'error');
    process.exit(1);
  }
}

main();
