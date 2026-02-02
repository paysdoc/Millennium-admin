/**
 * Plan Agent - Generates implementation plans from GitHub issues.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitHubIssue, IssueClassSlashCommand, PRDetails, PRReviewComment } from '../core';
import { runClaudeAgent, AgentResult } from './claudeAgent';

/**
 * Formats issue context for the plan prompt.
 */
function formatIssueContext(issue: GitHubIssue): string {
  const commentsSection = issue.comments.length > 0
    ? issue.comments
        .map(c => `**${c.author.login}** (${c.createdAt}):\n${c.body}`)
        .join('\n\n---\n\n')
    : 'No comments.';

  return `
## GitHub Issue #${issue.number}
**Title:** ${issue.title}
**State:** ${issue.state}
**Author:** ${issue.author.login}
**Labels:** ${issue.labels.map(l => l.name).join(', ') || 'none'}
**Created:** ${issue.createdAt}

### Description
${issue.body || 'No description provided.'}

### Comments
${commentsSection}
`.trim();
}

/**
 * Builds the prompt for the Plan Agent.
 */
export function buildPlanPrompt(issue: GitHubIssue, issueType: IssueClassSlashCommand = '/feature'): string {
  const issueContext = formatIssueContext(issue);

  return `You are a Plan Agent. Your job is to analyze the following GitHub issue and create a detailed implementation plan.

${issueContext}

## Instructions

1. Analyze the issue requirements carefully
2. Research the codebase to understand existing patterns and architecture
3. Create a comprehensive implementation plan in specs/issue-${issue.number}-plan.md

Use the ${issueType} command format to create the plan. The plan should include:
- Feature description
- User story
- Problem and solution statements
- Relevant files (existing and new)
- Implementation phases
- Step-by-step tasks
- Testing strategy
- Acceptance criteria
- Validation commands

After creating the plan, provide a brief summary of what the plan covers.

IMPORTANT: Focus only on planning. Do not implement any code changes. Create the plan file and summarize it.`;
}

/**
 * Gets the path to the plan file for an issue.
 */
export function getPlanFilePath(issueNumber: number): string {
  return `specs/issue-${issueNumber}-plan.md`;
}

/**
 * Checks if the plan file exists for an issue.
 * Returns true if the file exists and has content.
 */
export function planFileExists(issueNumber: number): boolean {
  const planPath = getPlanFilePath(issueNumber);
  try {
    const stats = fs.statSync(planPath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}

/**
 * Formats PR review comments for inclusion in a prompt.
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
 * Builds the prompt for the Plan Agent to address PR review comments.
 */
export function buildPrReviewPlanPrompt(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  existingPlanContent: string
): string {
  const commentsSection = formatPrReviewComments(comments);

  return `You are a Plan Agent. Your job is to create a revision plan to address PR review comments.

## PR #${prDetails.number}: ${prDetails.title}
**URL:** ${prDetails.url}
**Branch:** ${prDetails.headBranch}

## Original Implementation Plan
${existingPlanContent}

## PR Review Comments to Address
${commentsSection}

## Instructions

1. Analyze each review comment carefully
2. Research the codebase to understand the context of each comment
3. Create a revision plan that addresses ALL review comments
4. The revision plan should be specific about what files to change and how
5. Include validation commands to verify the changes

Output the revision plan as markdown. Focus only on the changes needed to address the review comments — do not re-implement the entire feature.

IMPORTANT: Focus only on planning. Do not implement any code changes.`;
}

/**
 * Runs the Plan Agent to create a revision plan for PR review comments.
 */
export async function runPrReviewPlanAgent(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  existingPlanContent: string,
  logsDir: string,
  statePath?: string
): Promise<AgentResult> {
  const prompt = buildPrReviewPlanPrompt(prDetails, comments, existingPlanContent);
  const outputFile = path.join(logsDir, 'pr-review-plan-agent.jsonl');

  return runClaudeAgent(prompt, 'PR Review Plan', outputFile, 'opus', undefined, statePath);
}

/**
 * Runs the Plan Agent to generate an implementation plan.
 */
export async function runPlanAgent(
  issue: GitHubIssue,
  logsDir: string,
  issueType: IssueClassSlashCommand = '/feature',
  statePath?: string
): Promise<AgentResult> {
  const prompt = buildPlanPrompt(issue, issueType);
  const outputFile = path.join(logsDir, 'plan-agent.jsonl');

  return runClaudeAgent(prompt, 'Plan', outputFile, 'opus', undefined, statePath);
}
