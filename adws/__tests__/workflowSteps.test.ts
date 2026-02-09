import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import {
  setupWorktreeWithLatestCode,
  handleRecoveryMode,
  executeClassifyStep,
  executeCreateBranchStep,
  readPlanContent,
  handleWorkflowError,
  completeWorkflow,
  WorkflowParams,
} from '../core/workflowSteps';
import { RecoveryState, GitHubIssue } from '../core/dataTypes';
import { WorkflowContext } from '../github/workflowCommentsIssue';

vi.mock('fs');
vi.mock('../core/orchestratorLib', () => ({
  shouldExecuteStage: vi.fn().mockReturnValue(true),
  hasUncommittedChanges: vi.fn().mockReturnValue(false),
  getNextStage: vi.fn().mockReturnValue('classified'),
}));
vi.mock('../core/index', () => ({
  log: vi.fn(),
  AgentStateManager: {
    writeState: vi.fn(),
    appendLog: vi.fn(),
    initializeState: vi.fn().mockReturnValue('/mock/state/path'),
    createExecutionState: vi.fn().mockReturnValue({ status: 'running', startedAt: '2024-01-01' }),
    completeExecution: vi.fn().mockReturnValue({ status: 'completed', startedAt: '2024-01-01' }),
  },
}));

vi.mock('../github', () => ({
  postWorkflowComment: vi.fn(),
  createFeatureBranch: vi.fn().mockReturnValue('feature/issue-1-test'),
  commitChanges: vi.fn(),
  createPullRequest: vi.fn().mockReturnValue('https://github.com/test/pr/1'),
  getWorktreeForBranch: vi.fn(),
  ensureWorktree: vi.fn().mockReturnValue('/mock/worktree'),
  checkoutDefaultBranch: vi.fn(),
  copyEnvToWorktree: vi.fn(),
  mergeLatestFromDefaultBranch: vi.fn(),
}));

vi.mock('../agents', () => ({
  runPlanAgent: vi.fn(),
  getPlanFilePath: vi.fn().mockReturnValue('/mock/plan.md'),
  planFileExists: vi.fn().mockReturnValue(false),
  runBuildAgent: vi.fn(),
}));

// Import mocked modules for assertions
import { shouldExecuteStage, hasUncommittedChanges, getNextStage } from '../core/orchestratorLib';
import { AgentStateManager } from '../core/index';
import {
  postWorkflowComment,
  createFeatureBranch,
  getWorktreeForBranch,
  ensureWorktree,
  checkoutDefaultBranch,
  copyEnvToWorktree,
  mergeLatestFromDefaultBranch,
} from '../github';

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

function createWorkflowParams(overrides: Partial<WorkflowParams> = {}): WorkflowParams {
  return {
    issueNumber: 1,
    adwId: 'test-adw-id',
    issue: createMockIssue(),
    issueType: '/feature',
    recoveryState: createRecoveryState(),
    orchestratorStatePath: '/mock/state/path',
    orchestratorName: 'plan-orchestrator',
    ctx: { issueNumber: 1, adwId: 'test-adw-id' } as WorkflowContext,
    workingDir: '/mock/worktree',
    logsDir: '/mock/logs',
    ...overrides,
  };
}

describe('setupWorktreeWithLatestCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates new worktree when none exists, calling checkoutDefaultBranch first', () => {
    vi.mocked(getWorktreeForBranch).mockReturnValue(null);

    const result = setupWorktreeWithLatestCode('feature/test', 'main');

    expect(checkoutDefaultBranch).toHaveBeenCalled();
    expect(ensureWorktree).toHaveBeenCalledWith('feature/test', 'main');
    expect(result).toBe('/mock/worktree');
  });

  it('reuses existing worktree and merges latest from default branch', () => {
    vi.mocked(getWorktreeForBranch).mockReturnValue('/existing/worktree');

    const result = setupWorktreeWithLatestCode('feature/test', 'main');

    expect(checkoutDefaultBranch).not.toHaveBeenCalled();
    expect(ensureWorktree).not.toHaveBeenCalled();
    expect(mergeLatestFromDefaultBranch).toHaveBeenCalledWith('main', '/existing/worktree');
    expect(copyEnvToWorktree).toHaveBeenCalledWith('/existing/worktree');
    expect(result).toBe('/existing/worktree');
  });
});

describe('handleRecoveryMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts starting comment when recovery is not possible', () => {
    const params = createWorkflowParams({
      recoveryState: createRecoveryState({ canResume: false }),
    });

    handleRecoveryMode(params);

    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'starting', params.ctx);
  });

  it('restores context and posts resuming comment when recovery is possible', () => {
    const recoveryState = createRecoveryState({
      canResume: true,
      lastCompletedStage: 'classified',
      branchName: 'feature/recovered',
      planPath: '/recovered/plan.md',
      prUrl: 'https://github.com/test/pr/1',
    });
    const params = createWorkflowParams({ recoveryState });

    handleRecoveryMode(params);

    expect(params.ctx.branchName).toBe('feature/recovered');
    expect(params.ctx.planPath).toBe('/recovered/plan.md');
    expect(params.ctx.prUrl).toBe('https://github.com/test/pr/1');
    expect(getNextStage).toHaveBeenCalledWith('classified');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'resuming', params.ctx);
  });

  it('checks for uncommitted changes during recovery', () => {
    vi.mocked(hasUncommittedChanges).mockReturnValue(true);
    const params = createWorkflowParams({
      recoveryState: createRecoveryState({
        canResume: true,
        lastCompletedStage: 'classified',
      }),
    });

    handleRecoveryMode(params);

    expect(hasUncommittedChanges).toHaveBeenCalledWith('/mock/worktree');
  });
});

describe('executeClassifyStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes state and posts comment when stage should execute', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(true);
    const params = createWorkflowParams();

    executeClassifyStep(params);

    expect(AgentStateManager.writeState).toHaveBeenCalledWith('/mock/state/path', { issueClass: '/feature' });
    expect(AgentStateManager.appendLog).toHaveBeenCalled();
    expect(params.ctx.issueType).toBe('/feature');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'classified', params.ctx);
  });

  it('does nothing when stage should be skipped', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(false);
    const params = createWorkflowParams();

    executeClassifyStep(params);

    expect(AgentStateManager.writeState).not.toHaveBeenCalled();
    expect(postWorkflowComment).not.toHaveBeenCalled();
  });
});

describe('executeCreateBranchStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates branch and posts comment when stage should execute', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(true);
    const params = createWorkflowParams();

    const result = executeCreateBranchStep(params);

    expect(createFeatureBranch).toHaveBeenCalledWith(1, 'Test issue', '/feature', '/mock/worktree');
    expect(result).toBe('feature/issue-1-test');
    expect(params.ctx.branchName).toBe('feature/issue-1-test');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'branch_created', params.ctx);
  });

  it('re-creates branch when skipped but recovery has branch name', () => {
    vi.mocked(shouldExecuteStage).mockReturnValue(false);
    const params = createWorkflowParams({
      recoveryState: createRecoveryState({ branchName: 'feature/recovered' }),
    });

    const result = executeCreateBranchStep(params);

    expect(createFeatureBranch).toHaveBeenCalled();
    expect(result).toBe('feature/issue-1-test');
  });
});

describe('readPlanContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file content on success', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('# Plan content');

    const result = readPlanContent('/mock/plan.md');

    expect(result).toBe('# Plan content');
  });

  it('throws descriptive error when file does not exist', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });

    expect(() => readPlanContent('/nonexistent/plan.md')).toThrow('Cannot read plan file at /nonexistent/plan.md');
  });
});

describe('handleWorkflowError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts error comment, updates failure state, and exits with code 1', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const ctx: WorkflowContext = { issueNumber: 1, adwId: 'test' };

    handleWorkflowError(
      new Error('test error'),
      '/mock/state/path',
      ctx,
      1,
      'Test workflow'
    );

    expect(ctx.errorMessage).toBe('Error: test error');
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'error', ctx);
    expect(AgentStateManager.writeState).toHaveBeenCalled();
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      expect.stringContaining('Test workflow failed')
    );
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
  });
});

describe('completeWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes completion state with metadata and posts completed comment', () => {
    const ctx: WorkflowContext = { issueNumber: 1, adwId: 'test' };

    completeWorkflow('/mock/state/path', ctx, 1, { totalCostUsd: 0.5 });

    expect(AgentStateManager.writeState).toHaveBeenCalledWith('/mock/state/path', {
      execution: expect.objectContaining({ status: 'completed' }),
      metadata: { totalCostUsd: 0.5 },
    });
    expect(AgentStateManager.appendLog).toHaveBeenCalledWith(
      '/mock/state/path',
      'Workflow completed successfully'
    );
    expect(postWorkflowComment).toHaveBeenCalledWith(1, 'completed', ctx);
  });
});
