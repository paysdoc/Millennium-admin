import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseAdwClassificationOutput,
  classifyWithAdwCommand,
  classifyIssueForTrigger,
  classifyGitHubIssue,
  getWorkflowScript,
} from '../triggers/issueClassifier';
import { adwCommandToIssueTypeMap, AdwSlashCommand, GitHubIssue } from '../core/dataTypes';

vi.mock('../core', () => ({
  log: vi.fn(),
  adwCommandToIssueTypeMap: {
    '/adw_plan': '/chore',
    '/adw_build': '/feature',
    '/adw_test': '/feature',
    '/adw_review': '/pr_review',
    '/adw_document': '/chore',
    '/adw_patch': '/bug',
    '/adw_plan_build': '/bug',
    '/adw_plan_build_test': '/feature',
    '/adw_plan_build_review': '/pr_review',
    '/adw_plan_build_document': '/chore',
    '/adw_plan_build_test_review': '/feature',
    '/adw_sdlc': '/feature',
  },
}));

vi.mock('../github/githubApi', () => ({
  fetchGitHubIssue: vi.fn(),
}));

vi.mock('../agents/claudeAgent', () => ({
  runClaudeAgentWithCommand: vi.fn(),
}));

import { fetchGitHubIssue } from '../github/githubApi';
import { runClaudeAgentWithCommand } from '../agents/claudeAgent';

function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 42,
    title: 'Test issue',
    body: 'Test body with /adw_plan_build_test',
    state: 'open',
    author: { login: 'test', isBot: false },
    assignees: [],
    labels: [],
    comments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    url: 'https://github.com/test/repo/issues/42',
    ...overrides,
  };
}

// ============================================================================
// parseAdwClassificationOutput
// ============================================================================

describe('parseAdwClassificationOutput', () => {
  it('returns parsed result for valid JSON with adw_slash_command', () => {
    const result = parseAdwClassificationOutput('{"adw_slash_command": "/adw_plan"}');

    expect(result).toEqual({ adw_slash_command: '/adw_plan' });
  });

  it('returns parsed result for JSON with both adw_slash_command and adw_id', () => {
    const result = parseAdwClassificationOutput(
      '{"adw_slash_command": "/adw_build", "adw_id": "abc12345"}'
    );

    expect(result).toEqual({ adw_slash_command: '/adw_build', adw_id: 'abc12345' });
  });

  it('returns null for empty JSON {}', () => {
    expect(parseAdwClassificationOutput('{}')).toBeNull();
  });

  it('returns null for invalid/malformed output', () => {
    expect(parseAdwClassificationOutput('not json at all')).toBeNull();
    expect(parseAdwClassificationOutput('')).toBeNull();
    expect(parseAdwClassificationOutput('  ')).toBeNull();
  });

  it('returns null for JSON with unknown ADW command', () => {
    const result = parseAdwClassificationOutput('{"adw_slash_command": "/adw_unknown"}');

    expect(result).toBeNull();
  });

  it('handles JSON embedded in surrounding text', () => {
    const output = 'Here is the result: {"adw_slash_command": "/adw_sdlc", "adw_id": "xyz98765"} That is the extracted info.';
    const result = parseAdwClassificationOutput(output);

    expect(result).toEqual({ adw_slash_command: '/adw_sdlc', adw_id: 'xyz98765' });
  });

  it('returns null when adw_slash_command is missing but adw_id is present', () => {
    const result = parseAdwClassificationOutput('{"adw_id": "abc12345"}');

    expect(result).toBeNull();
  });

  it('returns result with only adw_slash_command when adw_id is absent', () => {
    const result = parseAdwClassificationOutput('{"adw_slash_command": "/adw_patch"}');

    expect(result).toEqual({ adw_slash_command: '/adw_patch' });
  });
});

// ============================================================================
// classifyWithAdwCommand
// ============================================================================

describe('classifyWithAdwCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns classification result when ADW command is found', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      output: '{"adw_slash_command": "/adw_plan_build_test"}',
      success: true,
    });

    const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(result).toEqual({
      issueType: '/feature',
      success: true,
      adwCommand: '/adw_plan_build_test',
      adwId: undefined,
    });
  });

  it('returns classification with adwId when both command and ID are found', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      output: '{"adw_slash_command": "/adw_build", "adw_id": "abc12345"}',
      success: true,
    });

    const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(result).toEqual({
      issueType: '/feature',
      success: true,
      adwCommand: '/adw_build',
      adwId: 'abc12345',
    });
  });

  it('returns null when agent returns empty JSON', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      output: '{}',
      success: true,
    });

    const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(result).toBeNull();
  });

  it('returns null when agent call fails', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      output: '',
      success: false,
    });

    const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(result).toBeNull();
  });

  it('returns null when agent throws', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockRejectedValue(new Error('agent error'));

    const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(result).toBeNull();
  });

  it('maps each ADW command to the correct IssueClassSlashCommand', async () => {
    const entries = Object.entries(adwCommandToIssueTypeMap) as [AdwSlashCommand, string][];

    for (const [adwCommand, expectedIssueType] of entries) {
      vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
        output: JSON.stringify({ adw_slash_command: adwCommand }),
        success: true,
      });

      const result = await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

      expect(result?.issueType).toBe(expectedIssueType);
      expect(result?.adwCommand).toBe(adwCommand);
    }
  });

  it('calls runClaudeAgentWithCommand with haiku model', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValue({
      output: '{}',
      success: true,
    });

    await classifyWithAdwCommand('issue text', 42, '/tmp/output.jsonl');

    expect(runClaudeAgentWithCommand).toHaveBeenCalledWith(
      '/classify_adw',
      'issue text',
      'adw-classifier-42',
      '/tmp/output.jsonl',
      'haiku'
    );
  });
});

// ============================================================================
// classifyIssueForTrigger
// ============================================================================

describe('classifyIssueForTrigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchGitHubIssue).mockResolvedValue(createMockIssue());
  });

  it('uses ADW classification when /classify_adw finds a command', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValueOnce({
      output: '{"adw_slash_command": "/adw_plan_build_test"}',
      success: true,
    });

    const result = await classifyIssueForTrigger(42);

    expect(result.issueType).toBe('/feature');
    expect(result.adwCommand).toBe('/adw_plan_build_test');
    expect(result.success).toBe(true);
    // Should only call once (for /classify_adw), not twice
    expect(runClaudeAgentWithCommand).toHaveBeenCalledTimes(1);
  });

  it('falls back to /classify_issue when /classify_adw returns empty', async () => {
    vi.mocked(runClaudeAgentWithCommand)
      .mockResolvedValueOnce({ output: '{}', success: true })
      .mockResolvedValueOnce({ output: '/bug', success: true });

    const result = await classifyIssueForTrigger(42);

    expect(result.issueType).toBe('/bug');
    expect(result.adwCommand).toBeUndefined();
    expect(result.success).toBe(true);
    expect(runClaudeAgentWithCommand).toHaveBeenCalledTimes(2);
  });

  it('defaults to /feature when both classifiers fail', async () => {
    vi.mocked(runClaudeAgentWithCommand)
      .mockResolvedValueOnce({ output: '{}', success: true })
      .mockResolvedValueOnce({ output: 'unknown output', success: true });

    const result = await classifyIssueForTrigger(42);

    expect(result.issueType).toBe('/feature');
    expect(result.success).toBe(false);
  });

  it('defaults to /feature when fetchGitHubIssue throws', async () => {
    vi.mocked(fetchGitHubIssue).mockRejectedValue(new Error('API error'));

    const result = await classifyIssueForTrigger(42);

    expect(result.issueType).toBe('/feature');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// classifyGitHubIssue
// ============================================================================

describe('classifyGitHubIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses ADW classification when /classify_adw finds a command', async () => {
    vi.mocked(runClaudeAgentWithCommand).mockResolvedValueOnce({
      output: '{"adw_slash_command": "/adw_patch"}',
      success: true,
    });

    const result = await classifyGitHubIssue(createMockIssue());

    expect(result.issueType).toBe('/bug');
    expect(result.adwCommand).toBe('/adw_patch');
    expect(result.success).toBe(true);
    expect(runClaudeAgentWithCommand).toHaveBeenCalledTimes(1);
  });

  it('falls back to /classify_issue when /classify_adw returns empty', async () => {
    vi.mocked(runClaudeAgentWithCommand)
      .mockResolvedValueOnce({ output: '{}', success: true })
      .mockResolvedValueOnce({ output: '/chore', success: true });

    const result = await classifyGitHubIssue(createMockIssue());

    expect(result.issueType).toBe('/chore');
    expect(result.adwCommand).toBeUndefined();
    expect(result.success).toBe(true);
    expect(runClaudeAgentWithCommand).toHaveBeenCalledTimes(2);
  });

  it('defaults to /feature when both classifiers fail', async () => {
    vi.mocked(runClaudeAgentWithCommand)
      .mockResolvedValueOnce({ output: '{}', success: true })
      .mockResolvedValueOnce({ output: '', success: false });

    const result = await classifyGitHubIssue(createMockIssue());

    expect(result.issueType).toBe('/feature');
    expect(result.success).toBe(false);
  });

  it('includes labels in issue context for classification', async () => {
    vi.mocked(runClaudeAgentWithCommand)
      .mockResolvedValueOnce({ output: '{}', success: true })
      .mockResolvedValueOnce({ output: '/feature', success: true });

    const issue = createMockIssue({
      labels: [{ id: '1', name: 'enhancement', color: '00ff00' }],
    });

    await classifyGitHubIssue(issue);

    // The second call (classify_issue) should receive context with labels
    const secondCallArgs = vi.mocked(runClaudeAgentWithCommand).mock.calls[1];
    expect(secondCallArgs[1]).toContain('enhancement');
  });
});

// ============================================================================
// getWorkflowScript
// ============================================================================

describe('getWorkflowScript', () => {
  it('returns adwPlanBuildTest for /feature', () => {
    expect(getWorkflowScript('/feature')).toBe('adws/adwPlanBuildTest.tsx');
  });

  it('returns adwPlanBuildTest for /chore', () => {
    expect(getWorkflowScript('/chore')).toBe('adws/adwPlanBuildTest.tsx');
  });

  it('returns adwPlanBuild for /bug', () => {
    expect(getWorkflowScript('/bug')).toBe('adws/adwPlanBuild.tsx');
  });

  it('returns adwPlanBuild for /pr_review', () => {
    expect(getWorkflowScript('/pr_review')).toBe('adws/adwPlanBuild.tsx');
  });
});
