#!/usr/bin/env npx tsx

/**
 * Webhook trigger for ADW (AI Developer Workflow).
 *
 * Receives GitHub webhook events and spawns adwPlanBuild.tsx
 * for new issues and adwPrReview.tsx for PR review comments.
 * Start with: npx tsx adws/trigger_webhook.ts
 */

import * as http from 'http';
import { spawn } from 'child_process';
import { log } from './utils';

const port = parseInt(process.env.PORT || '8001', 10);

function jsonResponse(
  res: http.ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    jsonResponse(res, 404, { error: 'not found' });
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
