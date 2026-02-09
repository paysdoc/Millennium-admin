import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  initializeWorkflow,
  executePlanPhase,
  executeBuildPhase,
  executePRPhase,
  completeWorkflow,
  handleWorkflowError,
  type WorkflowConfig,
} from '../workflowPhases';
import { RecoveryState, GitHubIssue } from '../core/dataTypes';
import { WorkflowContext } from '../github/workflowCommentsIssue';

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
  postWorkflowComment: vi.fn(),
  createFeatureBranch: vi.fn().mockReturnValue('feature/issue-1-test'),
  commitChanges: vi.fn(),
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
  generateBranchName: vi.fn().mockReturnValue('feature/issue-1-test'),
  ensureWorktree: vi.fn().mockReturnValue('/mock/worktree'),
  getWorktreeForBranch: vi.fn().mockReturnValue(null),
  checkoutDefaultBranch: vi.fn(),
  mergeLatestFromDefaultBranch: vi.fn(),
  copyEnvToWorktree: vi.fn(),
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
  postWorkflowComment,
  createFeatureBranch,
  createPullRequest,
  detectRecoveryState,
  getWorktreeForBranch,
  ensureWorktree,
  checkoutDefaultBranch,
  mergeLatestFromDefaultBranch,
} from '../github';
import { runPlanAgent, getPlanFilePath, planFileExists, runBuildAgent } from '../agents';
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
    ...overrides,
  };
}

describe('initializeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls checkoutDefaultBranch before ensureWorktree when worktree does not exist', async () => {
    vi.mocked(getWorktreeForBranch).mockReturnValue(null);

    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(checkoutDefaultBranch).toHaveBeenCalled();
    expect(ensureWorktree).toHaveBeenCalledWith('feature/issue-1-test', 'main');
    expect(config.worktreePath).toBe('/mock/worktree');
  });

  it('merges latest from default branch when worktree already exists', async () => {
    vi.mocked(getWorktreeForBranch).mockReturnValue('/existing/worktree');

    const config = await initializeWorkflow(1, 'test-id', 'plan-orchestrator');

    expect(checkoutDefaultBranch).not.toHaveBeenCalled();
    expect(mergeLatestFromDefaultBranch).toHaveBeenCalledWith('main', '/existing/worktree');
    expect(config.worktreePath).toBe('/existing/worktree');
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
    expect(createFeatureBranch).toHaveBeenCalled();
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
