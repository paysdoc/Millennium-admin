/**
 * Issue classifier helper for ADW triggers.
 *
 * Provides two-step classification: first tries /classify_adw to detect
 * explicit ADW workflow commands, then falls back to /classify_issue
 * for AI-based heuristic classification.
 */

import { fetchGitHubIssue } from '../github/githubApi';
import { runClaudeAgentWithCommand } from '../agents/claudeAgent';
import { AdwSlashCommand, adwCommandToIssueTypeMap, log, GitHubIssue } from '../core';
import {
  parseAdwClassificationOutput,
  classifyWithIssueCommand,
  type IssueClassificationResult,
} from './classificationLogic';

// Re-export from classificationLogic so existing imports continue to work
export { parseAdwClassificationOutput, getWorkflowScript } from './classificationLogic';
export type { IssueClassificationResult } from './classificationLogic';

/**
 * Attempts ADW-specific classification by calling /classify_adw.
 * Maps recognized ADW commands to IssueClassSlashCommand types.
 */
export async function classifyWithAdwCommand(
  issueContext: string,
  issueNumber: number,
  outputFile: string
): Promise<IssueClassificationResult | null> {
  try {
    const result = await runClaudeAgentWithCommand(
      '/classify_adw', issueContext, `adw-classifier-${issueNumber}`, outputFile, 'haiku'
    );

    if (!result.success) {
      log(`ADW classifier agent failed for issue #${issueNumber}`, 'error');
      return null;
    }

    const parsed = parseAdwClassificationOutput(result.output);
    if (!parsed?.adw_slash_command) {
      log(`ADW classifier returned no valid command for issue #${issueNumber}`);
      return null;
    }

    const issueType = adwCommandToIssueTypeMap[parsed.adw_slash_command];
    log(`Issue #${issueNumber} matched ADW command ${parsed.adw_slash_command} → ${issueType}`, 'success');

    return {
      issueType,
      success: true,
      adwCommand: parsed.adw_slash_command,
      adwId: parsed.adw_id,
    };
  } catch (error) {
    log(`ADW classification error for issue #${issueNumber}: ${error}`, 'error');
    return null;
  }
}

/**
 * Runs two-step classification: /classify_adw first, then /classify_issue fallback.
 * Shared orchestration logic for both classifyIssueForTrigger and classifyGitHubIssue.
 */
async function runTwoStepClassification(
  issueContext: string,
  issueNumber: number,
  adwOutputFile: string,
  issueAgentName: string,
  issueOutputFile: string,
): Promise<IssueClassificationResult> {
  log(`Attempting ADW classification (/classify_adw) for issue #${issueNumber}...`);
  const adwResult = await classifyWithAdwCommand(issueContext, issueNumber, adwOutputFile);
  if (adwResult) return adwResult;

  log(`No ADW command found for issue #${issueNumber}, falling back to /classify_issue`);
  log(`Attempting heuristic classification (/classify_issue) for issue #${issueNumber}...`);
  return classifyWithIssueCommand(issueContext, issueNumber, issueAgentName, issueOutputFile);
}

/**
 * Classifies an issue to determine the appropriate workflow.
 * Uses two-step classification: /classify_adw first, then /classify_issue fallback.
 */
export async function classifyIssueForTrigger(
  issueNumber: number
): Promise<IssueClassificationResult> {
  try {
    log(`Classifying issue #${issueNumber} for trigger...`);
    const issue = await fetchGitHubIssue(issueNumber);
    const issueContext = `**#${issue.number}: ${issue.title}**\n\n${issue.body}`;

    return await runTwoStepClassification(
      issueContext, issueNumber,
      `/tmp/adw-trigger-adw-classifier-${issueNumber}.jsonl`,
      `trigger-classifier-${issueNumber}`,
      `/tmp/adw-trigger-classifier-${issueNumber}.jsonl`,
    );
  } catch (error) {
    log(`Error classifying issue #${issueNumber}: ${error}`, 'error');
    return { issueType: '/feature', success: false };
  }
}

/**
 * Classifies a pre-fetched GitHub issue to determine its type.
 * Uses two-step classification: /classify_adw first, then /classify_issue fallback.
 */
export async function classifyGitHubIssue(
  issue: GitHubIssue
): Promise<IssueClassificationResult> {
  try {
    log(`Classifying issue #${issue.number} (${issue.title})...`);
    const labelsText = issue.labels.map((l) => l.name).join(', ') || 'none';
    const issueContext = `**Title:** ${issue.title}\n**Labels:** ${labelsText}\n\n${issue.body || 'No description provided.'}`;

    return await runTwoStepClassification(
      issueContext, issue.number,
      `/tmp/adw-adw-classifier-${issue.number}.jsonl`,
      `classifier-${issue.number}`,
      `/tmp/adw-classifier-${issue.number}.jsonl`,
    );
  } catch (error) {
    log(`Error classifying issue #${issue.number}: ${error}`, 'error');
    return { issueType: '/feature', success: false };
  }
}
