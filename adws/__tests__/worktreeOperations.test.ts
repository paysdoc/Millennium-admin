import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../core/utils', () => ({
  log: vi.fn(),
}));

vi.mock('../core/config', () => ({
  WORKTREES_DIR: '/mock/project/.worktrees',
}));

import { execSync } from 'child_process';
import * as fs from 'fs';
import {
  getWorktreePath,
  worktreeExists,
  listWorktrees,
  createWorktree,
  createWorktreeForNewBranch,
  removeWorktree,
  getWorktreeForBranch,
  ensureWorktree,
} from '../github/worktreeOperations';

describe('getWorktreePath', () => {
  it('returns correct path for simple branch name', () => {
    const result = getWorktreePath('main');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'main'));
  });

  it('sanitizes branch name with slashes', () => {
    const result = getWorktreePath('feature/issue-51-run-adw-workflow');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51-run-adw-workflow'));
  });

  it('sanitizes branch name with multiple special characters', () => {
    const result = getWorktreePath('bugfix/fix:bug*test?name');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'bugfix-fix-bug-test-name'));
  });
});

describe('worktreeExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when worktree exists', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

worktree /mock/project/.worktrees/feature-issue-51
HEAD def456
branch refs/heads/feature/issue-51

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = worktreeExists('feature/issue-51');
    expect(result).toBe(true);
  });

  it('returns false when worktree does not exist', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = worktreeExists('feature/issue-51');
    expect(result).toBe(false);
  });

  it('returns false when git command fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git error');
    });

    const result = worktreeExists('feature/issue-51');
    expect(result).toBe(false);
  });
});

describe('listWorktrees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of worktree paths', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

worktree /mock/project/.worktrees/feature-issue-51
HEAD def456
branch refs/heads/feature/issue-51

worktree /mock/project/.worktrees/bugfix-issue-52
HEAD ghi789
branch refs/heads/bugfix/issue-52

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = listWorktrees();
    expect(result).toEqual([
      '/mock/project/.worktrees/feature-issue-51',
      '/mock/project/.worktrees/bugfix-issue-52',
    ]);
  });

  it('returns empty array when no worktrees exist', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = listWorktrees();
    expect(result).toEqual([]);
  });

  it('returns empty array when git command fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git error');
    });

    const result = listWorktrees();
    expect(result).toEqual([]);
  });
});

describe('createWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates worktree for existing branch', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync)
      .mockReturnValueOnce('') // branch exists check
      .mockReturnValueOnce(''); // git worktree add

    const result = createWorktree('feature/issue-51');

    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree add'),
      { stdio: 'pipe' }
    );
  });

  it('creates worktree with new branch from base branch', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error('branch does not exist');
      })
      .mockImplementationOnce(() => {
        throw new Error('remote branch does not exist');
      })
      .mockReturnValueOnce(''); // git worktree add -b

    const result = createWorktree('feature/issue-51', 'main');

    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/project/.worktrees', { recursive: true });
  });

  it('throws error when branch does not exist and no base branch provided', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error('branch does not exist');
      })
      .mockImplementationOnce(() => {
        throw new Error('remote branch does not exist');
      });

    expect(() => createWorktree('nonexistent-branch')).toThrow(
      "Branch 'nonexistent-branch' does not exist and no base branch was provided"
    );
  });

  it('throws error when git worktree add fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync)
      .mockReturnValueOnce('') // branch exists
      .mockImplementationOnce(() => {
        throw new Error('worktree already exists');
      });

    expect(() => createWorktree('feature/issue-51')).toThrow(
      "Failed to create worktree for branch 'feature/issue-51'"
    );
  });
});

describe('createWorktreeForNewBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates worktree with new branch from HEAD', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue('');

    const result = createWorktreeForNewBranch('feature/issue-51');

    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('-b feature/issue-51'),
      { stdio: 'pipe' }
    );
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('HEAD'),
      { stdio: 'pipe' }
    );
  });

  it('creates worktree with new branch from specified base', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockReturnValue('');

    const result = createWorktreeForNewBranch('feature/issue-51', 'develop');

    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('develop'),
      { stdio: 'pipe' }
    );
  });

  it('creates worktrees directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(execSync).mockReturnValue('');

    createWorktreeForNewBranch('feature/issue-51');

    expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/project/.worktrees', { recursive: true });
  });

  it('throws error when git command fails', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('branch already exists');
    });

    expect(() => createWorktreeForNewBranch('feature/issue-51')).toThrow(
      "Failed to create worktree with new branch 'feature/issue-51'"
    );
  });
});

describe('removeWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes worktree successfully', () => {
    vi.mocked(execSync).mockReturnValue('');

    const result = removeWorktree('feature/issue-51');

    expect(result).toBe(true);
    expect(execSync).toHaveBeenCalledWith(
      expect.stringContaining('git worktree remove'),
      { stdio: 'pipe' }
    );
  });

  it('returns false when worktree does not exist', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not a valid worktree');
    });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = removeWorktree('nonexistent-branch');

    expect(result).toBe(false);
  });

  it('cleans up orphaned worktree directory', () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error('not a valid worktree');
      })
      .mockReturnValueOnce(''); // git worktree prune
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);

    const result = removeWorktree('orphaned-branch');

    expect(result).toBe(true);
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('orphaned-branch'),
      { recursive: true, force: true }
    );
  });
});

describe('getWorktreeForBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns worktree path when it exists', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

worktree /mock/project/.worktrees/feature-issue-51
HEAD def456
branch refs/heads/feature/issue-51

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = getWorktreeForBranch('feature/issue-51');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
  });

  it('returns null when worktree does not exist', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const result = getWorktreeForBranch('feature/issue-51');
    expect(result).toBeNull();
  });

  it('returns path for orphaned worktree directory', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);
    vi.mocked(fs.existsSync).mockReturnValue(true);

    const result = getWorktreeForBranch('orphaned-branch');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'orphaned-branch'));
  });

  it('returns null when git command fails', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('git error');
    });

    const result = getWorktreeForBranch('feature/issue-51');
    expect(result).toBeNull();
  });
});

describe('ensureWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing worktree path when it exists', () => {
    const worktreeListOutput = `worktree /mock/project
HEAD abc123
branch refs/heads/main

worktree /mock/project/.worktrees/feature-issue-51
HEAD def456
branch refs/heads/feature/issue-51

`;
    vi.mocked(execSync).mockReturnValue(worktreeListOutput);

    const result = ensureWorktree('feature/issue-51');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
  });

  it('creates new worktree when it does not exist', () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(`worktree /mock/project
HEAD abc123
branch refs/heads/main

`) // list worktrees
      .mockReturnValueOnce('') // branch exists check
      .mockReturnValueOnce(''); // git worktree add

    vi.mocked(fs.existsSync)
      .mockReturnValueOnce(false) // getWorktreeForBranch check
      .mockReturnValueOnce(true); // worktrees dir exists

    const result = ensureWorktree('feature/issue-51');
    expect(result).toBe(path.join('/mock/project/.worktrees', 'feature-issue-51'));
  });
});
