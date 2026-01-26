/**
 * Build Agent - Implements solutions based on implementation plans.
 */

import * as path from 'path';
import { GitHubIssue } from './dataTypes';
import { runClaudeAgent, AgentResult } from './claudeAgent';
import { getPlanFilePath } from './planAgent';

/**
 * Builds the prompt for the Build Agent.
 */
export function buildImplementPrompt(issue: GitHubIssue, planPath: string): string {
  return `You are a Build Agent. Your job is to implement the solution based on the implementation plan.

## GitHub Issue #${issue.number}
**Title:** ${issue.title}
**URL:** ${issue.url}

## Instructions

1. Read the implementation plan at: ${planPath}
2. Follow the plan step-by-step to implement the solution
3. Run all validation commands from the plan to ensure the implementation is correct
4. Ensure all tests pass and there are no regressions

Use the /implement command with the plan path to execute the implementation.

After implementation is complete, provide a summary of:
- What was implemented
- Files changed/created
- Tests run and their results
- Any issues encountered and how they were resolved

IMPORTANT: Follow the plan exactly. Run validation commands to verify the implementation.`;
}

/**
 * Runs the Build Agent to implement the solution.
 */
export async function runBuildAgent(
  issue: GitHubIssue,
  logsDir: string
): Promise<AgentResult> {
  const planPath = getPlanFilePath(issue.number);
  const prompt = buildImplementPrompt(issue, planPath);
  const outputFile = path.join(logsDir, 'build-agent.jsonl');

  return runClaudeAgent(prompt, 'Build', outputFile, 'opus');
}
