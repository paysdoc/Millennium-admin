#!/usr/bin/env npx tsx
/**
 * ADW Plan, Build & Test - AI Developer Workflow Orchestrator
 *
 * This script orchestrates the complete ADW workflow by calling:
 * 1. adwPlan.tsx - Planning phase (classification, branch creation, plan generation)
 * 2. adwBuild.tsx - Build phase (implementation, commit, PR creation)
 * 3. adwTest.tsx - Test phase (validation tests with automatic failure resolution)
 *
 * Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 * - MAX_TEST_RETRY_ATTEMPTS: Maximum retry attempts for tests (default: 5)
 */

import { execSync, SpawnSyncReturns } from 'child_process';
import { log, generateAdwId } from './core';

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
  console.error('Usage: npx tsx adws/adwPlanBuildTest.tsx <github-issue-number> [adw-id]');
  console.error('');
  console.error('This orchestrator runs the complete ADW workflow:');
  console.error('  1. adwPlan.tsx  - Plan generation');
  console.error('  2. adwBuild.tsx - Implementation and PR creation');
  console.error('  3. adwTest.tsx  - Validation tests with failure resolution');
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
 * Executes a subprocess and returns success status.
 */
function runSubprocess(command: string, description: string): boolean {
  log(`Starting: ${description}`, 'info');

  try {
    execSync(command, { stdio: 'inherit' });
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
function main(): void {
  const args = process.argv.slice(2);
  const { issueNumber, adwId } = parseArguments(args);

  log('===================================', 'info');
  log('ADW Plan, Build & Test Orchestrator', 'info');
  log(`Issue: #${issueNumber}`, 'info');
  log(`ADW ID: ${adwId}`, 'info');
  log('===================================', 'info');

  // Phase 1: Run Plan
  const planCommand = `npx tsx adws/adwPlan.tsx ${issueNumber} ${adwId}`;
  if (!runSubprocess(planCommand, 'Plan Phase')) {
    log('Plan phase failed. Aborting workflow.', 'error');
    process.exit(1);
  }

  // Phase 2: Run Build
  const buildCommand = `npx tsx adws/adwBuild.tsx ${issueNumber} ${adwId}`;
  if (!runSubprocess(buildCommand, 'Build Phase')) {
    log('Build phase failed. Aborting workflow.', 'error');
    process.exit(1);
  }

  // Phase 3: Run Test
  const testCommand = `npx tsx adws/adwTest.tsx ${adwId}`;
  if (!runSubprocess(testCommand, 'Test Phase')) {
    log('Test phase failed.', 'error');
    process.exit(1);
  }

  log('===================================', 'info');
  log('ADW Plan, Build & Test workflow completed!', 'success');
  log('===================================', 'info');
}

main();
