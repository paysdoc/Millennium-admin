/**
 * Build Agent - Implements solutions based on implementation plans.
 */

import * as path from 'path';
import { GitHubIssue } from './dataTypes';
import { runClaudeAgent, AgentResult, ProgressCallback } from './claudeAgent';
import { log } from './utils';

/**
 * Builds the prompt for the Build Agent.
 */
export function buildImplementPrompt(issue: GitHubIssue, planContent: string): string {
  return `You are a Build Agent. Your job is to implement the solution based on the implementation plan below.

## GitHub Issue #${issue.number}
**Title:** ${issue.title}
**URL:** ${issue.url}

## Implementation Plan
${planContent}

## Instructions

1. Follow the implementation plan step-by-step
2. Make all necessary code changes as specified in the plan
3. Run the validation commands from the plan to verify correctness
4. Ensure all tests pass and there are no regressions

## After Implementation
Provide a summary of:
- What was implemented
- Files changed/created
- Validation results
- Any issues encountered and how they were resolved

IMPORTANT: Follow the plan exactly. Run validation commands to verify the implementation.`;
}

/**
 * Runs the Build Agent to implement the solution.
 */
export async function runBuildAgent(
  issue: GitHubIssue,
  logsDir: string,
  planContent: string,
  onProgress?: ProgressCallback
): Promise<AgentResult> {
  const prompt = buildImplementPrompt(issue, planContent);
  const outputFile = path.join(logsDir, 'build-agent.jsonl');

  // Log the arguments with which the agent is started
  log('Build Agent starting with arguments:', 'info');
  log(`  Issue: #${issue.number} - ${issue.title}`, 'info');
  log(`  Issue URL: ${issue.url}`, 'info');
  log(`  Output file: ${outputFile}`, 'info');
  log(`  Plan content length: ${planContent.length} characters`, 'info');
  log(`  Model: opus`, 'info');

  return runClaudeAgent(prompt, 'Build', outputFile, 'opus', onProgress);
}
