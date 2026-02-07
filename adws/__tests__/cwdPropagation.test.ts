import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';

// Mock the child_process module
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock the config module
vi.mock('../core/config', () => ({
  CLAUDE_CODE_PATH: '/usr/local/bin/claude',
  AGENTS_STATE_DIR: '/tmp/test-agents',
}));

// Import after mocks are set up
import { spawn } from 'child_process';
import { runClaudeAgent, runClaudeAgentWithCommand } from '../agents/claudeAgent';
import { runTestAgent, runE2ETestAgent, runResolveTestAgent, runResolveE2ETestAgent } from '../agents/testAgent';
import { TestResult, E2ETestResult } from '../agents/testAgent';

// Generate a unique test directory
const uniqueTestDir = `/tmp/test-cwd-${Buffer.from(__dirname).toString('base64').replace(/[/+=]/g, '').slice(0, 16)}`;

describe('cwd propagation', () => {
  const testLogsDir = `${uniqueTestDir}/test-logs`;
  const customCwd = '/custom/working/directory';

  beforeEach(() => {
    vi.clearAllMocks();
    if (fs.existsSync(uniqueTestDir)) {
      fs.rmSync(uniqueTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogsDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(uniqueTestDir)) {
      fs.rmSync(uniqueTestDir, { recursive: true, force: true });
    }
  });

  describe('runClaudeAgent', () => {
    it('uses process.cwd() when cwd is not provided', async () => {
      const mockSpawn = createMockSpawn({ result: 'Success' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runClaudeAgent('test prompt', 'Test Agent', `${testLogsDir}/test.jsonl`);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('uses provided cwd when specified', async () => {
      const mockSpawn = createMockSpawn({ result: 'Success' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runClaudeAgent('test prompt', 'Test Agent', `${testLogsDir}/test.jsonl`, 'sonnet', undefined, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });

  describe('runClaudeAgentWithCommand', () => {
    it('uses process.cwd() when cwd is not provided', async () => {
      const mockSpawn = createMockSpawn({ result: 'Success' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runClaudeAgentWithCommand('/test', 'args', 'Test Agent', `${testLogsDir}/test.jsonl`);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('uses provided cwd when specified', async () => {
      const mockSpawn = createMockSpawn({ result: 'Success' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runClaudeAgentWithCommand('/test', 'args', 'Test Agent', `${testLogsDir}/test.jsonl`, 'sonnet', undefined, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });

  describe('runTestAgent', () => {
    it('passes cwd to spawn when provided', async () => {
      const testResults: TestResult[] = [
        { test_name: 'linting', passed: true, execution_command: 'npm run lint', test_purpose: 'Check linting' },
      ];
      const mockSpawn = createMockSpawn({ result: JSON.stringify(testResults) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runTestAgent(testLogsDir, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });

  describe('runE2ETestAgent', () => {
    it('passes cwd to spawn when provided', async () => {
      const e2eResult: E2ETestResult = {
        test_name: 'Login Test',
        status: 'passed',
        screenshots: [],
        error: null,
      };
      const mockSpawn = createMockSpawn({ result: JSON.stringify(e2eResult) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runE2ETestAgent('/path/to/test.md', testLogsDir, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });

  describe('runResolveTestAgent', () => {
    it('passes cwd to spawn when provided', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedTest: TestResult = {
        test_name: 'build',
        passed: false,
        execution_command: 'npm run build',
        test_purpose: 'Build app',
        error: 'Type error',
      };

      await runResolveTestAgent(failedTest, testLogsDir, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });

  describe('runResolveE2ETestAgent', () => {
    it('passes cwd to spawn when provided', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedE2ETest: E2ETestResult = {
        test_name: 'Login Test',
        status: 'failed',
        screenshots: [],
        error: 'Element not found',
      };

      await runResolveE2ETestAgent(failedE2ETest, testLogsDir, undefined, customCwd);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.any(Array),
        expect.objectContaining({
          cwd: customCwd,
        })
      );
    });
  });
});

/**
 * Creates a mock implementation of child_process.spawn that simulates
 * the Claude CLI output format.
 */
function createMockSpawn(options: { result: string; exitCode?: number }) {
  return () => {
    const { result, exitCode = 0 } = options;

    const mockStdout = {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          const jsonlOutput = JSON.stringify({
            type: 'result',
            subtype: 'success',
            isError: false,
            durationMs: 1000,
            durationApiMs: 900,
            numTurns: 1,
            result,
            sessionId: 'test-session-id',
            totalCostUsd: 0.01,
          });
          setTimeout(() => callback(Buffer.from(jsonlOutput + '\n')), 10);
        }
      }),
    };

    const mockStderr = {
      on: vi.fn(),
    };

    const mockProcess = {
      stdout: mockStdout,
      stderr: mockStderr,
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
      on: vi.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => callback(exitCode), 20);
        }
      }),
    };

    return mockProcess;
  };
}
