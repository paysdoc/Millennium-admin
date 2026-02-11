/**
 * Issue classifier helper for ADW triggers.
 *
 * Provides two-step classification: first tries /classify_adw to detect
 * explicit ADW workflow commands, then falls back to /classify_issue
 * for AI-based heuristic classification.
 */

import { fetchGitHubIssue } from '../github/githubApi';
import { runClaudeAgentWithCommand } from '../agents/claudeAgent';
import {
  IssueClassSlashCommand,
  AdwSlashCommand,
  AdwClassificationResult,
  adwCommandToIssueTypeMap,
  log,
  GitHubIssue,
} from '../core';

/**
 * Result of classifying an issue for trigger purposes.
 */
export interface IssueClassificationResult {
  issueType: IssueClassSlashCommand;
  success: boolean;
  adwCommand?: AdwSlashCommand;
  adwId?: string;
}

/**
 * Parses the raw string output from the /classify_adw agent into an AdwClassificationResult.
 * Extracts JSON from the output, handling potential surrounding text.
 *
 * @param output - Raw string output from the /classify_adw agent
 * @returns Parsed AdwClassificationResult or null if empty/unparseable
 */
export function parseAdwClassificationOutput(output: string): AdwClassificationResult | null {
  try {
    const trimmed = output.trim();
    if (!trimmed) return null;

    // Extract JSON from the output (may be surrounded by explanation text)
    const jsonMatch = trimmed.match(/\{[^{}]*\}/);
    if (!jsonMatch) return null;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;

    // Empty JSON means no ADW command found
    if (Object.keys(record).length === 0) return null;

    const result: AdwClassificationResult = {};

    // Validate adw_slash_command if present
    if (typeof record['adw_slash_command'] === 'string') {
      const command = record['adw_slash_command'] as string;
      if (command in adwCommandToIssueTypeMap) {
        result.adw_slash_command = command as AdwSlashCommand;
      } else {
        return null;
      }
    }

    // Extract adw_id if present
    if (typeof record['adw_id'] === 'string') {
      result.adw_id = record['adw_id'];
    }

    // Must have at least adw_slash_command to be useful
    if (!result.adw_slash_command) return null;

    return result;
  } catch {
    return null;
  }
}

/**
 * Attempts ADW-specific classification by calling /classify_adw.
 * Maps recognized ADW commands to IssueClassSlashCommand types.
 *
 * @param issueContext - The issue context string to classify
 * @param issueNumber - The GitHub issue number
 * @param outputFile - Path for agent output file
 * @returns IssueClassificationResult if ADW command found, null to fall back
 */
export async function classifyWithAdwCommand(
  issueContext: string,
  issueNumber: number,
  outputFile: string
): Promise<IssueClassificationResult | null> {
  try {
    const result = await runClaudeAgentWithCommand(
      '/classify_adw',
      issueContext,
      `adw-classifier-${issueNumber}`,
      outputFile,
      'haiku'
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
 * Classifies an issue using /classify_issue (AI heuristic fallback).
 *
 * @param issueContext - The issue context string to classify
 * @param issueNumber - The GitHub issue number
 * @param agentName - Name identifier for the agent
 * @param outputFile - Path for agent output file
 * @returns IssueClassificationResult
 */
async function classifyWithIssueCommand(
  issueContext: string,
  issueNumber: number,
  agentName: string,
  outputFile: string
): Promise<IssueClassificationResult> {
  const result = await runClaudeAgentWithCommand(
    '/classify_issue',
    issueContext,
    agentName,
    outputFile,
    'haiku'
  );

  if (!result.success) {
    log(`Classification failed for issue #${issueNumber}, defaulting to /feature`, 'error');
    return { issueType: '/feature', success: false };
  }

  const output = result.output.trim();
  const validCommands: IssueClassSlashCommand[] = ['/chore', '/bug', '/feature', '/pr_review'];
  const matchedCommand = validCommands.find((cmd) => output.includes(cmd));

  if (matchedCommand) {
    log(`Issue #${issueNumber} classified as ${matchedCommand}`, 'success');
    return { issueType: matchedCommand, success: true };
  }

  log(`Could not parse classification for issue #${issueNumber}, defaulting to /feature`, 'error');
  return { issueType: '/feature', success: false };
}

/**
 * Classifies an issue to determine the appropriate workflow.
 * Uses two-step classification: /classify_adw first, then /classify_issue fallback.
 *
 * @param issueNumber - The GitHub issue number to classify
 * @returns Classification result with issue type and success status
 */
export async function classifyIssueForTrigger(
  issueNumber: number
): Promise<IssueClassificationResult> {
  try {
    log(`Classifying issue #${issueNumber} for trigger...`);

    const issue = await fetchGitHubIssue(issueNumber);
    const issueContext = `**#${issue.number}: ${issue.title}**\n\n${issue.body}`;

    // Step 1: Try ADW-specific classification
    log(`Attempting ADW classification (/classify_adw) for issue #${issueNumber}...`);
    const adwResult = await classifyWithAdwCommand(
      issueContext,
      issueNumber,
      `/tmp/adw-trigger-adw-classifier-${issueNumber}.jsonl`
    );
    if (adwResult) return adwResult;

    // Step 2: Fall back to /classify_issue
    log(`No ADW command found for issue #${issueNumber}, falling back to /classify_issue`);
    log(`Attempting heuristic classification (/classify_issue) for issue #${issueNumber}...`);
    return await classifyWithIssueCommand(
      issueContext,
      issueNumber,
      `trigger-classifier-${issueNumber}`,
      `/tmp/adw-trigger-classifier-${issueNumber}.jsonl`
    );
  } catch (error) {
    log(`Error classifying issue #${issueNumber}: ${error}`, 'error');
    return { issueType: '/feature', success: false };
  }
}

/**
 * Classifies a pre-fetched GitHub issue to determine its type.
 * Uses two-step classification: /classify_adw first, then /classify_issue fallback.
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

    // Step 1: Try ADW-specific classification
    log(`Attempting ADW classification (/classify_adw) for issue #${issue.number}...`);
    const adwResult = await classifyWithAdwCommand(
      issueContext,
      issue.number,
      `/tmp/adw-adw-classifier-${issue.number}.jsonl`
    );
    if (adwResult) return adwResult;

    // Step 2: Fall back to /classify_issue
    log(`No ADW command found for issue #${issue.number}, falling back to /classify_issue`);
    log(`Attempting heuristic classification (/classify_issue) for issue #${issue.number}...`);
    return await classifyWithIssueCommand(
      issueContext,
      issue.number,
      `classifier-${issue.number}`,
      `/tmp/adw-classifier-${issue.number}.jsonl`
    );
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
