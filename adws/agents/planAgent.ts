/**
 * Plan Agent - Generates implementation plans from GitHub issues.
 * Uses slash commands from .claude/commands/ for consistent prompt templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitHubIssue, IssueClassSlashCommand, PRDetails, PRReviewComment } from '../core';
import { runClaudeAgentWithCommand, AgentResult } from './claudeAgent';

/**
 * Formats issue context as arguments for plan commands.
 * This creates the full context that replaces $ARGUMENTS in the command templates.
 */
function formatIssueContextAsArgs(issue: GitHubIssue): string {
  const commentsSection = issue.comments.length > 0
    ? issue.comments
        .map(c => `**${c.author.login}** (${c.createdAt}):\n${c.body}`)
        .join('\n\n---\n\n')
    : 'No comments.';

  return `## GitHub Issue #${issue.number}
**Title:** ${issue.title}
**State:** ${issue.state}
**Author:** ${issue.author.login}
**Labels:** ${issue.labels.map(l => l.name).join(', ') || 'none'}
**Created:** ${issue.createdAt}

### Description
${issue.body || 'No description provided.'}

### Comments
${commentsSection}`;
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
 * Formats PR review context as arguments for the /pr_review command.
 */
function formatPrReviewContextAsArgs(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  existingPlanContent: string
): string {
  const commentsSection = formatPrReviewComments(comments);

  return `## PR #${prDetails.number}: ${prDetails.title}
**URL:** ${prDetails.url}
**Branch:** ${prDetails.headBranch}

## Original Implementation Plan
${existingPlanContent}

## PR Review Comments to Address
${commentsSection}`;
}

/**
 * Runs the Plan Agent to create a revision plan for PR review comments.
 * Uses the /pr_review slash command from .claude/commands/pr_review.md
 */
export async function runPrReviewPlanAgent(
  prDetails: PRDetails,
  comments: PRReviewComment[],
  existingPlanContent: string,
  logsDir: string,
  statePath?: string
): Promise<AgentResult> {
  const args = formatPrReviewContextAsArgs(prDetails, comments, existingPlanContent);
  const outputFile = path.join(logsDir, 'pr-review-plan-agent.jsonl');

  return runClaudeAgentWithCommand('/pr_review', args, 'PR Review Plan', outputFile, 'opus', undefined, statePath);
}

/**
 * Runs the Plan Agent to generate an implementation plan.
 * Uses the appropriate slash command (/feature, /bug, /chore, /pr_review) based on issue type.
 */
export async function runPlanAgent(
  issue: GitHubIssue,
  logsDir: string,
  issueType: IssueClassSlashCommand = '/feature',
  statePath?: string
): Promise<AgentResult> {
  const args = formatIssueContextAsArgs(issue);
  const outputFile = path.join(logsDir, 'plan-agent.jsonl');

  // Use the issueType directly as the command (e.g., '/feature', '/bug', '/chore', '/pr_review')
  return runClaudeAgentWithCommand(issueType, args, 'Plan', outputFile, 'opus', undefined, statePath);
}
