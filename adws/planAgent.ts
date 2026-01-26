/**
 * Plan Agent - Generates implementation plans from GitHub issues.
 */

import * as path from 'path';
import { GitHubIssue } from './dataTypes';
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
export function buildPlanPrompt(issue: GitHubIssue): string {
  const issueContext = formatIssueContext(issue);

  return `You are a Plan Agent. Your job is to analyze the following GitHub issue and create a detailed implementation plan.

${issueContext}

## Instructions

1. Analyze the issue requirements carefully
2. Research the codebase to understand existing patterns and architecture
3. Create a comprehensive implementation plan in specs/issue-${issue.number}-plan.md

Use the /feature command format to create the plan. The plan should include:
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
 * Runs the Plan Agent to generate an implementation plan.
 */
export async function runPlanAgent(
  issue: GitHubIssue,
  logsDir: string
): Promise<AgentResult> {
  const prompt = buildPlanPrompt(issue);
  const outputFile = path.join(logsDir, 'plan-agent.jsonl');

  return runClaudeAgent(prompt, 'Plan', outputFile, 'opus');
}
