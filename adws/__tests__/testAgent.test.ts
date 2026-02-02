import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

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
import {
  discoverE2ETestFiles,
  runTestAgent,
  runE2ETestAgent,
  runResolveTestAgent,
  runResolveE2ETestAgent,
  TestResult,
  E2ETestResult,
} from '../agents/testAgent';

describe('testAgent', () => {
  const testLogsDir = '/tmp/test-logs';
  const e2eTestsDir = path.join(process.cwd(), 'e2e-tests');

  beforeEach(() => {
    vi.clearAllMocks();
    // Clean up test directories
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogsDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directories
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true, force: true });
    }
    // Clean up mock e2e-tests directory if created
    if (fs.existsSync(e2eTestsDir)) {
      fs.rmSync(e2eTestsDir, { recursive: true, force: true });
    }
  });

  describe('discoverE2ETestFiles', () => {
    it('returns empty array when e2e-tests directory does not exist', () => {
      const result = discoverE2ETestFiles();
      expect(result).toEqual([]);
    });

    it('returns empty array when e2e-tests directory is empty', () => {
      fs.mkdirSync(e2eTestsDir, { recursive: true });
      const result = discoverE2ETestFiles();
      expect(result).toEqual([]);
    });

    it('returns only markdown files from e2e-tests directory', () => {
      fs.mkdirSync(e2eTestsDir, { recursive: true });
      fs.writeFileSync(path.join(e2eTestsDir, 'test_login.md'), '# Login Test');
      fs.writeFileSync(path.join(e2eTestsDir, 'test_signup.md'), '# Signup Test');
      fs.writeFileSync(path.join(e2eTestsDir, 'README.txt'), 'Not a test file');

      const result = discoverE2ETestFiles();

      expect(result).toHaveLength(2);
      expect(result).toContain(path.join(e2eTestsDir, 'test_login.md'));
      expect(result).toContain(path.join(e2eTestsDir, 'test_signup.md'));
    });

    it('returns files in sorted order', () => {
      fs.mkdirSync(e2eTestsDir, { recursive: true });
      fs.writeFileSync(path.join(e2eTestsDir, 'z_test.md'), '# Z Test');
      fs.writeFileSync(path.join(e2eTestsDir, 'a_test.md'), '# A Test');
      fs.writeFileSync(path.join(e2eTestsDir, 'm_test.md'), '# M Test');

      const result = discoverE2ETestFiles();

      expect(result[0]).toContain('a_test.md');
      expect(result[1]).toContain('m_test.md');
      expect(result[2]).toContain('z_test.md');
    });
  });

  describe('runTestAgent', () => {
    it('uses sonnet model for test execution', async () => {
      const mockSpawn = createMockSpawn({
        result: JSON.stringify([
          { test_name: 'linting', passed: true, execution_command: 'npm run lint', test_purpose: 'Check linting' }
        ])
      });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runTestAgent(testLogsDir);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.arrayContaining(['--model', 'sonnet']),
        expect.any(Object)
      );
    });

    it('parses test results from JSON output', async () => {
      const testResults: TestResult[] = [
        { test_name: 'linting', passed: true, execution_command: 'npm run lint', test_purpose: 'Check linting' },
        { test_name: 'build', passed: false, execution_command: 'npm run build', test_purpose: 'Build app', error: 'Build failed' },
      ];
      const mockSpawn = createMockSpawn({ result: JSON.stringify(testResults) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const result = await runTestAgent(testLogsDir);

      expect(result.testResults).toHaveLength(2);
      expect(result.allPassed).toBe(false);
      expect(result.failedTests).toHaveLength(1);
      expect(result.failedTests[0].test_name).toBe('build');
    });

    it('handles all tests passing', async () => {
      const testResults: TestResult[] = [
        { test_name: 'linting', passed: true, execution_command: 'npm run lint', test_purpose: 'Check linting' },
        { test_name: 'build', passed: true, execution_command: 'npm run build', test_purpose: 'Build app' },
      ];
      const mockSpawn = createMockSpawn({ result: JSON.stringify(testResults) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const result = await runTestAgent(testLogsDir);

      expect(result.allPassed).toBe(true);
      expect(result.failedTests).toHaveLength(0);
    });
  });

  describe('runE2ETestAgent', () => {
    it('uses sonnet model for E2E test execution', async () => {
      const e2eResult: E2ETestResult = {
        test_name: 'Login Test',
        status: 'passed',
        screenshots: [],
        error: null,
      };
      const mockSpawn = createMockSpawn({ result: JSON.stringify(e2eResult) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      await runE2ETestAgent('/path/to/test_login.md', testLogsDir);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.arrayContaining(['--model', 'sonnet']),
        expect.any(Object)
      );
    });

    it('parses E2E test result from JSON output', async () => {
      const e2eResult: E2ETestResult = {
        test_name: 'Login Test',
        status: 'failed',
        screenshots: ['/path/to/screenshot.png'],
        error: 'Element not found',
      };
      const mockSpawn = createMockSpawn({ result: JSON.stringify(e2eResult) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const result = await runE2ETestAgent('/path/to/test_login.md', testLogsDir);

      expect(result.e2eResult).not.toBeNull();
      expect(result.e2eResult?.test_name).toBe('Login Test');
      expect(result.e2eResult?.status).toBe('failed');
      expect(result.passed).toBe(false);
    });

    it('adds test_path to the result', async () => {
      const e2eResult: E2ETestResult = {
        test_name: 'Login Test',
        status: 'passed',
        screenshots: [],
        error: null,
      };
      const mockSpawn = createMockSpawn({ result: JSON.stringify(e2eResult) });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const testPath = '/path/to/test_login.md';
      const result = await runE2ETestAgent(testPath, testLogsDir);

      expect(result.e2eResult?.test_path).toBe(testPath);
    });
  });

  describe('runResolveTestAgent', () => {
    it('uses opus model for failure resolution', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed the issue' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedTest: TestResult = {
        test_name: 'build',
        passed: false,
        execution_command: 'npm run build',
        test_purpose: 'Build app',
        error: 'Type error',
      };

      await runResolveTestAgent(failedTest, testLogsDir);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.arrayContaining(['--model', 'opus']),
        expect.any(Object)
      );
    });

    it('passes failed test as JSON argument', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed the issue' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedTest: TestResult = {
        test_name: 'build',
        passed: false,
        execution_command: 'npm run build',
        test_purpose: 'Build app',
        error: 'Type error',
      };

      await runResolveTestAgent(failedTest, testLogsDir);

      // Verify the command was called with the test JSON in the prompt
      const calls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1];
      const args = lastCall[1] as string[];
      const prompt = args[args.length - 1];
      expect(prompt).toContain('/resolve_failed_test');
      expect(prompt).toContain('build');
    });
  });

  describe('runResolveE2ETestAgent', () => {
    it('uses opus model for E2E failure resolution', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed the E2E issue' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedE2ETest: E2ETestResult = {
        test_name: 'Login Test',
        status: 'failed',
        screenshots: [],
        error: 'Element not found',
        test_path: '/path/to/test_login.md',
      };

      await runResolveE2ETestAgent(failedE2ETest, testLogsDir);

      expect(spawn).toHaveBeenCalledWith(
        '/usr/local/bin/claude',
        expect.arrayContaining(['--model', 'opus']),
        expect.any(Object)
      );
    });

    it('passes failed E2E test as JSON argument', async () => {
      const mockSpawn = createMockSpawn({ result: 'Fixed the E2E issue' });
      (spawn as unknown as ReturnType<typeof vi.fn>).mockImplementation(mockSpawn);

      const failedE2ETest: E2ETestResult = {
        test_name: 'Login Test',
        status: 'failed',
        screenshots: ['/path/to/screenshot.png'],
        error: 'Element not found',
        test_path: '/path/to/test_login.md',
      };

      await runResolveE2ETestAgent(failedE2ETest, testLogsDir);

      // Verify the command was called with the E2E test JSON in the prompt
      const calls = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const lastCall = calls[calls.length - 1];
      const args = lastCall[1] as string[];
      const prompt = args[args.length - 1];
      expect(prompt).toContain('/resolve_failed_e2e_test');
      expect(prompt).toContain('Login Test');
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

    // Create mock event emitter-like object
    const mockStdout = {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data') {
          // Simulate JSONL output format
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
