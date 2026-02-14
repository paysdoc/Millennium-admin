/**
 * Classification logic for ADW issue classification.
 *
 * Contains parsing of ADW classification output, workflow script routing,
 * and the heuristic classification fallback via /classify_issue.
 */

import { runClaudeAgentWithCommand } from '../agents/claudeAgent';
import {
  IssueClassSlashCommand,
  AdwSlashCommand,
  AdwClassificationResult,
  adwCommandToIssueTypeMap,
  adwCommandToOrchestratorMap,
  log,
} from '../core';

/** Result of classifying an issue for trigger purposes. */
export interface IssueClassificationResult {
  issueType: IssueClassSlashCommand;
  success: boolean;
  adwCommand?: AdwSlashCommand;
  adwId?: string;
}

/**
 * Parses the raw string output from the /classify_adw agent into an AdwClassificationResult.
 * Extracts JSON from the output, handling potential surrounding text.
 */
export function parseAdwClassificationOutput(output: string): AdwClassificationResult | null {
  try {
    const trimmed = output.trim();
    if (!trimmed) return null;

    const jsonMatch = trimmed.match(/\{[^{}]*\}/);
    if (!jsonMatch) return null;

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length === 0) return null;

    const result: AdwClassificationResult = {};

    if (typeof record['adw_slash_command'] === 'string') {
      const command = record['adw_slash_command'] as string;
      if (command in adwCommandToIssueTypeMap) {
        result.adw_slash_command = command as AdwSlashCommand;
      } else {
        return null;
      }
    }

    if (typeof record['adw_id'] === 'string') {
      result.adw_id = record['adw_id'];
    }

    if (!result.adw_slash_command) return null;

    return result;
  } catch {
    return null;
  }
}

/**
 * Determines which workflow script to use based on issue type and optional ADW command.
 *
 * Routing: ADW commands mapped in adwCommandToOrchestratorMap take priority,
 * otherwise falls back to issue-type routing (/feature,/chore -> PlanBuildTest,
 * /bug,/pr_review -> PlanBuild).
 */
export function getWorkflowScript(issueType: IssueClassSlashCommand, adwCommand?: AdwSlashCommand): string {
  if (adwCommand) {
    const orchestrator = adwCommandToOrchestratorMap[adwCommand];
    if (orchestrator) return orchestrator;
  }

  switch (issueType) {
    case '/feature':
    case '/chore':
      return 'adws/adwPlanBuildTest.tsx';
    case '/bug':
    case '/pr_review':
      return 'adws/adwPlanBuild.tsx';
    default:
      return 'adws/adwPlanBuildTest.tsx';
  }
}

/** Classifies an issue using /classify_issue (AI heuristic fallback). */
export async function classifyWithIssueCommand(
  issueContext: string,
  issueNumber: number,
  agentName: string,
  outputFile: string
): Promise<IssueClassificationResult> {
  const result = await runClaudeAgentWithCommand(
    '/classify_issue', issueContext, agentName, outputFile, 'haiku'
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
