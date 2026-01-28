/**
 * Workflow comment formatting and posting functions.
 * Centralizes all GitHub issue comment templates for ADW workflow stages.
 */

import { WorkflowStage, IssueClassSlashCommand, RecoveryState, GitHubComment, PRReviewWorkflowStage } from './dataTypes';
import { commentOnIssue, commentOnPR } from './githubApi';
import { log } from './utils';

/**
 * Stage order for determining recovery resume point.
 */
export const STAGE_ORDER: WorkflowStage[] = [
  'starting',
  'resuming',
  'classified',
  'branch_created',
  'plan_building',
  'plan_created',
  'plan_file_created',
  'plan_committing',
  'implementing',
  'build_progress',
  'implemented',
  'implementation_committing',
  'pr_creating',
  'pr_created',
  'completed',
];

/**
 * Maps comment header patterns to workflow stages.
 */
const STAGE_HEADER_MAP: Record<string, WorkflowStage> = {
  ':rocket: ADW Workflow Started': 'starting',
  ':arrows_counterclockwise: ADW Workflow Resuming': 'resuming',
  ':mag: Issue Classified': 'classified',
  ':seedling: Branch Created': 'branch_created',
  ':pencil: Building Implementation Plan': 'plan_building',
  ':white_check_mark: Implementation Plan Created': 'plan_created',
  ':page_facing_up: Plan File Created': 'plan_file_created',
  ':floppy_disk: Committing Plan': 'plan_committing',
  ':hammer_and_wrench: Implementing Solution': 'implementing',
  ':white_check_mark: Implementation Complete': 'implemented',
  ':floppy_disk: Committing Implementation': 'implementation_committing',
  ':memo: Creating Pull Request': 'pr_creating',
  ':link: Pull Request Created': 'pr_created',
  ':tada: ADW Workflow Completed': 'completed',
  ':x: ADW Workflow Error': 'error',
};

/**
 * Parses a workflow stage from a comment body.
 * Returns null if the comment is not a workflow comment.
 */
export function parseWorkflowStageFromComment(commentBody: string): WorkflowStage | null {
  // Check if this is an ADW workflow comment (starts with ## : and contains ADW ID:)
  if (!commentBody.includes('ADW ID:')) {
    return null;
  }

  // Extract the header line (e.g., "## :rocket: ADW Workflow Started")
  const headerMatch = commentBody.match(/^## (:[a-z_]+: .+)$/m);
  if (!headerMatch) {
    return null;
  }

  const header = headerMatch[1];
  return STAGE_HEADER_MAP[header] || null;
}

/**
 * Extracts the ADW ID from a comment body.
 * Pattern: `adw-{timestamp}-{random}`
 */
export function extractAdwIdFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`(adw-\d+-[a-z0-9]+)`/);
  return match ? match[1] : null;
}

/**
 * Extracts the branch name from a comment body.
 * Pattern: `feature/issue-{number}-{slug}`
 */
export function extractBranchNameFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`(feature\/issue-\d+[a-z0-9-]*)`/);
  return match ? match[1] : null;
}

/**
 * Extracts the PR URL from a comment body.
 */
export function extractPrUrlFromComment(commentBody: string): string | null {
  // PR URLs are typically in format: https://github.com/owner/repo/pull/123
  const match = commentBody.match(/(https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+)/);
  return match ? match[1] : null;
}

/**
 * Extracts the plan file path from a comment body.
 * Pattern: `specs/issue-{number}-plan.md`
 */
export function extractPlanPathFromComment(commentBody: string): string | null {
  const match = commentBody.match(/`(specs\/issue-\d+-plan\.md)`/);
  return match ? match[1] : null;
}

/**
 * Detects recovery state from GitHub comments.
 * Returns information about the last completed stage and extracted context.
 */
export function detectRecoveryState(comments: GitHubComment[]): RecoveryState {
  const defaultState: RecoveryState = {
    lastCompletedStage: null,
    adwId: null,
    branchName: null,
    planPath: null,
    prUrl: null,
    canResume: false,
  };

  // Filter to only ADW workflow comments
  const adwComments = comments.filter(c => parseWorkflowStageFromComment(c.body) !== null);

  if (adwComments.length === 0) {
    return defaultState;
  }

  // Sort by createdAt descending (most recent first)
  const sortedComments = [...adwComments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Get the most recent comment
  const mostRecentComment = sortedComments[0];
  const mostRecentStage = parseWorkflowStageFromComment(mostRecentComment.body);

  // If the most recent stage is 'completed', no recovery needed
  if (mostRecentStage === 'completed') {
    return defaultState;
  }

  // If the most recent stage is 'error', find the last successful stage before error
  let lastCompletedStage: WorkflowStage | null = null;
  let adwId: string | null = null;
  let branchName: string | null = null;
  let planPath: string | null = null;
  let prUrl: string | null = null;

  // Extract all data from comments (oldest to newest to capture latest values)
  for (const comment of sortedComments.reverse()) {
    const stage = parseWorkflowStageFromComment(comment.body);
    if (!stage || stage === 'error') continue;

    // Track the last completed stage (excluding in-progress stages)
    const stageIndex = STAGE_ORDER.indexOf(stage);
    const lastIndex = lastCompletedStage ? STAGE_ORDER.indexOf(lastCompletedStage) : -1;
    if (stageIndex > lastIndex) {
      lastCompletedStage = stage;
    }

    // Extract context data from comments
    const extractedAdwId = extractAdwIdFromComment(comment.body);
    if (extractedAdwId) adwId = extractedAdwId;

    const extractedBranch = extractBranchNameFromComment(comment.body);
    if (extractedBranch) branchName = extractedBranch;

    const extractedPlanPath = extractPlanPathFromComment(comment.body);
    if (extractedPlanPath) planPath = extractedPlanPath;

    const extractedPrUrl = extractPrUrlFromComment(comment.body);
    if (extractedPrUrl) prUrl = extractedPrUrl;
  }

  // Can resume if we have a last completed stage and it's not the final stage
  const canResume = lastCompletedStage !== null && lastCompletedStage !== 'completed';

  return {
    lastCompletedStage,
    adwId,
    branchName,
    planPath,
    prUrl,
    canResume,
  };
}

/**
 * Context information for workflow comments.
 */
export interface WorkflowContext {
  issueNumber: number;
  adwId: string;
  branchName?: string;
  issueType?: IssueClassSlashCommand;
  planPath?: string;
  planOutput?: string;
  buildOutput?: string;
  prUrl?: string;
  errorMessage?: string;
  /** The stage from which the workflow is being resumed (for recovery) */
  resumeFrom?: WorkflowStage;
  /** Build progress information */
  buildProgress?: {
    turnCount: number;
    toolCount: number;
    lastToolName?: string;
    lastText?: string;
  };
}

/**
 * Maps issue types to human-readable labels.
 */
const issueTypeLabels: Record<IssueClassSlashCommand, string> = {
  '/feature': 'feature',
  '/bug': 'bug',
  '/chore': 'chore',
};

/**
 * Truncates text to a maximum length with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * Formats the starting workflow comment.
 */
function formatStartingComment(ctx: WorkflowContext): string {
  return `## :rocket: ADW Workflow Started

Starting automated development workflow for this issue.

**ADW ID:** \`${ctx.adwId}\`

_Processing issue..._`;
}

/**
 * Formats the classified comment.
 */
function formatClassifiedComment(ctx: WorkflowContext): string {
  const typeLabel = ctx.issueType ? issueTypeLabels[ctx.issueType] : 'unknown';
  return `## :mag: Issue Classified

Issue classified as: **${typeLabel}**

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the branch created comment.
 */
function formatBranchCreatedComment(ctx: WorkflowContext): string {
  return `## :seedling: Branch Created

Working on branch: \`${ctx.branchName}\`

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the plan building comment.
 */
function formatPlanBuildingComment(ctx: WorkflowContext): string {
  return `## :pencil: Building Implementation Plan

Generating implementation plan...

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the plan created comment.
 */
function formatPlanCreatedComment(ctx: WorkflowContext): string {
  const truncatedOutput = ctx.planOutput ? truncateText(ctx.planOutput, 2000) : '';

  return `## :white_check_mark: Implementation Plan Created

An implementation plan has been generated for this issue.

**Plan file:** \`${ctx.planPath}\`
**Branch:** \`${ctx.branchName}\`
**ADW ID:** \`${ctx.adwId}\`

<details>
<summary>Plan Summary</summary>

${truncatedOutput}

</details>

Generated by ADW Plan Agent`;
}

/**
 * Formats the plan file created comment.
 */
function formatPlanFileCreatedComment(ctx: WorkflowContext): string {
  return `## :page_facing_up: Plan File Created

Plan file confirmed at: \`${ctx.planPath}\`

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the plan committing comment.
 */
function formatPlanCommittingComment(ctx: WorkflowContext): string {
  return `## :floppy_disk: Committing Plan

Committing implementation plan to branch...

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the implementing comment.
 */
function formatImplementingComment(ctx: WorkflowContext): string {
  return `## :hammer_and_wrench: Implementing Solution

Running Build Agent to implement the solution...

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the build progress comment.
 */
function formatBuildProgressComment(ctx: WorkflowContext): string {
  const progress = ctx.buildProgress;
  if (!progress) {
    return `## :gear: Build Progress

Build in progress...

**ADW ID:** \`${ctx.adwId}\``;
  }

  const lastAction = progress.lastToolName
    ? `Last action: \`${progress.lastToolName}\``
    : '';

  const statusText = progress.lastText
    ? truncateText(progress.lastText, 300)
    : '';

  return `## :gear: Build Progress

**Turns completed:** ${progress.turnCount}
**Tool calls made:** ${progress.toolCount}
${lastAction}

${statusText ? `**Status:**\n${statusText}` : ''}

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the implemented comment.
 */
function formatImplementedComment(ctx: WorkflowContext): string {
  const truncatedOutput = ctx.buildOutput ? truncateText(ctx.buildOutput, 2000) : '';

  return `## :white_check_mark: Implementation Complete

The implementation for this issue has been completed.

**Branch:** \`${ctx.branchName}\`
**ADW ID:** \`${ctx.adwId}\`

<details>
<summary>Implementation Summary</summary>

${truncatedOutput}

</details>

Generated by ADW Build Agent`;
}

/**
 * Formats the implementation committing comment.
 */
function formatImplementationCommittingComment(ctx: WorkflowContext): string {
  return `## :floppy_disk: Committing Implementation

Committing implementation changes to branch...

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the PR creating comment.
 */
function formatPrCreatingComment(ctx: WorkflowContext): string {
  return `## :memo: Creating Pull Request

Creating pull request for review...

**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the PR created comment.
 */
function formatPrCreatedComment(ctx: WorkflowContext): string {
  return `## :link: Pull Request Created

A pull request has been created for this issue.

**PR:** ${ctx.prUrl}
**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the completed comment.
 */
function formatCompletedComment(ctx: WorkflowContext): string {
  return `## :tada: ADW Workflow Completed

Automated development workflow completed successfully!

**Branch:** \`${ctx.branchName}\`
**PR:** ${ctx.prUrl}
**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats the error comment.
 */
function formatErrorComment(ctx: WorkflowContext): string {
  return `## :x: ADW Workflow Error

An error occurred during the automated development workflow.

**Error:** ${ctx.errorMessage || 'Unknown error'}
**ADW ID:** \`${ctx.adwId}\`

Please check the logs for more details.`;
}

/**
 * Formats the resuming workflow comment.
 */
export function formatResumingComment(ctx: WorkflowContext, resumeFrom: WorkflowStage): string {
  return `## :arrows_counterclockwise: ADW Workflow Resuming

Resuming automated development workflow from previous run.

**Resuming from:** ${resumeFrom}
**ADW ID:** \`${ctx.adwId}\``;
}

/**
 * Formats a workflow comment for the given stage.
 */
export function formatWorkflowComment(stage: WorkflowStage, ctx: WorkflowContext): string {
  switch (stage) {
    case 'starting':
      return formatStartingComment(ctx);
    case 'resuming':
      return formatResumingComment(ctx, ctx.resumeFrom || 'starting');
    case 'classified':
      return formatClassifiedComment(ctx);
    case 'branch_created':
      return formatBranchCreatedComment(ctx);
    case 'plan_building':
      return formatPlanBuildingComment(ctx);
    case 'plan_created':
      return formatPlanCreatedComment(ctx);
    case 'plan_file_created':
      return formatPlanFileCreatedComment(ctx);
    case 'plan_committing':
      return formatPlanCommittingComment(ctx);
    case 'implementing':
      return formatImplementingComment(ctx);
    case 'build_progress':
      return formatBuildProgressComment(ctx);
    case 'implemented':
      return formatImplementedComment(ctx);
    case 'implementation_committing':
      return formatImplementationCommittingComment(ctx);
    case 'pr_creating':
      return formatPrCreatingComment(ctx);
    case 'pr_created':
      return formatPrCreatedComment(ctx);
    case 'completed':
      return formatCompletedComment(ctx);
    case 'error':
      return formatErrorComment(ctx);
    default:
      return `## ADW Workflow Update\n\n**Stage:** ${stage}\n**ADW ID:** \`${ctx.adwId}\``;
  }
}

/**
 * Posts a workflow comment to the GitHub issue.
 * Handles errors gracefully to prevent comment failures from breaking the workflow.
 */
export function postWorkflowComment(
  issueNumber: number,
  stage: WorkflowStage,
  ctx: WorkflowContext
): void {
  try {
    const comment = formatWorkflowComment(stage, ctx);
    commentOnIssue(issueNumber, comment);
  } catch (error) {
    log(`Failed to post workflow comment for stage '${stage}': ${error}`, 'error');
  }
}

// ============================================================
// PR Review Workflow Comments
// ============================================================

/**
 * Context for PR review workflow comments.
 */
export interface PRReviewWorkflowContext extends WorkflowContext {
  prNumber: number;
  reviewComments: number;
  revisionPlanOutput?: string;
  revisionBuildOutput?: string;
}

/**
 * Formats a PR review workflow comment for the given stage.
 */
export function formatPRReviewWorkflowComment(
  stage: PRReviewWorkflowStage,
  ctx: PRReviewWorkflowContext
): string {
  switch (stage) {
    case 'pr_review_starting':
      return `## :eyes: Addressing PR Review Comments

Starting automated review of **${ctx.reviewComments}** review comment(s).

**ADW ID:** \`${ctx.adwId}\`

_Analyzing review feedback..._`;

    case 'pr_review_planning':
      return `## :pencil: Planning PR Review Changes

Creating a revision plan based on review feedback...

**ADW ID:** \`${ctx.adwId}\``;

    case 'pr_review_planned': {
      const truncated = ctx.revisionPlanOutput
        ? truncateText(ctx.revisionPlanOutput, 2000)
        : '';
      return `## :white_check_mark: Revision Plan Created

A revision plan has been created to address the review comments.

**ADW ID:** \`${ctx.adwId}\`

<details>
<summary>Revision Plan Summary</summary>

${truncated}

</details>`;
    }

    case 'pr_review_implementing':
      return `## :hammer_and_wrench: Implementing Review Changes

Running Build Agent to implement the revision plan...

**ADW ID:** \`${ctx.adwId}\``;

    case 'pr_review_implemented': {
      const truncatedBuild = ctx.revisionBuildOutput
        ? truncateText(ctx.revisionBuildOutput, 2000)
        : '';
      return `## :white_check_mark: Review Changes Implemented

Changes have been implemented to address the review comments.

**ADW ID:** \`${ctx.adwId}\`

<details>
<summary>Implementation Summary</summary>

${truncatedBuild}

</details>`;
    }

    case 'pr_review_committing':
      return `## :floppy_disk: Committing Review Changes

Committing and pushing changes...

**ADW ID:** \`${ctx.adwId}\``;

    case 'pr_review_pushed':
      return `## :rocket: Changes Pushed

Review changes have been committed and pushed to the branch.

**ADW ID:** \`${ctx.adwId}\``;

    case 'pr_review_completed':
      return `## :tada: PR Review Comments Addressed

All **${ctx.reviewComments}** review comment(s) have been addressed.

**ADW ID:** \`${ctx.adwId}\`

Generated by ADW PR Review workflow`;

    case 'pr_review_error':
      return `## :x: PR Review Workflow Error

An error occurred while addressing review comments.

**Error:** ${ctx.errorMessage || 'Unknown error'}
**ADW ID:** \`${ctx.adwId}\`

Please check the logs for more details.`;

    default:
      return `## ADW PR Review Update\n\n**Stage:** ${stage}\n**ADW ID:** \`${ctx.adwId}\``;
  }
}

/**
 * Posts a PR review workflow comment directly on the PR.
 */
export function postPRWorkflowComment(
  prNumber: number,
  stage: PRReviewWorkflowStage,
  ctx: PRReviewWorkflowContext
): void {
  try {
    const comment = formatPRReviewWorkflowComment(stage, ctx);
    commentOnPR(prNumber, comment);
  } catch (error) {
    log(`Failed to post PR workflow comment for stage '${stage}': ${error}`, 'error');
  }
}
