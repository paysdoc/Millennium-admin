#!/usr/bin/env npx tsx
/**
 * ADW Plan & Build - Plan+Build+PR Orchestrator
 *
 * Usage: npx tsx adws/adwPlanBuild.tsx <github-issue-number> [adw-id]
 *
 * Workflow:
 * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
 * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
 * 3. Build Phase: run build agent, commit implementation
 * 4. PR Phase: create pull request
 * 5. Finalize: update state, post completion comment
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import { mergeModelUsageMaps } from './core';
import {
  initializeWorkflow,
  executePlanPhase,
  executeBuildPhase,
  executePRPhase,
  completeWorkflow,
  handleWorkflowError,
} from './workflowPhases';

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
function parseArguments(args: string[]): { issueNumber: number; adwId: string | null } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  const adwId = args[1] || null;

  return { issueNumber, adwId };
}

/**
 * Main orchestrator workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, adwId } = parseArguments(args);

  const config = await initializeWorkflow(issueNumber, adwId, 'plan-build-orchestrator');

  try {
    const planResult = await executePlanPhase(config);
    const buildResult = await executeBuildPhase(config);
    executePRPhase(config);
    const totalModelUsage = mergeModelUsageMaps(planResult.modelUsage, buildResult.modelUsage);
    await completeWorkflow(config, planResult.costUsd + buildResult.costUsd, undefined, totalModelUsage);
  } catch (error) {
    handleWorkflowError(config, error);
  }
}

main();
