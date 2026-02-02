/**
 * Build Agent - Implements solutions based on implementation plans.
 */

import * as path from 'path';
import { GitHubIssue, PRDetails, PRReviewComment, log } from '../core';
import { runClaudeAgent, AgentResult, ProgressCallback } from './claudeAgent';

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
 * Formats PR review comments for inclusion in a build prompt.
 */
function formatPrReviewComments(comments: PRReviewComment[]): string {
  return comments
    .map(c => {
      const location = c.path
        ? `**File:** \`${c.path}\`${c.line ? ` (line ${c.line})` : ''}`
        : '**General comment**';
      return `${location}\n**Author:** ${c.author.login}\n**Comment:** ${c.body}`;
    })
    .join('\n\n---\n\n');
}

/**
 * Builds the prompt for the Build Agent to address PR review comments.
 */
export function buildPrReviewImplementPrompt(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  revisionPlan: string
): string {
  const commentsSection = formatPrReviewComments(comments);

  return `You are a Build Agent. Your job is to implement changes to address PR review comments.

## PR #${prDetails.number}: ${prDetails.title}
**URL:** ${prDetails.url}
**Branch:** ${prDetails.headBranch}

## PR Review Comments to Address
${commentsSection}

## Revision Plan
${revisionPlan}

## Instructions

1. Follow the revision plan to address each review comment
2. Make all necessary code changes
3. Run validation commands to verify correctness
4. Ensure no regressions are introduced

## After Implementation
Provide a summary of what was changed to address each review comment.

IMPORTANT: Follow the revision plan exactly. Only make changes that address the review comments.`;
}

/**
 * Runs the Build Agent to implement PR review changes.
 */
export async function runPrReviewBuildAgent(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  revisionPlan: string,
  logsDir: string,
  onProgress?: ProgressCallback,
  statePath?: string
): Promise<AgentResult> {
  const prompt = buildPrReviewImplementPrompt(prDetails, comments, revisionPlan);
  const outputFile = path.join(logsDir, 'pr-review-build-agent.jsonl');

  log('PR Review Build Agent starting with arguments:', 'info');
  log(`  PR: #${prDetails.number} - ${prDetails.title}`, 'info');
  log(`  Review comments: ${comments.length}`, 'info');
  log(`  Output file: ${outputFile}`, 'info');
  log(`  Revision plan length: ${revisionPlan.length} characters`, 'info');
  log(`  Model: opus`, 'info');

  return runClaudeAgent(prompt, 'PR Review Build', outputFile, 'opus', onProgress, statePath);
}

/**
 * Runs the Build Agent to implement the solution.
 */
export async function runBuildAgent(
  issue: GitHubIssue,
  logsDir: string,
  planContent: string,
  onProgress?: ProgressCallback,
  statePath?: string
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

  return runClaudeAgent(prompt, 'Build', outputFile, 'opus', onProgress, statePath);
}
