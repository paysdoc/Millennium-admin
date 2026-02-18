/**
 * Test Agent - Runs test commands and resolves failures.
 * Uses slash commands from .claude/commands/ for consistent prompt templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SLASH_COMMAND_MODEL_MAP } from '../core';
import { runClaudeAgentWithCommand, AgentResult } from './claudeAgent';
import { extractJson, extractJsonArray } from '../core/jsonParser';

/**
 * Individual test result from the /test command.
 * Matches the JSON output structure defined in .claude/commands/test.md
 */
export interface TestResult {
  test_name: string;
  passed: boolean;
  execution_command: string;
  test_purpose: string;
  error?: string;
}

/**
 * E2E test result from the /test_e2e command.
 * Matches the JSON output structure defined in .claude/commands/test_e2e.md
 */
export interface E2ETestResult {
  test_name: string;
  status: 'passed' | 'failed';
  screenshots: string[];
  error: string | null;
  /** The path to the test file (added for resolution context) */
  test_path?: string;
}

/**
 * Aggregated result from running the /test command.
 */
export interface TestAgentResult extends AgentResult {
  /** Parsed test results from the JSON output */
  testResults: TestResult[];
  /** Overall success status (all tests passed) */
  allPassed: boolean;
  /** Failed tests for resolution */
  failedTests: TestResult[];
}

/**
 * Result from running the /test_e2e command for a single test file.
 */
export interface E2ETestAgentResult extends AgentResult {
  /** Parsed E2E test result from the JSON output */
  e2eResult: E2ETestResult | null;
  /** Whether the E2E test passed */
  passed: boolean;
}

/**
 * Validates that an E2ETestResult has a valid test_name property.
 * Returns false if test_name is undefined, null, or not a string.
 */
export function isValidE2ETestResult(result: E2ETestResult | null): result is E2ETestResult & { test_name: string } {
  return result !== null && typeof result.test_name === 'string' && result.test_name.length > 0;
}

/**
 * Runs the /test command and returns parsed test results.
 * Uses 'sonnet' model for cost efficiency.
 *
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
export async function runTestAgent(
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<TestAgentResult> {
  const outputFile = path.join(logsDir, 'test-agent.jsonl');

  // Run /test command with empty args (command has no required arguments)
  const result = await runClaudeAgentWithCommand(
    '/test',
    '',
    'Test Runner',
    outputFile,
    SLASH_COMMAND_MODEL_MAP['/test'],
    undefined,
    statePath,
    cwd
  );

  // Parse the test results from the output
  const testResults = extractJsonArray<TestResult>(result.output);
  const failedTests = testResults.filter(t => !t.passed);
  const allPassed = testResults.length > 0 && failedTests.length === 0;

  return {
    ...result,
    testResults,
    allPassed,
    failedTests,
  };
}

/**
 * Runs the /test_e2e command for a specific E2E test file.
 * Uses 'sonnet' model for cost efficiency.
 *
 * @param testFilePath - Path to the E2E test file
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
export async function runE2ETestAgent(
  testFilePath: string,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<E2ETestAgentResult> {
  const testName = path.basename(testFilePath, '.md');
  const outputFile = path.join(logsDir, `e2e-test-agent-${testName}.jsonl`);

  // Run /test_e2e command with the test file path as argument
  const result = await runClaudeAgentWithCommand(
    '/test_e2e',
    testFilePath,
    `E2E Test: ${testName}`,
    outputFile,
    SLASH_COMMAND_MODEL_MAP['/test_e2e'],
    undefined,
    statePath,
    cwd
  );

  // Parse the E2E test result from the output
  const e2eResult = extractJson<E2ETestResult>(result.output);
  const passed = e2eResult?.status === 'passed';

  // Add test_path to the result for resolution context
  if (e2eResult) {
    e2eResult.test_path = testFilePath;
  }

  return {
    ...result,
    e2eResult,
    passed,
  };
}

/**
 * Runs the /resolve_failed_test command with failure details.
 * Uses 'opus' model for complex reasoning.
 *
 * @param failedTest - The test result that failed
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
export async function runResolveTestAgent(
  failedTest: TestResult,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<AgentResult> {
  const outputFile = path.join(logsDir, `resolve-test-${failedTest.test_name}.jsonl`);

  // Format the failed test as JSON for the resolver
  const failureJson = JSON.stringify(failedTest, null, 2);

  return runClaudeAgentWithCommand(
    '/resolve_failed_test',
    failureJson,
    `Resolve: ${failedTest.test_name}`,
    outputFile,
    SLASH_COMMAND_MODEL_MAP['/resolve_failed_test'],
    undefined,
    statePath,
    cwd
  );
}

/**
 * Runs the /resolve_failed_e2e_test command with failure details.
 * Uses 'opus' model for complex reasoning.
 *
 * @param failedE2ETest - The E2E test result that failed
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 * @param cwd - Optional working directory for the agent (defaults to process.cwd())
 */
export async function runResolveE2ETestAgent(
  failedE2ETest: E2ETestResult,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<AgentResult> {
  // Handle undefined or invalid test_name gracefully
  const rawTestName = failedE2ETest.test_name;
  const testName = typeof rawTestName === 'string' && rawTestName.length > 0
    ? rawTestName.replace(/\s+/g, '-').toLowerCase()
    : 'unknown-test';
  const outputFile = path.join(logsDir, `resolve-e2e-${testName}.jsonl`);

  // Format the failed E2E test as JSON for the resolver
  const failureJson = JSON.stringify(failedE2ETest, null, 2);

  // Use fallback display name if test_name is undefined
  const displayName = rawTestName ?? 'unknown';

  return runClaudeAgentWithCommand(
    '/resolve_failed_e2e_test',
    failureJson,
    `Resolve E2E: ${displayName}`,
    outputFile,
    SLASH_COMMAND_MODEL_MAP['/resolve_failed_e2e_test'],
    undefined,
    statePath,
    cwd
  );
}

/**
 * Discovers E2E test files in the e2e-tests directory.
 * Returns an array of paths to markdown test files.
 *
 * @param baseDir - Optional base directory (defaults to process.cwd())
 * @returns Array of absolute paths to E2E test files
 */
export function discoverE2ETestFiles(baseDir?: string): string[] {
  const e2eTestsDir = path.join(baseDir ?? process.cwd(), 'e2e-tests');

  // Return empty array if directory doesn't exist
  if (!fs.existsSync(e2eTestsDir)) {
    return [];
  }

  try {
    const files = fs.readdirSync(e2eTestsDir);
    return files
      .filter(file => file.endsWith('.md'))
      .map(file => path.join(e2eTestsDir, file))
      .sort();
  } catch {
    return [];
  }
}
