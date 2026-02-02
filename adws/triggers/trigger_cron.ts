/**
 * CRON trigger for ADW (AI Developer Workflow).
 *
 * Polls GitHub every 20 seconds for qualifying issues and
 * spawns adwPlanBuild.tsx for each. Start with: npx tsx adws/triggers/trigger_cron.ts
 */

import { execSync, spawn } from 'child_process';
import { log } from '../core';
import { getRepoInfo, fetchPRList, hasUnaddressedComments } from '../github';

const POLL_INTERVAL_MS = 20_000;
const PR_POLL_INTERVAL_MS = 60_000;
const processedIssues = new Set<number>();
const processedPRs = new Set<number>();

interface RawIssue {
  number: number;
  comments: { body: string }[];
  createdAt: string;
}

function fetchOpenIssues(): RawIssue[] {
  const { owner, repo } = getRepoInfo();
  try {
    const json = execSync(
      `gh issue list --repo ${owner}/${repo} --state open --json number,comments,createdAt`,
      { encoding: 'utf-8' }
    );
    return JSON.parse(json);
  } catch (error) {
    log(`Failed to fetch issues: ${error}`, 'error');
    return [];
  }
}

function isQualifyingIssue(issue: RawIssue): boolean {
  if (issue.comments.length === 0) {
    return true;
  }
  const latestComment = issue.comments[issue.comments.length - 1];
  return /adw/i.test(latestComment.body);
}

function checkAndTrigger(): void {
  log('Polling for new issues...');
  const issues = fetchOpenIssues();
  const qualifying = issues.filter(
    (issue) => isQualifyingIssue(issue) && !processedIssues.has(issue.number)
  );

  for (const issue of qualifying) {
    processedIssues.add(issue.number);
    log(`Triggering ADW workflow for issue #${issue.number}`, 'success');

    const child = spawn('npx', ['tsx', 'adws/adwPlanBuild.tsx', String(issue.number)], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  }

  if (qualifying.length === 0) {
    log('No new qualifying issues found');
  }
}

function checkPRsForReviewComments(): void {
  log('Polling for PRs with unaddressed review comments...');
  const prs = fetchPRList();

  for (const pr of prs) {
    if (processedPRs.has(pr.number)) continue;

    try {
      if (hasUnaddressedComments(pr.number)) {
        processedPRs.add(pr.number);
        log(`Triggering ADW PR Review for PR #${pr.number}`, 'success');

        const child = spawn('npx', ['tsx', 'adws/adwPrReview.tsx', String(pr.number)], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
      }
    } catch (error) {
      log(`Error checking PR #${pr.number}: ${error}`, 'error');
    }
  }
}

log('CRON trigger started');
checkAndTrigger();
setInterval(checkAndTrigger, POLL_INTERVAL_MS);
checkPRsForReviewComments();
setInterval(checkPRsForReviewComments, PR_POLL_INTERVAL_MS);
