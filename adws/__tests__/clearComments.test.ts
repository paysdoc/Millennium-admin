import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('../core/utils', () => ({
  log: vi.fn(),
}));

import { execSync } from 'child_process';
import { fetchIssueCommentsRest, deleteIssueComment } from '../github/githubApi';
import { clearIssueComments } from '../adwClearComments';
import { IssueCommentSummary } from '../core/dataTypes';

function makeComment(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 100,
    body: 'Test comment body',
    user: { login: 'testuser', type: 'User' },
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<IssueCommentSummary> = {}): IssueCommentSummary {
  return {
    id: 100,
    body: 'Test comment body',
    authorLogin: 'testuser',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const REPO_REMOTE = 'https://github.com/owner/repo.git';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('fetchIssueCommentsRest', () => {
  it('returns mapped IssueCommentSummary array on success', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE); // getRepoInfo
    mockExec.mockReturnValueOnce(JSON.stringify([
      makeComment({ id: 1, body: 'First', user: { login: 'alice' }, created_at: '2025-01-01T00:00:00Z' }),
      makeComment({ id: 2, body: 'Second', user: { login: 'bob' }, created_at: '2025-01-02T00:00:00Z' }),
    ]));

    const result = fetchIssueCommentsRest(42);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, body: 'First', authorLogin: 'alice', createdAt: '2025-01-01T00:00:00Z' });
    expect(result[1]).toEqual({ id: 2, body: 'Second', authorLogin: 'bob', createdAt: '2025-01-02T00:00:00Z' });
  });

  it('returns empty array on API error', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE); // getRepoInfo
    mockExec.mockImplementationOnce(() => { throw new Error('API error'); });

    const result = fetchIssueCommentsRest(42);

    expect(result).toEqual([]);
  });

  it('handles empty comment list', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce(JSON.stringify([]));

    const result = fetchIssueCommentsRest(42);

    expect(result).toEqual([]);
  });
});

describe('deleteIssueComment', () => {
  it('returns true on successful deletion', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE); // getRepoInfo
    mockExec.mockReturnValueOnce(''); // DELETE response

    const result = deleteIssueComment(123);

    expect(result).toBe(true);
  });

  it('returns false on API error', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockImplementationOnce(() => { throw new Error('403 Forbidden'); });

    const result = deleteIssueComment(123);

    expect(result).toBe(false);
  });
});

describe('clearIssueComments', () => {
  it('successfully deletes all comments and returns correct counts', () => {
    const mockExec = vi.mocked(execSync);
    // fetchIssueCommentsRest: getRepoInfo + api call
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce(JSON.stringify([
      makeComment({ id: 1 }),
      makeComment({ id: 2 }),
      makeComment({ id: 3 }),
    ]));
    // deleteIssueComment x3: each needs getRepoInfo + delete call
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce('');
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce('');
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce('');

    const result = clearIssueComments(1, false);

    expect(result).toEqual({ total: 3, deleted: 3, failed: 0 });
  });

  it('returns zeros when no comments exist', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce(JSON.stringify([]));

    const result = clearIssueComments(1, false);

    expect(result).toEqual({ total: 0, deleted: 0, failed: 0 });
  });

  it('handles partial failures correctly', () => {
    const mockExec = vi.mocked(execSync);
    // fetchIssueCommentsRest
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce(JSON.stringify([
      makeComment({ id: 1 }),
      makeComment({ id: 2 }),
    ]));
    // First delete succeeds
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce('');
    // Second delete fails
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockImplementationOnce(() => { throw new Error('Permission denied'); });

    const result = clearIssueComments(1, false);

    expect(result).toEqual({ total: 2, deleted: 1, failed: 1 });
  });

  it('dry-run mode does not delete and returns deleted: 0', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockReturnValueOnce(JSON.stringify([
      makeComment({ id: 1, body: 'Comment one' }),
      makeComment({ id: 2, body: 'Comment two' }),
    ]));

    const result = clearIssueComments(1, true);

    expect(result).toEqual({ total: 2, deleted: 0, failed: 0 });
    // After the fetch, no more execSync calls should have been made for deletion
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('returns zeros when fetch returns empty due to error', () => {
    const mockExec = vi.mocked(execSync);
    mockExec.mockReturnValueOnce(REPO_REMOTE);
    mockExec.mockImplementationOnce(() => { throw new Error('Not found'); });

    const result = clearIssueComments(999, false);

    expect(result).toEqual({ total: 0, deleted: 0, failed: 0 });
  });
});
