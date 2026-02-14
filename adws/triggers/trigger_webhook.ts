#!/usr/bin/env npx tsx

/**
 * Webhook trigger for ADW (AI Developer Workflow).
 *
 * Receives GitHub webhook events and spawns adwPlanBuild.tsx
 * for new issues and adwPrReview.tsx for PR review comments.
 * Start with: npx tsx adws/triggers/trigger_webhook.ts
 */

import * as http from 'http';
import { log } from '../core';
import { jsonResponse, spawnDetached } from './webhookUtils';
import {
  handleIssueCommentEvent,
  handlePullRequestWebhook,
  handleIssuesEvent,
} from './webhookHandlers';

const port = parseInt(process.env.PORT || '8001', 10);

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

    if (event === 'issue_comment') {
      handleIssueCommentEvent(body, res);
      return;
    }

    if (event === 'pull_request') {
      handlePullRequestWebhook(body, res);
      return;
    }

    if (event !== 'issues') {
      log(`Ignored event: ${event || '(none)'}`);
      jsonResponse(res, 200, { status: 'ignored' });
      return;
    }

    handleIssuesEvent(body, res);
  });
});

log(`Starting webhook trigger on port ${port}`);
server.listen(port, '0.0.0.0', () => {
  log(`Webhook server listening on 0.0.0.0:${port}`);
});
