/**
 * Patch Agent - Resolves individual review blocker issues.
 * Uses the /patch slash command from .claude/commands/patch.md
 */

import * as path from 'path';
import { log } from '../core';
import { runClaudeAgentWithCommand, AgentResult, ProgressCallback } from './claudeAgent';
import { ReviewIssue } from './reviewAgent';

/**
 * Formats the patch arguments for the /patch command.
 * Combines issue description and resolution into a review change request.
 */
export function formatPatchArgs(
  adwId: string,
  reviewIssue: ReviewIssue,
  specPath?: string,
  screenshots?: string,
): string {
  const reviewChangeRequest = `Issue #${reviewIssue.review_issue_number}: ${reviewIssue.issue_description}\nResolution: ${reviewIssue.issue_resolution}`;
  return `${adwId}\n${reviewChangeRequest}\n${specPath ?? ''}\npatch_agent\n${screenshots ?? ''}`;
}

/**
 * Runs the /patch command to resolve a single review blocker issue.
 * Uses 'opus' model for complex code modifications.
 *
 * @param adwId - ADW session identifier
 * @param reviewIssue - The blocker issue to patch
 * @param logsDir - Directory to write agent logs
 * @param specPath - Optional path to the spec file for context
 * @param onProgress - Optional callback for progress updates
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
export async function runPatchAgent(
  adwId: string,
  reviewIssue: ReviewIssue,
  logsDir: string,
  specPath?: string,
  onProgress?: ProgressCallback,
  statePath?: string,
  cwd?: string
): Promise<AgentResult> {
  const args = formatPatchArgs(adwId, reviewIssue, specPath, reviewIssue.screenshot_path);
  const outputFile = path.join(logsDir, `patch-agent-issue-${reviewIssue.review_issue_number}.jsonl`);

  log(`Patch Agent starting for issue #${reviewIssue.review_issue_number}:`, 'info');
  log(`  Description: ${reviewIssue.issue_description}`, 'info');
  log(`  Resolution: ${reviewIssue.issue_resolution}`, 'info');
  log(`  Model: opus`, 'info');

  return runClaudeAgentWithCommand(
    '/patch',
    args,
    `Patch: ${reviewIssue.review_issue_number}`,
    outputFile,
    'opus',
    onProgress,
    statePath,
    cwd
  );
}
