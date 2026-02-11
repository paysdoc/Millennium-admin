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

function makeRestComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    body: 'Some comment',
    user: { login: 'testuser' },
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(execSync).mockReset();
});

describe('fetchIssueCommentsRest', () => {
  it('fetches and maps comments with numeric IDs', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify([
      makeRestComment({ id: 1, body: 'First', user: { login: 'alice' }, created_at: '2025-01-01T00:00:00Z' }),
      makeRestComment({ id: 2, body: 'Second', user: { login: 'bob' }, created_at: '2025-01-02T00:00:00Z' }),
    ]));

    const result = fetchIssueCommentsRest('owner', 'repo', 42);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, body: 'First', authorLogin: 'alice', createdAt: '2025-01-01T00:00:00Z' });
    expect(result[1]).toEqual({ id: 2, body: 'Second', authorLogin: 'bob', createdAt: '2025-01-02T00:00:00Z' });
    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      'gh api --paginate repos/owner/repo/issues/42/comments',
      { encoding: 'utf-8' },
    );
  });

  it('returns empty array when no comments exist', () => {
    vi.mocked(execSync).mockReturnValue(JSON.stringify([]));

    const result = fetchIssueCommentsRest('owner', 'repo', 1);

    expect(result).toEqual([]);
  });

  it('throws on API error', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('API error'); });

    expect(() => fetchIssueCommentsRest('owner', 'repo', 1)).toThrow('Failed to fetch comments for issue #1');
  });
});

describe('deleteIssueComment', () => {
  it('deletes a comment with correct gh api command', () => {
    vi.mocked(execSync).mockReturnValue('');

    deleteIssueComment('owner', 'repo', 123);

    expect(vi.mocked(execSync)).toHaveBeenCalledWith(
      'gh api -X DELETE repos/owner/repo/issues/comments/123',
      { encoding: 'utf-8' },
    );
  });

  it('throws on API error', () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('Not found'); });

    expect(() => deleteIssueComment('owner', 'repo', 999)).toThrow('Failed to delete comment 999');
  });
});

describe('clearIssueComments', () => {
  function mockRepoInfo() {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git remote get-url')) {
        return 'https://github.com/owner/repo.git';
      }
      return '[]';
    });
  }

  it('deletes all comments and returns correct summary', () => {
    const comments = [
      makeRestComment({ id: 1, body: 'Comment 1' }),
      makeRestComment({ id: 2, body: 'Comment 2' }),
    ];

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git remote get-url')) {
        return 'https://github.com/owner/repo.git';
      }
      if (typeof cmd === 'string' && cmd.includes('--paginate')) {
        return JSON.stringify(comments);
      }
      return '';
    });

    const result = clearIssueComments(10, false);

    expect(result).toEqual({ total: 2, deleted: 2, failed: 0 });
  });

  it('returns zeroes when no comments exist', () => {
    mockRepoInfo();

    const result = clearIssueComments(10, false);

    expect(result).toEqual({ total: 0, deleted: 0, failed: 0 });
  });

  it('handles partial failures and returns correct counts', () => {
    const comments = [
      makeRestComment({ id: 1, body: 'Comment 1' }),
      makeRestComment({ id: 2, body: 'Comment 2' }),
      makeRestComment({ id: 3, body: 'Comment 3' }),
    ];

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git remote get-url')) {
        return 'https://github.com/owner/repo.git';
      }
      if (typeof cmd === 'string' && cmd.includes('--paginate')) {
        return JSON.stringify(comments);
      }
      if (typeof cmd === 'string' && cmd.includes('DELETE') && cmd.includes('/2')) {
        throw new Error('Delete failed');
      }
      return '';
    });

    const result = clearIssueComments(10, false);

    expect(result).toEqual({ total: 3, deleted: 2, failed: 1 });
  });

  it('filters to ADW-only comments when adwOnly is true', () => {
    const comments = [
      makeRestComment({ id: 1, body: '## :rocket: ADW Workflow Started\n<!-- adw-bot -->' }),
      makeRestComment({ id: 2, body: 'Regular user comment' }),
      makeRestComment({ id: 3, body: '## :white_check_mark: Implementation Complete\n<!-- adw-bot -->' }),
    ];

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('git remote get-url')) {
        return 'https://github.com/owner/repo.git';
      }
      if (typeof cmd === 'string' && cmd.includes('--paginate')) {
        return JSON.stringify(comments);
      }
      return '';
    });

    const result = clearIssueComments(10, true);

    expect(result).toEqual({ total: 2, deleted: 2, failed: 0 });
  });
});
