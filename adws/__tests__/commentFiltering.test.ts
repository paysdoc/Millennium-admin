import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../core/utils', () => ({
  log: vi.fn(),
}));

import { execSync } from 'child_process';
import { isAdwComment, isAdwRunningForIssue } from '../github/workflowCommentsBase';

describe('isAdwComment', () => {
  it('returns true for ADW workflow started comment', () => {
    const body = '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`';
    expect(isAdwComment(body)).toBe(true);
  });

  it('returns true for ADW build progress comment', () => {
    const body = '## :gear: Build Progress\n\n**Turns completed:** 5';
    expect(isAdwComment(body)).toBe(true);
  });

  it('returns true for ADW error comment', () => {
    const body = '## :x: ADW Workflow Error\n\n**Error:** something went wrong';
    expect(isAdwComment(body)).toBe(true);
  });

  it('returns true for ADW completed comment', () => {
    const body = '## :tada: ADW Workflow Completed\n\nAll done!';
    expect(isAdwComment(body)).toBe(true);
  });

  it('returns true for ADW implementing comment', () => {
    const body = '## :hammer_and_wrench: Implementing Solution\n\nWorking on it...';
    expect(isAdwComment(body)).toBe(true);
  });

  it('returns false for plain human comment', () => {
    expect(isAdwComment('Please also update the tests')).toBe(false);
  });

  it('returns false for human comment with emoji but not in heading format', () => {
    expect(isAdwComment(':thumbsup: looks good')).toBe(false);
  });

  it('returns false for human comment with heading but no emoji', () => {
    expect(isAdwComment('## Some heading\n\nDetails here')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isAdwComment('')).toBe(false);
  });

  it('returns false for comment with emoji heading missing trailing space', () => {
    expect(isAdwComment('## :rocket:No space after colon')).toBe(false);
  });

  it('returns false for comment with colon-wrapped words not in heading', () => {
    expect(isAdwComment('please check :the_file: for errors')).toBe(false);
  });
});

describe('isAdwRunningForIssue', () => {
  beforeEach(() => {
    vi.mocked(execSync).mockReset();
  });

  const makeIssueJson = (comments: { body: string; createdAt: string }[]) =>
    JSON.stringify({
      number: 42,
      title: 'Test issue',
      body: 'Issue body',
      state: 'OPEN',
      author: { login: 'user', type: 'User' },
      assignees: [],
      labels: [],
      milestone: null,
      comments: comments.map((c, i) => ({
        id: `comment-${i}`,
        author: { login: 'bot', type: 'Bot' },
        body: c.body,
        createdAt: c.createdAt,
        updatedAt: c.createdAt,
      })),
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      closedAt: null,
      url: 'https://github.com/owner/repo/issues/42',
    });

  it('returns false when issue has no comments', async () => {
    vi.mocked(execSync).mockReturnValue(makeIssueJson([]));
    expect(await isAdwRunningForIssue(42)).toBe(false);
  });

  it('returns false when issue has only non-ADW comments', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        { body: 'Human comment here', createdAt: '2025-01-01T01:00:00Z' },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(false);
  });

  it('returns false when latest ADW stage is completed', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        {
          body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T01:00:00Z',
        },
        {
          body: '## :tada: ADW Workflow Completed\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T02:00:00Z',
        },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(false);
  });

  it('returns false when latest ADW stage is error', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        {
          body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T01:00:00Z',
        },
        {
          body: '## :x: ADW Workflow Error\n\n**ADW ID:** `adw-123-abc`\n**Error:** failed',
          createdAt: '2025-01-01T02:00:00Z',
        },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(false);
  });

  it('returns true when latest ADW stage is implementing', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        {
          body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T01:00:00Z',
        },
        {
          body: '## :hammer_and_wrench: Implementing Solution\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T02:00:00Z',
        },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(true);
  });

  it('returns true when latest ADW stage is starting', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        {
          body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T01:00:00Z',
        },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(true);
  });

  it('ignores non-ADW comments when determining workflow state', async () => {
    vi.mocked(execSync).mockReturnValue(
      makeIssueJson([
        {
          body: '## :rocket: ADW Workflow Started\n\n**ADW ID:** `adw-123-abc`',
          createdAt: '2025-01-01T01:00:00Z',
        },
        {
          body: 'Human follow-up comment',
          createdAt: '2025-01-01T03:00:00Z',
        },
      ])
    );
    expect(await isAdwRunningForIssue(42)).toBe(true);
  });
});
