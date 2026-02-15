import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReviewWithRetry, ReviewRetryOptions } from '../agents/reviewRetry';
import { ReviewIssue } from '../agents/reviewAgent';

vi.mock('../agents/reviewAgent', () => ({
  runReviewAgent: vi.fn(),
}));

vi.mock('../agents/patchAgent', () => ({
  runPatchAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'patched',
    totalCostUsd: 0.5,
  }),
}));

vi.mock('../agents/gitAgent', () => ({
  runCommitAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'committed',
    commitMessage: 'review-agent: feat: patch review issues',
  }),
}));

vi.mock('../github', () => ({
  pushBranch: vi.fn(),
}));

vi.mock('../core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core')>();
  return {
    ...actual,
    log: vi.fn(),
    persistTokenCounts: vi.fn(),
    AgentStateManager: {
      readState: vi.fn().mockReturnValue({ adwId: 'adw-123' }),
      writeState: vi.fn(),
      appendLog: vi.fn(),
      initializeState: vi.fn().mockReturnValue('/mock/state'),
    },
  };
});

import { runReviewAgent } from '../agents/reviewAgent';
import { runPatchAgent } from '../agents/patchAgent';
import { runCommitAgent } from '../agents/gitAgent';
import { pushBranch } from '../github';

function createBlockerIssue(num: number): ReviewIssue {
  return {
    review_issue_number: num,
    screenshot_path: `/path/to/issue-${num}.png`,
    issue_description: `Blocker issue ${num}`,
    issue_resolution: `Fix issue ${num}`,
    issue_severity: 'blocker',
  };
}

function createOptions(overrides: Partial<ReviewRetryOptions> = {}): ReviewRetryOptions {
  return {
    adwId: 'adw-123',
    specFile: 'specs/issue-1-plan.md',
    logsDir: '/logs',
    orchestratorStatePath: '/state',
    maxRetries: 3,
    branchName: 'feat-issue-1-test',
    issueType: '/feature',
    issueContext: '{"number": 1}',
    ...overrides,
  };
}

describe('runReviewWithRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success when review passes on first attempt', async () => {
    vi.mocked(runReviewAgent).mockResolvedValue({
      success: true,
      output: '{}',
      totalCostUsd: 0.5,
      reviewResult: { success: true, review_summary: 'All good', review_issues: [], screenshots: [] },
      passed: true,
      blockerIssues: [],
    });

    const result = await runReviewWithRetry(createOptions());

    expect(result.passed).toBe(true);
    expect(result.totalRetries).toBe(0);
    expect(result.blockerIssues).toHaveLength(0);
    expect(runPatchAgent).not.toHaveBeenCalled();
    expect(runCommitAgent).not.toHaveBeenCalled();
    expect(pushBranch).not.toHaveBeenCalled();
  });

  it('patches blockers, commits, pushes, then passes on second attempt', async () => {
    const blocker = createBlockerIssue(1);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.5,
        reviewResult: null, passed: false,
        blockerIssues: [blocker],
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: { success: true, review_summary: 'Fixed', review_issues: [], screenshots: [] },
        passed: true, blockerIssues: [],
      });

    const result = await runReviewWithRetry(createOptions());

    expect(result.passed).toBe(true);
    expect(result.totalRetries).toBe(1);
    expect(runPatchAgent).toHaveBeenCalledTimes(1);
    expect(runCommitAgent).toHaveBeenCalledTimes(1);
    expect(pushBranch).toHaveBeenCalledTimes(1);
  });

  it('returns failure when max retries exceeded', async () => {
    const blocker = createBlockerIssue(1);
    vi.mocked(runReviewAgent).mockResolvedValue({
      success: true, output: '{}', totalCostUsd: 0.2,
      reviewResult: null, passed: false,
      blockerIssues: [blocker],
    });

    const result = await runReviewWithRetry(createOptions({ maxRetries: 2 }));

    expect(result.passed).toBe(false);
    expect(result.totalRetries).toBe(2);
    expect(result.blockerIssues).toHaveLength(1);
    expect(runReviewAgent).toHaveBeenCalledTimes(2);
    expect(runPatchAgent).toHaveBeenCalledTimes(2);
    expect(runCommitAgent).toHaveBeenCalledTimes(2);
    expect(pushBranch).toHaveBeenCalledTimes(2);
  });

  it('calls commit and push after each patch round (before next review)', async () => {
    const blocker = createBlockerIssue(1);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: null, passed: false, blockerIssues: [blocker],
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: null, passed: false, blockerIssues: [blocker],
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: { success: true, review_summary: 'Fixed', review_issues: [], screenshots: [] },
        passed: true, blockerIssues: [],
      });

    await runReviewWithRetry(createOptions({ maxRetries: 3 }));

    // Two rounds of patching before the third (passing) review
    expect(runCommitAgent).toHaveBeenCalledTimes(2);
    expect(pushBranch).toHaveBeenCalledTimes(2);
    expect(pushBranch).toHaveBeenCalledWith('feat-issue-1-test', undefined);
  });

  it('invokes onReviewFailed callback with correct attempt/maxAttempts', async () => {
    const onReviewFailed = vi.fn();
    const blocker = createBlockerIssue(1);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: null, passed: false, blockerIssues: [blocker],
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: { success: true, review_summary: 'Fixed', review_issues: [], screenshots: [] },
        passed: true, blockerIssues: [],
      });

    await runReviewWithRetry(createOptions({ onReviewFailed }));

    expect(onReviewFailed).toHaveBeenCalledWith(1, 3);
  });

  it('accumulates cost across review and patch agents', async () => {
    const blocker = createBlockerIssue(1);
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.5,
        reviewResult: null, passed: false, blockerIssues: [blocker],
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: { success: true, review_summary: 'Fixed', review_issues: [], screenshots: [] },
        passed: true, blockerIssues: [],
      });

    vi.mocked(runPatchAgent).mockResolvedValue({
      success: true,
      output: 'patched',
      totalCostUsd: 0.7,
    });

    const result = await runReviewWithRetry(createOptions());

    // 0.5 (first review) + 0.7 (patch) + 0.3 (second review) = 1.5
    expect(result.costUsd).toBe(1.5);
  });

  it('patches multiple blocker issues in a single round', async () => {
    const blockers = [createBlockerIssue(1), createBlockerIssue(2), createBlockerIssue(3)];
    vi.mocked(runReviewAgent)
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.5,
        reviewResult: null, passed: false, blockerIssues: blockers,
      })
      .mockResolvedValueOnce({
        success: true, output: '{}', totalCostUsd: 0.3,
        reviewResult: { success: true, review_summary: 'Fixed', review_issues: [], screenshots: [] },
        passed: true, blockerIssues: [],
      });

    await runReviewWithRetry(createOptions());

    expect(runPatchAgent).toHaveBeenCalledTimes(3);
  });
});
