#!/usr/bin/env npx tsx
/**
 * Health Check Script for ADW System
 *
 * Usage: npx tsx adws/healthCheck.tsx <issue_number>
 *
 * Orchestrates comprehensive health checks and outputs results.
 */

import * as fs from 'fs';
import * as path from 'path';

import { log } from './core';
import { checkEnvironmentVariables } from './healthCheck/envChecks';
import type { CheckResult } from './healthCheck/healthCheckUtils';
import { aggregateResults } from './healthCheck/healthCheckUtils';
import { printResults } from './healthCheck/printResults';
import {
  checkClaudeCodeCLI,
  checkDirectoryStructure,
  checkGitHubCLI,
  checkGitRepository,
  checkIssueNumber,
} from './healthCheck/serviceChecks';

// Re-export types so existing consumers keep working
export type { CheckResult, HealthCheckResult } from './healthCheck/healthCheckUtils';

/** Prints usage information and exits. */
const printUsageAndExit = (): never => {
  console.error('Usage: npx tsx adws/healthCheck.tsx <issue_number>');
  console.error('');
  console.error('Performs comprehensive health checks for the ADW system.');
  console.error('');
  console.error('Arguments:');
  console.error('  issue_number  - GitHub issue number to validate');
  console.error('');
  console.error('Checks performed:');
  console.error('  - Environment variables (ANTHROPIC_API_KEY, etc.)');
  console.error('  - Git repository configuration');
  console.error('  - Claude Code CLI functionality');
  console.error('  - GitHub CLI (gh) functionality');
  console.error('  - Directory structure');
  console.error('  - Issue accessibility');
  process.exit(1);
};

/** Parses command line arguments. */
const parseArguments = (args: readonly string[]): { issueNumber: number } => {
  if (args.length < 1) {
    printUsageAndExit();
  }
  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }
  return { issueNumber };
};

/** Main health check runner. */
const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const { issueNumber } = parseArguments(args);

  log('Starting ADW health check...', 'info');

  const checkEntries: ReadonlyArray<[string, () => CheckResult]> = [
    ['environmentVariables', () => { log('Checking environment variables...', 'info'); return checkEnvironmentVariables(); }],
    ['gitRepository', () => { log('Checking git repository...', 'info'); return checkGitRepository(); }],
    ['claudeCodeCLI', () => { log('Checking Claude Code CLI...', 'info'); return checkClaudeCodeCLI(); }],
    ['gitHubCLI', () => { log('Checking GitHub CLI...', 'info'); return checkGitHubCLI(); }],
    ['directoryStructure', () => { log('Checking directory structure...', 'info'); return checkDirectoryStructure(); }],
    ['issueAccessibility', () => { log(`Checking issue #${issueNumber}...`, 'info'); return checkIssueNumber(issueNumber); }],
  ];

  const checks: Record<string, CheckResult> = Object.fromEntries(
    checkEntries.map(([name, fn]) => [name, fn()] as const),
  );

  const result = aggregateResults(checks, new Date().toISOString());
  printResults(result, issueNumber);

  // Write machine-readable output
  const outputFile = path.join(process.cwd(), 'healthCheck.jsonl');
  fs.writeFileSync(outputFile, JSON.stringify(result) + '\n');
  log(`Results written to: ${outputFile}`, 'info');

  process.exit(result.success ? 0 : 1);
};

main();
