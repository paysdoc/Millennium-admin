#!/usr/bin/env npx tsx

/**
 * Webhook trigger for ADW (AI Developer Workflow).
 *
 * Receives GitHub webhook events and spawns adwPlanBuild.tsx
 * for new issues and adwPrReview.tsx for PR review comments.
 * Start with: npx tsx adws/triggers/trigger_webhook.ts
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { log, PullRequestWebhookPayload } from '../core';
import { closeIssue, formatIssueClosureComment } from '../github/githubApi';

const port = parseInt(process.env.PORT || '8001', 10);

const HTTP_STATUS_DESCRIPTIONS: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  405: 'Method Not Allowed',
};

function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  if (statusCode >= 400) {
    const description = HTTP_STATUS_DESCRIPTIONS[statusCode] || 'Error';
    log(`HTTP ${statusCode} ${description}: ${JSON.stringify(body)}`, 'error');
  }
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function spawnDetached(command: string, args: string[]): void {
  log(`Spawning: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    detached: true,
    stdio: 'inherit',
  });
  child.unref();
}

/**
 * Extracts issue number from PR body using the "Implements #N" pattern.
 * Returns null if no issue link is found.
 */
function extractIssueNumberFromPRBody(body: string | null): number | null {
  if (!body) {
    return null;
  }
  const match = body.match(/Implements #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Handles pull_request webhook events.
 * When a PR is closed (merged or not), closes the linked issue.
 */
async function handlePullRequestEvent(payload: PullRequestWebhookPayload): Promise<{ status: string; issue?: number }> {
  const { action, pull_request, repository } = payload;

  log(`Received pull_request event: action=${action}, PR=#${pull_request.number}, repo=${repository.full_name}`);

  // Only handle closed PRs
  if (action !== 'closed') {
    log(`Ignored pull_request action: ${action}`);
    return { status: 'ignored' };
  }

  const prNumber = pull_request.number;
  const prUrl = pull_request.html_url;
  const wasMerged = pull_request.merged;
  const prBody = pull_request.body;

  log(`PR #${prNumber} was ${wasMerged ? 'merged' : 'closed without merging'}`);

  // Extract issue number from PR body
  const issueNumber = extractIssueNumberFromPRBody(prBody);
  if (issueNumber === null) {
    log(`No issue link found in PR #${prNumber} body (no "Implements #N" pattern)`);
    return { status: 'ignored' };
  }

  log(`Found linked issue #${issueNumber} in PR #${prNumber}`);

  // Create closure comment
  const comment = formatIssueClosureComment(prNumber, prUrl, wasMerged);

  // Close the issue
  const closed = await closeIssue(issueNumber, comment);

  if (closed) {
    log(`Successfully closed issue #${issueNumber} after PR #${prNumber} was ${wasMerged ? 'merged' : 'closed'}`);
    return { status: 'closed', issue: issueNumber };
  } else {
    log(`Issue #${issueNumber} was already closed or could not be closed`);
    return { status: 'already_closed', issue: issueNumber };
  }
}

const server = http.createServer((req, res) => {
  if (req.url !== '/webhook') {
    jsonResponse(res, 404, { error: 'not found' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    jsonResponse(res, 405, { error: 'method not allowed' });
    return;
  }

  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      jsonResponse(res, 400, { error: 'invalid json' });
      return;
    }

    const event = req.headers['x-github-event'] as string | undefined;

    // Handle PR review comment events
    if (event === 'pull_request_review_comment' || event === 'pull_request_review') {
      const pr = (body.pull_request as Record<string, unknown> | undefined);
      const prNumber = pr?.number as number | undefined;
      if (prNumber == null) {
        log('No PR number found in payload');
        jsonResponse(res, 200, { status: 'ignored' });
        return;
      }

      const action = (body.action as string) || '';
      if (action !== 'created' && action !== 'submitted') {
        log(`Ignored PR review action: ${action}`);
        jsonResponse(res, 200, { status: 'ignored' });
        return;
      }

      log(`PR review comment on PR #${prNumber}, triggering ADW PR Review`);
      spawnDetached('npx', ['tsx', 'adws/adwPrReview.tsx', String(prNumber)]);
      jsonResponse(res, 200, { status: 'triggered', pr: prNumber });
      return;
    }

    // Handle pull_request events (for closing linked issues when PR is closed/merged)
    if (event === 'pull_request') {
      const action = (body.action as string) || '';
      if (action === 'closed') {
        // Handle asynchronously but respond quickly to avoid GitHub timeout
        handlePullRequestEvent(body as unknown as PullRequestWebhookPayload)
          .then((result) => {
            log(`PR close event handled: ${JSON.stringify(result)}`);
          })
          .catch((error) => {
            log(`Error handling PR close event: ${error}`, 'error');
          });
        jsonResponse(res, 200, { status: 'processing' });
        return;
      }
      log(`Ignored pull_request action: ${action}`);
      jsonResponse(res, 200, { status: 'ignored' });
      return;
    }

    // Handle issue events
    if (event !== 'issues') {
      log(`Ignored event: ${event || '(none)'}`);
      jsonResponse(res, 200, { status: 'ignored' });
      return;
    }

    const action = (body.action as string) || '';
    if (action !== 'opened') {
      log(`Ignored issues action: ${action}`);
      jsonResponse(res, 200, { status: 'ignored' });
      return;
    }

    const issue = (body.issue as Record<string, unknown> | undefined);
    const issueNumber = issue?.number as number | undefined;
    if (issueNumber == null) {
      log('No issue number found in payload');
      jsonResponse(res, 200, { status: 'ignored' });
      return;
    }

    log(`New issue #${issueNumber} detected, triggering ADW workflow`);
    spawnDetached('npx', ['tsx', 'adws/adwPlanBuild.tsx', String(issueNumber)]);
    jsonResponse(res, 200, { status: 'triggered', issue: issueNumber });
  });
});

log(`Starting webhook trigger on port ${port}`);
server.listen(port, '0.0.0.0', () => {
  log(`Webhook server listening on 0.0.0.0:${port}`);
});
