#!/usr/bin/env npx tsx
/**
 * ADW Plan - AI Developer Workflow Planning Phase
 *
 * Usage: npx tsx adws/adwPlan.tsx <github-issue-number> [adw-id] [--cwd <path>] [--issue-type <type>]
 *
 * Workflow:
 * 1. Initialize: fetch issue, classify type, setup worktree, initialize state, detect recovery
 * 2. Plan Phase: classify issue, create branch, run plan agent, commit plan
 * 3. Finalize: update state, post completion comment
 *
 * Environment Requirements:
 * - ANTHROPIC_API_KEY: Anthropic API key
 * - CLAUDE_CODE_PATH: Path to Claude CLI (default: /usr/local/bin/claude)
 * - GITHUB_PAT: (Optional) GitHub Personal Access Token
 */

import { type IssueClassSlashCommand, parseCliArgumentsWithIssueType } from './core';
import {
  initializeWorkflow,
  executePlanPhase,
  completeWorkflow,
  handleWorkflowError,
} from './workflowPhases';

/**
 * Main planning workflow.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber, providedAdwId, cwd, providedIssueType } = parseCliArgumentsWithIssueType(args, 'adwPlan.tsx');
  const adwId = providedAdwId || null;

  const config = await initializeWorkflow(issueNumber, adwId, 'plan-orchestrator', {
    cwd: cwd || undefined,
    issueType: (providedIssueType as IssueClassSlashCommand) || undefined,
  });

  try {
    const planResult = await executePlanPhase(config);
    await completeWorkflow(config, planResult.costUsd, undefined, planResult.modelUsage);
  } catch (error) {
    handleWorkflowError(config, error);
  }
}

main();
