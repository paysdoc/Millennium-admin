/** Webhook event handler functions for pull_request, issue_comment, and issues events. */
import * as http from 'http';
import { log, PullRequestWebhookPayload } from '../core';
import { closeIssue, formatIssueClosureComment } from '../github/issueLifecycle';
import { isActionableComment, isAdwRunningForIssue, truncateText } from '../github';
import { removeWorktree, removeWorktreesForIssue } from '../github/worktreeOperations';
import { classifyIssueForTrigger, getWorkflowScript } from './issueClassifier';
import { jsonResponse, spawnDetached } from './webhookUtils';

/** Classifies an issue and spawns the appropriate workflow, with fallback. */
function classifyAndSpawnWorkflow(issueNumber: number): void {
  classifyIssueForTrigger(issueNumber)
    .then((classification) => {
      const script = getWorkflowScript(classification.issueType, classification.adwCommand);
      log(`Issue #${issueNumber} classified as ${classification.issueType}, spawning ${script}`, 'success');
      spawnDetached('npx', ['tsx', script, String(issueNumber)]);
    })
    .catch((error) => {
      log(`Error classifying issue #${issueNumber}: ${error}, defaulting to adwPlanBuildTest.tsx`, 'error');
      spawnDetached('npx', ['tsx', 'adws/adwPlanBuildTest.tsx', String(issueNumber)]);
    });
}

/** Extracts issue number from PR body using the "Implements #N" pattern. */
export function extractIssueNumberFromPRBody(body: string | null): number | null {
  if (!body) return null;
  const match = body.match(/Implements #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Handles pull_request webhook events. Closes linked issues when a PR is closed. */
export async function handlePullRequestEvent(
  payload: PullRequestWebhookPayload,
): Promise<{ status: string; issue?: number }> {
  const { action, pull_request, repository } = payload;
  log(`Received pull_request event: action=${action}, PR=#${pull_request.number}, repo=${repository.full_name}`);
  if (action !== 'closed') {
    log(`Ignored pull_request action: ${action}`);
    return { status: 'ignored' };
  }
  const { number: prNumber, html_url: prUrl, merged: wasMerged, body: prBody } = pull_request;
  const headBranch = pull_request.head?.ref;
  log(`PR #${prNumber} was ${wasMerged ? 'merged' : 'closed without merging'}`);

  if (headBranch) {
    try {
      const removed = removeWorktree(headBranch);
      log(removed ? `Cleaned up worktree for branch: ${headBranch}` : `No worktree found for branch: ${headBranch}`, removed ? 'success' : 'info');
    } catch (error) {
      log(`Failed to clean up worktree for branch ${headBranch}: ${error}`, 'error');
    }
  }

  const issueNumber = extractIssueNumberFromPRBody(prBody);
  if (issueNumber === null) {
    log(`No issue link found in PR #${prNumber} body (no "Implements #N" pattern)`);
    return { status: 'ignored' };
  }

  log(`Found linked issue #${issueNumber} in PR #${prNumber}`);
  const comment = formatIssueClosureComment(prNumber, prUrl, wasMerged);
  const closed = await closeIssue(issueNumber, comment);
  if (closed) {
    log(`Successfully closed issue #${issueNumber} after PR #${prNumber} was ${wasMerged ? 'merged' : 'closed'}`);
    return { status: 'closed', issue: issueNumber };
  }
  log(`Issue #${issueNumber} was already closed or could not be closed`);
  return { status: 'already_closed', issue: issueNumber };
}

/** Handles issue_comment webhook events. Triggers workflows for actionable comments. */
export function handleIssueCommentEvent(body: Record<string, unknown>, res: http.ServerResponse): void {
  const action = (body.action as string) || '';
  if (action !== 'created') {
    log(`Ignored issue_comment action: ${action}`);
    jsonResponse(res, 200, { status: 'ignored' });
    return;
  }
  const comment = body.comment as Record<string, unknown> | undefined;
  const commentBody = (comment?.body as string) || '';
  const issue = body.issue as Record<string, unknown> | undefined;
  const issueNumber = issue?.number as number | undefined;
  if (issueNumber == null) {
    log('No issue number found in issue_comment payload');
    jsonResponse(res, 200, { status: 'ignored' });
    return;
  }
  log(`Checking comment on issue #${issueNumber}: "${truncateText(commentBody, 100)}"`);
  if (!isActionableComment(commentBody)) {
    log(`Ignored comment on issue #${issueNumber}: missing "## Take action" directive`);
    jsonResponse(res, 200, { status: 'ignored' });
    return;
  }
  log(`Actionable comment on issue #${issueNumber}: contains "## Take action" directive`);
  isAdwRunningForIssue(issueNumber)
    .then((running) => {
      if (running) {
        log(`ADW workflow already running for issue #${issueNumber}, deferring comment`);
        return;
      }
      log(`Human comment on issue #${issueNumber}, triggering ADW workflow`);
      classifyAndSpawnWorkflow(issueNumber);
    })
    .catch((error) => {
      log(`Error handling comment on issue #${issueNumber}: ${error}`, 'error');
      spawnDetached('npx', ['tsx', 'adws/adwPlanBuildTest.tsx', String(issueNumber)]);
    });
  jsonResponse(res, 200, { status: 'processing', issue: issueNumber });
}

/** Handles pull_request webhook routing. Dispatches closed PRs to handlePullRequestEvent. */
export function handlePullRequestWebhook(body: Record<string, unknown>, res: http.ServerResponse): void {
  const action = (body.action as string) || '';
  if (action === 'closed') {
    handlePullRequestEvent(body as unknown as PullRequestWebhookPayload)
      .then((result) => log(`PR close event handled: ${JSON.stringify(result)}`))
      .catch((error) => log(`Error handling PR close event: ${error}`, 'error'));
    jsonResponse(res, 200, { status: 'processing' });
    return;
  }
  log(`Ignored pull_request action: ${action}`);
  jsonResponse(res, 200, { status: 'ignored' });
}

/** Handles issues webhook events. Triggers classification for opened issues and cleanup on close. */
export function handleIssuesEvent(body: Record<string, unknown>, res: http.ServerResponse): void {
  const action = (body.action as string) || '';
  const issue = (body.issue as Record<string, unknown> | undefined);
  const issueNumber = issue?.number as number | undefined;
  if (issueNumber == null) {
    log('No issue number found in payload');
    jsonResponse(res, 200, { status: 'ignored' });
    return;
  }
  if (action === 'closed') {
    log(`Issue #${issueNumber} closed, removing associated worktrees`);
    const removed = removeWorktreesForIssue(issueNumber);
    log(`Removed ${removed} worktree(s) for issue #${issueNumber}`, 'success');
    jsonResponse(res, 200, { status: 'worktrees_cleaned', issue: issueNumber, removed });
    return;
  }
  if (action === 'opened') {
    log(`New issue #${issueNumber} detected, classifying and triggering ADW workflow`);
    classifyAndSpawnWorkflow(issueNumber);
    jsonResponse(res, 200, { status: 'processing', issue: issueNumber });
    return;
  }
  log(`Ignored issues action: ${action}`);
  jsonResponse(res, 200, { status: 'ignored' });
}
