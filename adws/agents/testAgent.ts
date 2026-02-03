/**
 * Test Agent - Runs test commands and resolves failures.
 * Uses slash commands from .claude/commands/ for consistent prompt templates.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runClaudeAgentWithCommand, AgentResult } from './claudeAgent';

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
 * Parses JSON test results from agent output.
 * Handles cases where the output contains additional text around the JSON.
 */
function parseTestResults(output: string): TestResult[] {
  try {
    // Try direct JSON parse first
    return JSON.parse(output);
  } catch {
    // Try to extract JSON array from the output
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return [];
      }
    }
    return [];
  }
}

/**
 * Parses E2E test result from agent output.
 * Handles cases where the output contains additional text around the JSON.
 */
function parseE2ETestResult(output: string): E2ETestResult | null {
  try {
    // Try direct JSON parse first
    return JSON.parse(output);
  } catch {
    // Try to extract JSON object from the output
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Runs the /test command and returns parsed test results.
 * Uses 'sonnet' model for cost efficiency.
 *
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 */
export async function runTestAgent(
  logsDir: string,
  statePath?: string
): Promise<TestAgentResult> {
  const outputFile = path.join(logsDir, 'test-agent.jsonl');

  // Run /test command with empty args (command has no required arguments)
  const result = await runClaudeAgentWithCommand(
    '/test',
    '',
    'Test Runner',
    outputFile,
    'sonnet',
    undefined,
    statePath
  );

  // Parse the test results from the output
  const testResults = parseTestResults(result.output);
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
 */
export async function runE2ETestAgent(
  testFilePath: string,
  logsDir: string,
  statePath?: string
): Promise<E2ETestAgentResult> {
  const testName = path.basename(testFilePath, '.md');
  const outputFile = path.join(logsDir, `e2e-test-agent-${testName}.jsonl`);

  // Run /test_e2e command with the test file path as argument
  const result = await runClaudeAgentWithCommand(
    '/test_e2e',
    testFilePath,
    `E2E Test: ${testName}`,
    outputFile,
    'sonnet',
    undefined,
    statePath
  );

  // Parse the E2E test result from the output
  const e2eResult = parseE2ETestResult(result.output);
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
 */
export async function runResolveTestAgent(
  failedTest: TestResult,
  logsDir: string,
  statePath?: string
): Promise<AgentResult> {
  const outputFile = path.join(logsDir, `resolve-test-${failedTest.test_name}.jsonl`);

  // Format the failed test as JSON for the resolver
  const failureJson = JSON.stringify(failedTest, null, 2);

  return runClaudeAgentWithCommand(
    '/resolve_failed_test',
    failureJson,
    `Resolve: ${failedTest.test_name}`,
    outputFile,
    'opus',
    undefined,
    statePath
  );
}

/**
 * Runs the /resolve_failed_e2e_test command with failure details.
 * Uses 'opus' model for complex reasoning.
 *
 * @param failedE2ETest - The E2E test result that failed
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory for state tracking
 */
export async function runResolveE2ETestAgent(
  failedE2ETest: E2ETestResult,
  logsDir: string,
  statePath?: string
): Promise<AgentResult> {
  const testName = failedE2ETest.test_name.replace(/\s+/g, '-').toLowerCase();
  const outputFile = path.join(logsDir, `resolve-e2e-${testName}.jsonl`);

  // Format the failed E2E test as JSON for the resolver
  const failureJson = JSON.stringify(failedE2ETest, null, 2);

  return runClaudeAgentWithCommand(
    '/resolve_failed_e2e_test',
    failureJson,
    `Resolve E2E: ${failedE2ETest.test_name}`,
    outputFile,
    'opus',
    undefined,
    statePath
  );
}

/**
 * Discovers E2E test files in the e2e-tests directory.
 * Returns an array of paths to markdown test files.
 *
 * @returns Array of absolute paths to E2E test files
 */
export function discoverE2ETestFiles(): string[] {
  const e2eTestsDir = path.join(process.cwd(), '.claude/commands/e2e');

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
