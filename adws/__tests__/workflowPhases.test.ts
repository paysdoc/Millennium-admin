import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  initializeWorkflow,
  executePlanPhase,
  executeBuildPhase,
  executePRPhase,
  completeWorkflow,
  handleWorkflowError,
  initializePRReviewWorkflow,
  executePRReviewPlanPhase,
  executePRReviewBuildPhase,
  executePRReviewTestPhase,
  completePRReviewWorkflow,
  handlePRReviewWorkflowError,
  type WorkflowConfig,
  type PRReviewWorkflowConfig,
} from '../workflowPhases';
import { RecoveryState, GitHubIssue, PRDetails, PRReviewComment } from '../core/dataTypes';
import { WorkflowContext, PRReviewWorkflowContext } from '../github/workflowComments';

vi.mock('fs');

vi.mock('../core', () => ({
  log: vi.fn(),
  ensureLogsDirectory: vi.fn().mockReturnValue('/mock/logs'),
  commitPrefixMap: {
    '/feature': 'feat:',
    '/bug': 'fix:',
    '/chore': 'chore:',
    '/pr_review': 'review:',
  },
  AgentStateManager: {
    writeState: vi.fn(),
    appendLog: vi.fn(),
    initializeState: vi.fn().mockReturnValue('/mock/state/path'),
    createExecutionState: vi.fn().mockReturnValue({ status: 'running', startedAt: '2024-01-01' }),
    completeExecution: vi.fn().mockReturnValue({ status: 'completed', startedAt: '2024-01-01' }),
  },
  shouldExecuteStage: vi.fn().mockReturnValue(true),
  hasUncommittedChanges: vi.fn().mockReturnValue(false),
  getNextStage: vi.fn().mockReturnValue('classified'),
  MAX_TEST_RETRY_ATTEMPTS: 5,
}));

vi.mock('../github', () => ({
  fetchGitHubIssue: vi.fn().mockResolvedValue({
    number: 1,
    title: 'Test issue',
    body: 'Test body',
    state: 'open',
    author: { login: 'test', isBot: false },
    assignees: [],
    labels: [],
    comments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    url: 'https://github.com/test/repo/issues/1',
  }),
  fetchPRDetails: vi.fn().mockReturnValue({
    number: 42,
    title: 'Test PR',
    body: 'Test PR body',
    state: 'OPEN',
    headBranch: 'feature/issue-10-test',
    baseBranch: 'main',
    url: 'https://github.com/test/repo/pull/42',
    issueNumber: 10,
    reviewComments: [],
  }),
  getUnaddressedComments: vi.fn().mockReturnValue([
    { id: 1, author: { login: 'reviewer', isBot: false }, body: 'Fix this', path: 'src/file.ts', line: 10, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ]),
  postWorkflowComment: vi.fn(),
  postPRWorkflowComment: vi.fn(),
  pushBranch: vi.fn(),
  createPullRequest: vi.fn().mockReturnValue('https://github.com/test/pr/1'),
  detectRecoveryState: vi.fn().mockReturnValue({
    lastCompletedStage: null,
    adwId: null,
    branchName: null,
    planPath: null,
    prUrl: null,
    canResume: false,
  }),
  getDefaultBranch: vi.fn().mockReturnValue('main'),
  ensureWorktree: vi.fn().mockReturnValue('/mock/worktree'),
  mergeLatestFromDefaultBranch: vi.fn(),
  copyEnvToWorktree: vi.fn(),
  inferIssueTypeFromBranch: vi.fn().mockReturnValue('/feature'),
  getMainRepoPath: vi.fn().mockReturnValue('/mock/main-repo'),
}));

vi.mock('../agents', () => ({
  runPlanAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'Plan created',
    totalCostUsd: 0.5,
  }),
  getPlanFilePath: vi.fn().mockReturnValue('/mock/plan.md'),
  planFileExists: vi.fn().mockReturnValue(false),
  runBuildAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'Build completed',
    totalCostUsd: 1.0,
  }),
  runPrReviewPlanAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'PR Review Plan created',
    totalCostUsd: 0.3,
  }),
  runPrReviewBuildAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'PR Review Build completed',
    totalCostUsd: 0.8,
  }),
  runGenerateBranchNameAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'feature/issue-1-test',
    branchName: 'feature/issue-1-test',
  }),
  runCommitAgent: vi.fn().mockResolvedValue({
    success: true,
    output: 'plan-orchestrator: feat: add implementation plan',
    commitMessage: 'plan-orchestrator: feat: add implementation plan',
  }),
  runUnitTestsWithRetry: vi.fn(),
  runE2ETestsWithRetry: vi.fn(),
}));

vi.mock('../triggers/issueClassifier', () => ({
  classifyGitHubIssue: vi.fn().mockResolvedValue({
    issueType: '/feature',
    success: true,
  }),
}));

// Import mocked modules for assertions
import { shouldExecuteStage, hasUncommittedChanges, getNextStage, AgentStateManager } from '../core';
import {
  fetchGitHubIssue,
  fetchPRDetails,
  getUnaddressedComments,
  postWorkflowComment,
  postPRWorkflowComment,
  pushBranch,
  createPullRequest,
  detectRecoveryState,
  ensureWorktree,
  mergeLatestFromDefaultBranch,
  inferIssueTypeFromBranch,
} from '../github';
import { runPlanAgent, getPlanFilePath, planFileExists, runBuildAgent, runPrReviewPlanAgent, runPrReviewBuildAgent, runGenerateBranchNameAgent, runCommitAgent, runUnitTestsWithRetry, runE2ETestsWithRetry } from '../agents';
import { classifyGitHubIssue } from '../triggers/issueClassifier';

function createRecoveryState(overrides: Partial<RecoveryState> = {}): RecoveryState {
  return {
    lastCompletedStage: null,
    adwId: null,
    branchName: null,
    planPath: null,
    prUrl: null,
    canResume: false,
    ...overrides,
  };
}

function createMockIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: 'Test issue',
    body: 'Test body',
    state: 'open',
    author: { login: 'test', isBot: false },
    assignees: [],
    labels: [],
    comments: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    url: 'https://github.com/test/repo/issues/1',
    ...overrides,
  };
}

function createWorkflowConfig(overrides: Partial<WorkflowConfig> = {}): WorkflowConfig {
  return {
    issueNumber: 1,
    adwId: 'test-adw-id',
    issue: createMockIssue(),
    issueType: '/feature',
    worktreePath: '/mock/worktree',
    defaultBranch: 'main',
    logsDir: '/mock/logs',
    orchestratorStatePath: '/mock/state/path',
    orchestratorName: 'plan-orchestrator',
    recoveryState: createRecoveryState(),
    ctx: { issueNumber: 1, adwId: 'test-adw-id' } as WorkflowContext,
    branchName: 'feature/issue-1-test',
    ...overrides,
  };
}

describe('initializeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses branch name agent and ensureWorktree when no cwd provided', async () => {
    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(runGenerateBranchNameAgent).toHaveBeenCalled();
    expect(ensureWorktree).toHaveBeenCalledWith('feature/issue-1-test');
    expect(config.worktreePath).toBe('/mock/worktree');
    expect(config.branchName).toBe('feature/issue-1-test');
  });

  it('uses provided cwd directly and merges latest changes', async () => {
    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator', {
      cwd: '/provided/path',
    });

    expect(mergeLatestFromDefaultBranch).toHaveBeenCalledWith('main', '/provided/path');
    expect(config.worktreePath).toBe('/provided/path');
    expect(ensureWorktree).not.toHaveBeenCalled();
  });

  it('skips classification when issueType is provided', async () => {
    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator', {
      issueType: '/bug',
    });

    expect(classifyGitHubIssue).not.toHaveBeenCalled();
    expect(config.issueType).toBe('/bug');
  });

  it('posts starting comment on fresh run', async () => {
    await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'starting', expect.objectContaining({
      issueNumber: 1,
      adwId: 'test-id',
    }));
  });

  it('restores context and posts resuming comment in recovery mode', async () => {
    vi.mocked(detectRecoveryState).mockReturnValue(createRecoveryState({
      canResume: true,
      lastCompletedStage: 'classified',
      branchName: 'feature/recovered',
      planPath: '/recovered/plan.md',
      prUrl: 'https://github.com/test/pr/1',
    }));

    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(config.ctx.branchName).toBe('feature/recovered');
    expect(config.ctx.planPath).toBe('/recovered/plan.md');
    expect(config.ctx.prUrl).toBe('https://github.com/test/pr/1');
    expect(getNextStage).toHaveBeenCalledWith('classified');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'resuming', expect.objectContaining({
      branchName: 'feature/recovered',
    }));
  });

  it('checks for uncommitted changes during recovery', async () => {
    vi.mocked(detectRecoveryState).mockReturnValue(createRecoveryState({
      canResume: true,
      lastCompletedStage: 'classified',
    }));

    await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(hasUncommittedChanges).toHaveBeenCalled();
  });
});

describe('executePlanPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldExecuteStage).mockReturnValue(true);
    vi.mocked(planFileExists).mockReturnValue(false);
  });

  it('executes all plan stages and returns cost', async () => {
    const config = createWorkflowConfig();

    const result = await executePlanPhase(config);

    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'classified', expect.anything());
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'branch_created', expect.anything());
    expect(runPlanAgent).toHaveBeenCalled();
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'plan_created', expect.anything());
    expect(result.costUsd).toBe(0.5);
  });

  it('skips stages when already completed in recovery', async () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(false);
    const config = createWorkflowConfig({
      recoveryState: createRecoveryState({
        canResume: true,
        lastCompletedStage: 'plan_committing',
      }),
    });

    const result = await executePlanPhase(config);

    expect(runPlanAgent).not.toHaveBeenCalled();
    expect(result.costUsd).toBe(0);
  });

  it('throws when plan agent fails', async () => {
    vi.mocked(runPlanAgent).mockResolvedValue({
      success: false,
      output: 'Agent error',
      totalCostUsd: 0,
    });
    const config = createWorkflowConfig();

    await expect(executePlanPhase(config)).rejects.toThrow('Plan Agent failed');
  });
});

describe('executeBuildPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(shouldExecuteStage).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Plan content');
  });

  it('reads plan content and runs build agent', async () => {
    const config = createWorkflowConfig();

    const result = await executeBuildPhase(config);

    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/plan.md', 'utf-8');
    expect(runBuildAgent).toHaveBeenCalled();
    expect(result.costUsd).toBe(1.0);
  });

  it('throws when plan file is missing', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    const config = createWorkflowConfig();

    await expect(executeBuildPhase(config)).rejects.toThrow('Cannot read plan file');
  });

  it('throws when build agent fails', async () => {
    vi.mocked(runBuildAgent).mockResolvedValue({
      success: false,
      output: 'Build error',
      totalCostUsd: 0,
    });
    const config = createWorkflowConfig();

    await expect(executeBuildPhase(config)).rejects.toThrow('Build Agent failed');
  });
});

describe('executePRPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates PR when stage should execute', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(true);
    const config = createWorkflowConfig();

    executePRPhase(config);

    expect(createPullRequest).toHaveBeenCalledWith(
      config.issue, '', '', 'main', '/mock/worktree'
    );
    expect(config.ctx.prUrl).toBe('https://github.com/test/pr/1');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'pr_created', expect.anything());
  });

  it('skips PR when already completed', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(false);
    const config = createWorkflowConfig();

    executePRPhase(config);

    expect(createPullRequest).not.toHaveBeenCalled();
  });
});

describe('completeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes completion state with metadata and posts completed comment', () => {
    const config = createWorkflowConfig();

    completeWorkflow(config, 1.5);

    expect(AgentStateManager.writeState).toHaveBeenCalledWith('/mock/state/path', {
      execution: expect.objectContaining({ status: 'completed' }),
      metadata: { totalCostUsd: 1.5 },
    });
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      'Workflow completed successfully'
    );
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'completed', config.ctx);
  });

  it('includes additional metadata when provided', () => {
    const config = createWorkflowConfig();

    completeWorkflow(config, 2.0, { unitTestsPassed: true });

    expect(AgentStateManager.writeState).toHaveBeenCalledWith('/mock/state/path', {
      execution: expect.objectContaining({ status: 'completed' }),
      metadata: { totalCostUsd: 2.0, unitTestsPassed: true },
    });
  });
});

describe('handleWorkflowError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts error comment, updates failure state, and exits with code 1', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const config = createWorkflowConfig();

    handleWorkflowError(config, new Error('test error'));

    expect(config.ctx.errorMessage).toBe('Error: test error');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'error', config.ctx);
    expect(AgentStateManager.writeState).toHaveBeenCalled();
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      expect.stringContaining('plan-orchestrator workflow failed')
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});

// ============================================================================
// PR Review Workflow Phase Tests
// ============================================================================

function createMockPRDetails(overrides: Partial<PRDetails> = {}): PRDetails {
  return {
    number: 42,
    title: 'Test PR',
    body: 'Test PR body',
    state: 'OPEN',
    headBranch: 'feature/issue-10-test',
    baseBranch: 'main',
    url: 'https://github.com/test/repo/pull/42',
    issueNumber: 10,
    reviewComments: [],
    ...overrides,
  };
}

function createMockPRReviewComments(): PRReviewComment[] {
  return [
    { id: 1, author: { login: 'reviewer', isBot: false }, body: 'Fix this', path: 'src/file.ts', line: 10, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
  ];
}

function createPRReviewWorkflowConfig(overrides: Partial<PRReviewWorkflowConfig> = {}): PRReviewWorkflowConfig {
  return {
    prNumber: 42,
    issueNumber: 10,
    adwId: 'test-adw-id',
    prDetails: createMockPRDetails(),
    unaddressedComments: createMockPRReviewComments(),
    worktreePath: '/mock/worktree',
    logsDir: '/mock/logs',
    orchestratorStatePath: '/mock/state/path',
    ctx: {
      issueNumber: 10,
      adwId: 'test-adw-id',
      prNumber: 42,
      reviewComments: 1,
      branchName: 'feature/issue-10-test',
    } as PRReviewWorkflowContext,
    ...overrides,
  };
}

describe('initializePRReviewWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchPRDetails).mockReturnValue(createMockPRDetails());
    vi.mocked(getUnaddressedComments).mockReturnValue(createMockPRReviewComments());
  });

  it('fetches PR details and returns config', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const config = initializePRReviewWorkflow(42, 'test-adw-id');

    expect(fetchPRDetails).toHaveBeenCalledWith(42);
    expect(config.prNumber).toBe(42);
    expect(config.adwId).toBe('test-adw-id');
    expect(config.prDetails.title).toBe('Test PR');

    mockExit.mockRestore();
  });

  it('exits when PR is closed', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(fetchPRDetails).mockReturnValue(createMockPRDetails({ state: 'CLOSED' }));

    initializePRReviewWorkflow(42, 'test-adw-id');

    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('exits when PR is merged', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(fetchPRDetails).mockReturnValue(createMockPRDetails({ state: 'MERGED' }));

    initializePRReviewWorkflow(42, 'test-adw-id');

    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('exits when no unaddressed comments', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(getUnaddressedComments).mockReturnValue([]);

    initializePRReviewWorkflow(42, 'test-adw-id');

    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it('sets up worktree via ensureWorktree with head branch', () => {
    const config = initializePRReviewWorkflow(42, 'test-adw-id');

    expect(ensureWorktree).toHaveBeenCalledWith('feature/issue-10-test');
    expect(config.worktreePath).toBe('/mock/worktree');
  });

  it('initializes orchestrator state with correct metadata', () => {
    initializePRReviewWorkflow(42, 'test-adw-id');

    expect(AgentStateManager.initializeState).toHaveBeenCalledWith('test-adw-id', 'pr-review-orchestrator');
    expect(AgentStateManager.writeState).toHaveBeenCalledWith(
      '/mock/state/path',
      expect.objectContaining({
        agentName: 'pr-review-orchestrator',
        metadata: { prNumber: 42, reviewComments: 1 },
      })
    );
  });

  it('posts pr_review_starting comment', () => {
    initializePRReviewWorkflow(42, 'test-adw-id');

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_starting', expect.objectContaining({
      prNumber: 42,
      reviewComments: 1,
    }));
  });
});

describe('executePRReviewPlanPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPrReviewPlanAgent).mockResolvedValue({
      success: true,
      output: 'PR Review Plan created',
      totalCostUsd: 0.3,
    });
  });

  it('reads existing plan content from file when available', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('# Existing plan');
    const config = createPRReviewWorkflowConfig();

    const result = await executePRReviewPlanPhase(config);

    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/plan.md', 'utf-8');
    expect(runPrReviewPlanAgent).toHaveBeenCalledWith(
      config.prDetails,
      config.unaddressedComments,
      '# Existing plan',
      '/mock/logs',
      '/mock/state/path',
      '/mock/worktree'
    );
    expect(result.planOutput).toBe('PR Review Plan created');
  });

  it('falls back to PR body when no plan file exists', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewPlanPhase(config);

    expect(runPrReviewPlanAgent).toHaveBeenCalledWith(
      config.prDetails,
      config.unaddressedComments,
      'Test PR body',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('uses PR body when no issue number', async () => {
    const config = createPRReviewWorkflowConfig({
      issueNumber: 0,
      prDetails: createMockPRDetails({ issueNumber: null }),
    });

    await executePRReviewPlanPhase(config);

    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(runPrReviewPlanAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'Test PR body',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('throws when plan agent fails', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('# Plan');
    vi.mocked(runPrReviewPlanAgent).mockResolvedValue({
      success: false,
      output: 'Agent error',
      totalCostUsd: 0,
    });
    const config = createPRReviewWorkflowConfig();

    await expect(executePRReviewPlanPhase(config)).rejects.toThrow('PR Review Plan Agent failed');
  });

  it('posts planning and planned comments', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('# Plan');
    const config = createPRReviewWorkflowConfig();

    await executePRReviewPlanPhase(config);

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_planning', expect.anything());
    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_planned', expect.anything());
  });
});

describe('executePRReviewBuildPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runPrReviewBuildAgent).mockResolvedValue({
      success: true,
      output: 'PR Review Build completed',
      totalCostUsd: 0.8,
    });
  });

  it('calls runPrReviewBuildAgent with plan output', async () => {
    const config = createPRReviewWorkflowConfig();

    await executePRReviewBuildPhase(config, 'Revision plan output');

    expect(runPrReviewBuildAgent).toHaveBeenCalledWith(
      config.prDetails,
      'Revision plan output',
      '/mock/logs',
      expect.any(Function),
      '/mock/state/path',
      '/mock/worktree'
    );
  });

  it('throws when build agent fails', async () => {
    vi.mocked(runPrReviewBuildAgent).mockResolvedValue({
      success: false,
      output: 'Build error',
      totalCostUsd: 0,
    });
    const config = createPRReviewWorkflowConfig();

    await expect(executePRReviewBuildPhase(config, 'plan')).rejects.toThrow('PR Review Build Agent failed');
  });

  it('posts implementing and implemented comments', async () => {
    const config = createPRReviewWorkflowConfig();

    await executePRReviewBuildPhase(config, 'plan');

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_implementing', expect.anything());
    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_implemented', expect.anything());
  });
});

describe('executePRReviewTestPhase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls both unit and E2E test retry functions', async () => {
    vi.mocked(runUnitTestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    vi.mocked(runE2ETestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewTestPhase(config);

    expect(runUnitTestsWithRetry).toHaveBeenCalledWith(expect.objectContaining({
      logsDir: '/mock/logs',
      cwd: '/mock/worktree',
    }));
    expect(runE2ETestsWithRetry).toHaveBeenCalledWith(expect.objectContaining({
      logsDir: '/mock/logs',
      cwd: '/mock/worktree',
    }));
  });

  it('posts test_passed comment on success', async () => {
    vi.mocked(runUnitTestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    vi.mocked(runE2ETestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewTestPhase(config);

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_test_passed', expect.anything());
  });

  it('posts onTestFailed callback with correct PR comment', async () => {
    let capturedCallback: ((attempt: number, maxAttempts: number) => void) | undefined;
    vi.mocked(runUnitTestsWithRetry).mockImplementation(async (opts) => {
      capturedCallback = opts.onTestFailed;
      return { passed: true, failedTests: [], totalRetries: 0, costUsd: 0 };
    });
    vi.mocked(runE2ETestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewTestPhase(config);
    capturedCallback?.(2, 5);

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_test_failed', expect.objectContaining({
      testAttempt: 2,
      maxTestAttempts: 5,
    }));
  });

  it('exits with code 1 on unit test max retry failure', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(runUnitTestsWithRetry).mockResolvedValue({ passed: false, failedTests: ['test1.ts'], totalRetries: 5, costUsd: 0 });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewTestPhase(config);

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_test_max_attempts', expect.anything());
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });

  it('exits with code 1 on E2E test max retry failure', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.mocked(runUnitTestsWithRetry).mockResolvedValue({ passed: true, failedTests: [], totalRetries: 0, costUsd: 0 });
    vi.mocked(runE2ETestsWithRetry).mockResolvedValue({ passed: false, failedTests: ['e2e-test1.ts'], totalRetries: 5, costUsd: 0 });
    const config = createPRReviewWorkflowConfig();

    await executePRReviewTestPhase(config);

    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_test_max_attempts', expect.anything());
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});

describe('completePRReviewWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runCommitAgent with inferred issue type', async () => {
    vi.mocked(inferIssueTypeFromBranch).mockReturnValue('/feature');
    const config = createPRReviewWorkflowConfig();

    await completePRReviewWorkflow(config);

    expect(inferIssueTypeFromBranch).toHaveBeenCalledWith('feature/issue-10-test');
    expect(runCommitAgent).toHaveBeenCalledWith(
      'pr-review-orchestrator',
      '/feature',
      expect.any(String),
      '/mock/logs',
      undefined,
      '/mock/worktree'
    );
  });

  it('pushes branch and posts completion comments', async () => {
    const config = createPRReviewWorkflowConfig();

    await completePRReviewWorkflow(config);

    expect(pushBranch).toHaveBeenCalledWith('feature/issue-10-test', '/mock/worktree');
    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_pushed', expect.anything());
    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_completed', expect.anything());
  });

  it('writes successful execution state', async () => {
    const config = createPRReviewWorkflowConfig();

    await completePRReviewWorkflow(config);

    expect(AgentStateManager.writeState).toHaveBeenCalledWith('/mock/state/path', {
      execution: expect.objectContaining({ status: 'completed' }),
    });
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      'PR Review workflow completed successfully'
    );
  });
});

describe('handlePRReviewWorkflowError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts error comment and exits with code 1', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const config = createPRReviewWorkflowConfig();

    handlePRReviewWorkflowError(config, new Error('test error'));

    expect(config.ctx.errorMessage).toBe('Error: test error');
    expect(postPRWorkflowComment).toHaveBeenCalledWith(42, 'pr_review_error', config.ctx);
    expect(AgentStateManager.writeState).toHaveBeenCalled();
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      expect.stringContaining('PR Review workflow failed')
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});
