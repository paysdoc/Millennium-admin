import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runReviewAgent, ReviewIssue, ReviewResult } from '../agents/reviewAgent';
import { extractJson } from '../core/jsonParser';

vi.mock('../agents/claudeAgent', () => ({
  runClaudeAgentWithCommand: vi.fn().mockResolvedValue({
    success: true,
    output: 'mock-output',
    totalCostUsd: 0.5,
  }),
}));

vi.mock('../core', () => ({
  log: vi.fn(),
}));

import { runClaudeAgentWithCommand } from '../agents/claudeAgent';

function createReviewResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    success: true,
    review_summary: 'Implementation matches the spec.',
    review_issues: [],
    screenshots: ['/path/to/screenshot.png'],
    ...overrides,
  };
}

function createBlockerIssue(overrides: Partial<ReviewIssue> = {}): ReviewIssue {
  return {
    review_issue_number: 1,
    screenshot_path: '/path/to/issue.png',
    issue_description: 'Button color is wrong',
    issue_resolution: 'Change button color to blue',
    issue_severity: 'blocker',
    ...overrides,
  };
}

describe('extractJson (ReviewResult parsing)', () => {
  it('correctly parses valid JSON output', () => {
    const reviewResult = createReviewResult();
    const output = JSON.stringify(reviewResult);
    const result = extractJson<ReviewResult>(output);

    expect(result).toEqual(reviewResult);
  });

  it('handles malformed JSON gracefully (returns null)', () => {
    expect(extractJson<ReviewResult>('not json at all')).toBeNull();
    expect(extractJson<ReviewResult>('')).toBeNull();
    expect(extractJson<ReviewResult>('{ invalid json }')).toBeNull();
  });

  it('extracts JSON embedded in surrounding text', () => {
    const reviewResult = createReviewResult();
    const output = `Here is the result: ${JSON.stringify(reviewResult)} That was the output.`;
    const result = extractJson<ReviewResult>(output);

    expect(result).toEqual(reviewResult);
  });

  it('extracts JSON embedded in markdown code blocks', () => {
    const reviewResult = createReviewResult();
    const output = `\`\`\`json\n${JSON.stringify(reviewResult)}\n\`\`\``;
    const result = extractJson<ReviewResult>(output);

    expect(result).toEqual(reviewResult);
  });

  it('parses result with review issues', () => {
    const reviewResult = createReviewResult({
      success: false,
      review_issues: [
        createBlockerIssue(),
        { ...createBlockerIssue({ review_issue_number: 2, issue_severity: 'skippable' }) },
      ],
    });
    const result = extractJson<ReviewResult>(JSON.stringify(reviewResult));

    expect(result?.review_issues).toHaveLength(2);
    expect(result?.review_issues[0].issue_severity).toBe('blocker');
    expect(result?.review_issues[1].issue_severity).toBe('skippable');
  });
});

describe('runReviewAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runClaudeAgentWithCommand with /review, correct args, and opus model', async () => {
    const reviewResult = createReviewResult();
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      success: true,
      output: JSON.stringify(reviewResult),
      totalCostUsd: 0.5,
    });

    await runReviewAgent('adw-123', 'specs/issue-1-plan.md', '/logs');

    expect(runClaudeAgentWithCommand).toHaveBeenCalledWith(
      '/review',
      'adw-123\nspecs/issue-1-plan.md\nreview_agent',
      'Review',
      expect.stringContaining('review-agent.jsonl'),
      'opus',
      undefined,
      undefined,
      undefined
    );
  });

  it('correctly identifies blocker issues from review results', async () => {
    const reviewResult = createReviewResult({
      success: false,
      review_issues: [
        createBlockerIssue(),
        createBlockerIssue({ review_issue_number: 2, issue_severity: 'tech_debt' }),
        createBlockerIssue({ review_issue_number: 3, issue_severity: 'blocker' }),
      ],
    });
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      success: true,
      output: JSON.stringify(reviewResult),
      totalCostUsd: 0.5,
    });

    const result = await runReviewAgent('adw-123', 'specs/plan.md', '/logs');

    expect(result.blockerIssues).toHaveLength(2);
    expect(result.blockerIssues[0].review_issue_number).toBe(1);
    expect(result.blockerIssues[1].review_issue_number).toBe(3);
    expect(result.passed).toBe(false);
  });

  it('returns passed: true when no blockers exist (even with skippable/tech_debt issues)', async () => {
    const reviewResult = createReviewResult({
      success: true,
      review_issues: [
        createBlockerIssue({ review_issue_number: 1, issue_severity: 'skippable' }),
        createBlockerIssue({ review_issue_number: 2, issue_severity: 'tech_debt' }),
      ],
    });
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      success: true,
      output: JSON.stringify(reviewResult),
      totalCostUsd: 0.3,
    });

    const result = await runReviewAgent('adw-123', 'specs/plan.md', '/logs');

    expect(result.passed).toBe(true);
    expect(result.blockerIssues).toHaveLength(0);
  });

  it('returns passed: true when reviewResult is null (unparseable output)', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      success: true,
      output: 'not json',
      totalCostUsd: 0.1,
    });

    const result = await runReviewAgent('adw-123', 'specs/plan.md', '/logs');

    expect(result.reviewResult).toBeNull();
    expect(result.passed).toBe(true);
    expect(result.blockerIssues).toHaveLength(0);
  });

  it('passes statePath and cwd to runClaudeAgentWithCommand', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      success: true,
      output: JSON.stringify(createReviewResult()),
      totalCostUsd: 0.5,
    });

    await runReviewAgent('adw-123', 'specs/plan.md', '/logs', '/state/path', '/worktree');

    expect(runClaudeAgentWithCommand).toHaveBeenCalledWith(
      '/review',
      expect.any(String),
      'Review',
      expect.any(String),
      'opus',
      undefined,
      '/state/path',
      '/worktree'
    );
  });
});
