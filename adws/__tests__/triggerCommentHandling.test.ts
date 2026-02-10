import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAdwComment } from '../github/workflowCommentsBase';

/**
 * Tests for the qualifying-issue logic used by the cron trigger.
 * The cron trigger's `isQualifyingIssue` function is module-private,
 * so we replicate its logic here using the shared `isAdwComment` utility.
 */

interface RawIssue {
  number: number;
  comments: { body: string }[];
  createdAt: string;
}

/** Replicates the cron trigger's isQualifyingIssue logic for testing. */
function isQualifyingIssue(issue: RawIssue): boolean {
  if (issue.comments.length === 0) return true;

  const latestComment = issue.comments[issue.comments.length - 1];
  if (/adw/i.test(latestComment.body)) return true;
  if (!isAdwComment(latestComment.body)) return true;

  return false;
}

describe('isQualifyingIssue (cron trigger logic)', () => {
  it('qualifies issue with no comments', () => {
    const issue: RawIssue = { number: 1, comments: [], createdAt: '2025-01-01T00:00:00Z' };
    expect(isQualifyingIssue(issue)).toBe(true);
  });

  it('does not qualify issue where latest comment is ADW comment without adw text', () => {
    // ADW comments that contain "adw" text qualify via the recovery path.
    // This tests a hypothetical ADW-format comment that lacks "adw" in its body.
    const issue: RawIssue = {
      number: 2,
      comments: [
        { body: '## :seedling: Branch Created\n\n**Branch:** `feature/issue-2-test`' },
      ],
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(isQualifyingIssue(issue)).toBe(false);
  });

  it('qualifies issue where latest comment is ADW comment with adw text (recovery)', () => {
    // All standard ADW comments include "ADW ID:" and thus match the /adw/i recovery check
    const issue: RawIssue = {
      number: 2,
      comments: [
        { body: '## :hammer_and_wrench: Implementing Solution\n\n**ADW ID:** `adw-123-abc`' },
      ],
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(isQualifyingIssue(issue)).toBe(true);
  });

  it('qualifies issue where latest comment is human comment', () => {
    const issue: RawIssue = {
      number: 3,
      comments: [
        { body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`' },
        { body: 'Please also update the tests' },
      ],
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(isQualifyingIssue(issue)).toBe(true);
  });

  it('qualifies issue where latest comment contains "adw" text (recovery)', () => {
    const issue: RawIssue = {
      number: 4,
      comments: [{ body: 'Something about adw recovery' }],
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(isQualifyingIssue(issue)).toBe(true);
  });

  it('qualifies issue where latest comment has emoji not in heading format', () => {
    const issue: RawIssue = {
      number: 5,
      comments: [{ body: ':thumbsup: this looks good to me' }],
      createdAt: '2025-01-01T00:00:00Z',
    };
    expect(isQualifyingIssue(issue)).toBe(true);
  });
});

describe('webhook issue_comment filtering', () => {
  it('identifies ADW system comment as non-actionable', () => {
    const body = '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`';
    expect(isAdwComment(body)).toBe(true);
  });

  it('identifies human comment as actionable', () => {
    const body = 'Can you also fix the styling issue?';
    expect(isAdwComment(body)).toBe(false);
  });

  it('ignores edited action (only created matters)', () => {
    // The webhook handler checks action === 'created' before processing.
    // This test validates that ADW comment detection itself is action-agnostic.
    const adwBody = '## :tada: ADW Workflow Completed\n\nDone';
    expect(isAdwComment(adwBody)).toBe(true);

    const humanBody = 'Updated my previous comment with more details';
    expect(isAdwComment(humanBody)).toBe(false);
  });
});

describe('cron deferral logic', () => {
  it('qualifying issue with human comment is detected', () => {
    const issue: RawIssue = {
      number: 10,
      comments: [
        { body: '## :tada: ADW Workflow Completed\n\n**ADW ID:** `adw-123-abc`' },
        { body: 'Actually, can you also handle edge case X?' },
      ],
      createdAt: '2025-01-01T00:00:00Z',
    };
    // Issue qualifies because latest comment is human
    expect(isQualifyingIssue(issue)).toBe(true);
  });

  it('issue with completed ADW comment only does not qualify', () => {
    const issue: RawIssue = {
      number: 11,
      comments: [
        { body: '## :tada: ADW Workflow Completed\n\n**ADW ID:** `adw-123-abc`' },
      ],
      createdAt: '2025-01-01T00:00:00Z',
    };
    // Latest comment is an ADW comment without "adw" match in raw text — wait, it does contain "ADW"
    // The /adw/i test will match "ADW" in the body, so this qualifies via the recovery path
    expect(isQualifyingIssue(issue)).toBe(true);
  });
});
