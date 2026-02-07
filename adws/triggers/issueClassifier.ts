/**
 * Issue classifier helper for ADW triggers.
 *
 * Provides classification functionality for determining which workflow
 * script to spawn based on issue type.
 */

import { fetchGitHubIssue } from '../github/githubApi';
import { runClaudeAgentWithCommand } from '../agents/claudeAgent';
import { IssueClassSlashCommand, log, GitHubIssue } from '../core';

/**
 * Result of classifying an issue for trigger purposes.
 */
export interface IssueClassificationResult {
  issueType: IssueClassSlashCommand;
  success: boolean;
}

/**
 * Classifies an issue to determine the appropriate workflow.
 *
 * @param issueNumber - The GitHub issue number to classify
 * @returns Classification result with issue type and success status
 */
export async function classifyIssueForTrigger(
  issueNumber: number
): Promise<IssueClassificationResult> {
  try {
    log(`Classifying issue #${issueNumber} for trigger...`);

    // Fetch issue details
    const issue = await fetchGitHubIssue(issueNumber);
    const issueContext = `**#${issue.number}: ${issue.title}**\n\n${issue.body}`;

    // Run the classifier agent with haiku for fast, cost-effective classification
    const result = await runClaudeAgentWithCommand(
      '/classify_issue',
      issueContext,
      `trigger-classifier-${issueNumber}`,
      `/tmp/adw-trigger-classifier-${issueNumber}.jsonl`,
      'haiku'
    );

    if (!result.success) {
      log(`Classification failed for issue #${issueNumber}, defaulting to /feature`, 'error');
      return { issueType: '/feature', success: false };
    }

    // Parse the classification result - expect a slash command response
    const output = result.output.trim();
    const validCommands: IssueClassSlashCommand[] = ['/chore', '/bug', '/feature', '/pr_review'];
    const matchedCommand = validCommands.find((cmd) => output.includes(cmd));

    if (matchedCommand) {
      log(`Issue #${issueNumber} classified as ${matchedCommand}`, 'success');
      return { issueType: matchedCommand, success: true };
    }

    log(`Could not parse classification for issue #${issueNumber}, defaulting to /feature`, 'error');
    return { issueType: '/feature', success: false };
  } catch (error) {
    log(`Error classifying issue #${issueNumber}: ${error}`, 'error');
    return { issueType: '/feature', success: false };
  }
}

/**
 * Classifies a pre-fetched GitHub issue to determine its type.
 *
 * This function is useful when the issue has already been fetched and
 * you want to avoid an additional API call. Used by orchestrator scripts.
 *
 * @param issue - The pre-fetched GitHub issue
 * @returns Classification result with issue type and success status
 */
export async function classifyGitHubIssue(
  issue: GitHubIssue
): Promise<IssueClassificationResult> {
  try {
    log(`Classifying issue #${issue.number} (${issue.title})...`);

    const labelsText = issue.labels.map((l) => l.name).join(', ') || 'none';
    const issueContext = `**Title:** ${issue.title}
**Labels:** ${labelsText}

${issue.body || 'No description provided.'}`;

    // Run the classifier agent with haiku for fast, cost-effective classification
    const result = await runClaudeAgentWithCommand(
      '/classify_issue',
      issueContext,
      `classifier-${issue.number}`,
      `/tmp/adw-classifier-${issue.number}.jsonl`,
      'haiku'
    );

    if (!result.success) {
      log(`Classification failed for issue #${issue.number}, defaulting to /feature`, 'error');
      return { issueType: '/feature', success: false };
    }

    // Parse the classification result - expect a slash command response
    const output = result.output.trim();
    const validCommands: IssueClassSlashCommand[] = ['/chore', '/bug', '/feature', '/pr_review'];
    const matchedCommand = validCommands.find((cmd) => output.includes(cmd));

    if (matchedCommand) {
      log(`Issue #${issue.number} classified as ${matchedCommand}`, 'success');
      return { issueType: matchedCommand, success: true };
    }

    log(`Could not parse classification for issue #${issue.number}, defaulting to /feature`, 'error');
    return { issueType: '/feature', success: false };
  } catch (error) {
    log(`Error classifying issue #${issue.number}: ${error}`, 'error');
    return { issueType: '/feature', success: false };
  }
}

/**
 * Determines which workflow script to use based on issue type.
 *
 * - /feature and /chore use adwPlanBuildTest.tsx (includes Test phase)
 * - /bug and /pr_review use adwPlanBuild.tsx (no Test phase)
 *
 * @param issueType - The classified issue type
 * @returns The workflow script path to spawn
 */
export function getWorkflowScript(issueType: IssueClassSlashCommand): string {
  switch (issueType) {
    case '/feature':
    case '/chore':
      return 'adws/adwPlanBuildTest.tsx';
    case '/bug':
    case '/pr_review':
      return 'adws/adwPlanBuild.tsx';
    default:
      // Default to test workflow for safety
      return 'adws/adwPlanBuildTest.tsx';
  }
}
