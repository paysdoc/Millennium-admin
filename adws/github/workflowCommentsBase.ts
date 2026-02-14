/** Base utilities and parsing functions for workflow comments. */

import { WorkflowStage, RecoveryState, GitHubComment } from '../core';
import { fetchGitHubIssue } from './githubApi';

/** Stage order for determining recovery resume point. */
export const STAGE_ORDER: WorkflowStage[] = [
  'starting', 'resuming', 'classified', 'branch_created',
  'plan_building', 'plan_created', 'plan_file_created', 'plan_committing',
  'implementing', 'build_progress', 'implemented', 'implementation_committing',
  'pr_creating', 'pr_created', 'completed',
];

/** Maps comment header patterns to workflow stages. */
const STAGE_HEADER_MAP: Record<string, WorkflowStage> = {
  ':rocket: ADW Workflow Started': 'starting', ':arrows_counterclockwise: ADW Workflow Resuming': 'resuming',
  ':mag: Issue Classified': 'classified', ':seedling: Branch Created': 'branch_created',
  ':pencil: Building Implementation Plan': 'plan_building', ':white_check_mark: Implementation Plan Created': 'plan_created',
  ':page_facing_up: Plan File Created': 'plan_file_created', ':floppy_disk: Committing Plan': 'plan_committing',
  ':hammer_and_wrench: Implementing Solution': 'implementing', ':white_check_mark: Implementation Complete': 'implemented',
  ':floppy_disk: Committing Implementation': 'implementation_committing', ':memo: Creating Pull Request': 'pr_creating',
  ':link: Pull Request Created': 'pr_created', ':tada: ADW Workflow Completed': 'completed',
  ':x: ADW Workflow Error': 'error',
};

/** ADW comment heading pattern: `## :emoji_name: Title` */
const ADW_COMMENT_PATTERN = /^## :[a-z_]+: /m;

/** Machine-readable footer appended to all ADW workflow comments. */
export const ADW_SIGNATURE = '\n\n---\n_Posted by ADW (AI Developer Workflow) automation_ <!-- adw-bot -->';

/** Pattern matching the HTML comment marker in the ADW signature footer. */
export const ADW_SIGNATURE_PATTERN = /<!-- adw-bot -->/;

/** Returns true if the comment body contains an ADW workflow heading pattern or the ADW signature marker. */
export function isAdwComment(commentBody: string): boolean {
  return ADW_COMMENT_PATTERN.test(commentBody) || ADW_SIGNATURE_PATTERN.test(commentBody);
}

/** Pattern matching the `## Take action` heading that signals an explicit human directive. */
export const ACTIONABLE_COMMENT_PATTERN = /^## Take action$/mi;

/** Returns true if the comment body contains the explicit `## Take action` directive heading. */
export function isActionableComment(commentBody: string): boolean {
  return ACTIONABLE_COMMENT_PATTERN.test(commentBody);
}

/** Truncates text to a maximum length with ellipsis. */
export function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/** Parses a workflow stage from a comment body. Returns null if not a workflow comment. */
export function parseWorkflowStageFromComment(commentBody: string): WorkflowStage | null {
  if (!commentBody.includes('ADW ID:')) return null;
  const headerMatch = commentBody.match(/^## (:[a-z_]+: .+)$/m);
  if (!headerMatch) return null;
  return STAGE_HEADER_MAP[headerMatch[1]] || null;
}

/** Extracts the ADW ID from a comment body. Matches both old format `adw-{timestamp}-{random}` and new format `adw-{slug}-{random}`. */
export function extractAdwIdFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`(adw-[a-z0-9][a-z0-9-]*[a-z0-9])`/);
  return match ? match[1] : null;
}

/** Extracts the branch name from a comment body. */
export function extractBranchNameFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`((feat|bug|chore|review|test)-issue-\d+[a-z0-9-]*)`/);
  return match ? match[1] : null;
}

/** Extracts the PR URL from a comment body. */
export function extractPrUrlFromComment(commentBody: string): string | null {
  const match = commentBody.match(/(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+)/);
  return match ? match[1] : null;
}

/** Extracts the plan file path from a comment body. Pattern: `specs/issue-{number}-plan.md` */
export function extractPlanPathFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`(specs\/issue-\d+-plan\.md)`/);
  return match ? match[1] : null;
}

const TERMINAL_STAGES: ReadonlyArray<WorkflowStage> = ['completed', 'error'];

/** Returns true if an ADW workflow is currently active (not completed or errored) for the given issue. */
export async function isAdwRunningForIssue(issueNumber: number): Promise<boolean> {
  const issue = await fetchGitHubIssue(issueNumber);

  const stageComments = issue.comments
    .map((c) => ({ stage: parseWorkflowStageFromComment(c.body), createdAt: c.createdAt }))
    .filter((entry): entry is { stage: WorkflowStage; createdAt: string } => entry.stage !== null);

  if (stageComments.length === 0) return false;

  const sorted = [...stageComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return !TERMINAL_STAGES.includes(sorted[0].stage);
}

/** Detects recovery state from GitHub comments. */
export function detectRecoveryState(comments: GitHubComment[]): RecoveryState {
  const nullState = { lastCompletedStage: null, adwId: null, branchName: null, planPath: null, prUrl: null };
  const defaultState: RecoveryState = { ...nullState, canResume: false };

  const adwComments = comments.filter(c => parseWorkflowStageFromComment(c.body) !== null);
  if (adwComments.length === 0) return defaultState;

  const sortedComments = [...adwComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (parseWorkflowStageFromComment(sortedComments[0].body) === 'completed') return defaultState;

  const accumulated = sortedComments.reverse().reduce((acc, comment) => {
    const stage = parseWorkflowStageFromComment(comment.body);
    if (!stage || stage === 'error') return acc;
    const stageIndex = STAGE_ORDER.indexOf(stage);
    const lastIndex = acc.lastCompletedStage ? STAGE_ORDER.indexOf(acc.lastCompletedStage) : -1;
    return {
      lastCompletedStage: stageIndex > lastIndex ? stage : acc.lastCompletedStage,
      adwId: extractAdwIdFromComment(comment.body) ?? acc.adwId,
      branchName: extractBranchNameFromComment(comment.body) ?? acc.branchName,
      planPath: extractPlanPathFromComment(comment.body) ?? acc.planPath,
      prUrl: extractPrUrlFromComment(comment.body) ?? acc.prUrl,
    };
  }, nullState as { lastCompletedStage: WorkflowStage | null; adwId: string | null; branchName: string | null; planPath: string | null; prUrl: string | null });

  return { ...accumulated, canResume: accumulated.lastCompletedStage !== null && accumulated.lastCompletedStage !== 'completed' };
}
