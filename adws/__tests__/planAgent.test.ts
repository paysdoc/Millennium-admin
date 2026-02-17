import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { getPlanFilePath, planFileExists } from '../agents/planAgent';

vi.mock('fs');

describe('getPlanFilePath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns new-convention file when it exists in specs directory', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-42-adw-abc123-sdlc_planner-fix-login.md',
      'other-file.md',
    ] as unknown as fs.Dirent[]);

    const result = getPlanFilePath(42);

    expect(result).toBe('specs/issue-42-adw-abc123-sdlc_planner-fix-login.md');
  });

  it('returns legacy file when only legacy exists', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-42-plan.md',
      'other-file.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, size: 100 } as fs.Stats);

    const result = getPlanFilePath(42);

    expect(result).toBe('specs/issue-42-plan.md');
  });

  it('returns legacy fallback path when no matching file exists', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-99-adw-xyz-sdlc_planner-other.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = getPlanFilePath(42);

    expect(result).toBe('specs/issue-42-plan.md');
  });

  it('returns legacy fallback when specs directory does not exist', () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = getPlanFilePath(42);

    expect(result).toBe('specs/issue-42-plan.md');
  });

  it('searches within worktreePath when provided', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-10-adw-def456-sdlc_planner-add-feature.md',
    ] as unknown as fs.Dirent[]);

    const result = getPlanFilePath(10, '/my/worktree');

    expect(fs.readdirSync).toHaveBeenCalledWith('/my/worktree/specs');
    expect(result).toBe('specs/issue-10-adw-def456-sdlc_planner-add-feature.md');
  });

  it('checks legacy file with worktreePath prefix', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'unrelated-file.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, size: 50 } as fs.Stats);

    const result = getPlanFilePath(10, '/my/worktree');

    expect(fs.statSync).toHaveBeenCalledWith('/my/worktree/specs/issue-10-plan.md');
    expect(result).toBe('specs/issue-10-plan.md');
  });
});

describe('planFileExists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when new-convention file exists and has content', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-5-adw-abc-sdlc_planner-my-plan.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, size: 200 } as fs.Stats);

    expect(planFileExists(5)).toBe(true);
  });

  it('returns true when legacy file exists and has content', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockImplementation((filePath) => {
      if (String(filePath) === 'specs/issue-5-plan.md') {
        return { isFile: () => true, size: 100 } as fs.Stats;
      }
      throw new Error('ENOENT');
    });

    // readdirSync returns empty, so findPlanFile's legacy check via statSync is called
    // But the first statSync call in findPlanFile for the legacy path also returns stats
    expect(planFileExists(5)).toBe(true);
  });

  it('returns false when no file exists', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(planFileExists(5)).toBe(false);
  });

  it('returns false when file exists but is empty', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-5-adw-abc-sdlc_planner-my-plan.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, size: 0 } as fs.Stats);

    expect(planFileExists(5)).toBe(false);
  });

  it('uses worktreePath for full path resolution', () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      'issue-7-adw-xyz-sdlc_planner-task.md',
    ] as unknown as fs.Dirent[]);
    vi.mocked(fs.statSync).mockReturnValue({ isFile: () => true, size: 300 } as fs.Stats);

    expect(planFileExists(7, '/worktree/path')).toBe(true);
    expect(fs.statSync).toHaveBeenCalledWith(
      '/worktree/path/specs/issue-7-adw-xyz-sdlc_planner-task.md'
    );
  });
});
