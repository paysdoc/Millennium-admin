#!/usr/bin/env npx tsx
/**
 * Health Check Script for ADW System
 *
 * Usage: npx tsx adws/healthCheck.tsx <issue_number>
 *
 * Performs comprehensive health checks:
 * 1. Validates all required environment variables
 * 2. Checks git repository configuration
 * 3. Tests Claude Code CLI functionality
 * 4. Returns structured results as HealthCheckResult
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR } from './config';
import { log } from './utils';

/**
 * Individual check result.
 */
export interface CheckResult {
  success: boolean;
  error?: string;
  warning?: string;
  details: Record<string, unknown>;
}

/**
 * Structure for health check results.
 */
export interface HealthCheckResult {
  success: boolean;
  timestamp: string;
  checks: Record<string, CheckResult>;
  warnings: string[];
  errors: string[];
}

/**
 * Checks if a command exists in PATH.
 */
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes a command and returns the output or null on failure.
 */
function execCommand(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return null;
  }
}

/**
 * Checks required environment variables.
 */
function checkEnvironmentVariables(): CheckResult {
  const required = ['ANTHROPIC_API_KEY'];
  const optional = ['CLAUDE_CODE_PATH', 'GITHUB_PAT', 'GITHUB_PERSONAL_ACCESS_TOKEN'];

  const missing: string[] = [];
  const present: string[] = [];
  const optionalPresent: string[] = [];

  for (const envVar of required) {
    if (process.env[envVar]) {
      present.push(envVar);
    } else {
      missing.push(envVar);
    }
  }

  for (const envVar of optional) {
    if (process.env[envVar]) {
      optionalPresent.push(envVar);
    }
  }

  const success = missing.length === 0;

  return {
    success,
    error: missing.length > 0 ? `Missing required environment variables: ${missing.join(', ')}` : undefined,
    details: {
      required: present,
      missing,
      optional: optionalPresent
    }
  };
}

/**
 * Checks git repository configuration.
 */
function checkGitRepository(): CheckResult {
  const details: Record<string, unknown> = {};

  // Check if in a git repository
  const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
  if (!isGitRepo) {
    return {
      success: false,
      error: 'Not in a git repository',
      details: { isGitRepo: false }
    };
  }
  details.isGitRepo = true;

  // Get current branch
  const branch = execCommand('git rev-parse --abbrev-ref HEAD');
  details.currentBranch = branch || 'unknown';

  // Check for remote
  const remotes = execCommand('git remote');
  details.hasRemote = remotes !== null && remotes.length > 0;
  details.remotes = remotes?.split('\n').filter(Boolean) || [];

  // Check for uncommitted changes
  const status = execCommand('git status --porcelain');
  details.hasUncommittedChanges = status !== null && status.length > 0;

  // Check user config
  const userName = execCommand('git config user.name');
  const userEmail = execCommand('git config user.email');
  details.userConfigured = Boolean(userName && userEmail);
  details.userName = userName || undefined;
  details.userEmail = userEmail || undefined;

  let warning: string | undefined;
  if (!details.userConfigured) {
    warning = 'Git user.name or user.email not configured';
  }

  return {
    success: true,
    warning,
    details
  };
}

/**
 * Checks Claude Code CLI functionality.
 */
function checkClaudeCodeCLI(): CheckResult {
  const details: Record<string, unknown> = {};

  // Check if claude CLI exists at configured path
  const cliExists = fs.existsSync(CLAUDE_CODE_PATH);
  details.configuredPath = CLAUDE_CODE_PATH;
  details.pathExists = cliExists;

  // Also check if claude is in PATH
  const inPath = commandExists('claude');
  details.inPath = inPath;

  if (!cliExists && !inPath) {
    return {
      success: false,
      error: `Claude CLI not found at ${CLAUDE_CODE_PATH} and not in PATH`,
      details
    };
  }

  // Try to get version
  const claudePath = cliExists ? CLAUDE_CODE_PATH : 'claude';
  const version = execCommand(`${claudePath} --version`);
  details.version = version || 'unknown';

  return {
    success: true,
    details
  };
}

/**
 * Checks GitHub CLI (gh) functionality.
 */
function checkGitHubCLI(): CheckResult {
  const details: Record<string, unknown> = {};

  // Check if gh CLI exists
  const ghExists = commandExists('gh');
  details.installed = ghExists;

  if (!ghExists) {
    return {
      success: false,
      error: 'GitHub CLI (gh) not installed',
      details
    };
  }

  // Check if authenticated
  const authStatus = execCommand('gh auth status 2>&1');
  details.authenticated = authStatus !== null && !authStatus.includes('not logged');

  // Check GITHUB_PAT
  details.hasGitHubPAT = Boolean(GITHUB_PAT);

  let warning: string | undefined;
  if (!details.authenticated && !details.hasGitHubPAT) {
    warning = 'GitHub CLI not authenticated and no GITHUB_PAT set';
  }

  return {
    success: true,
    warning,
    details
  };
}

/**
 * Checks directory structure.
 */
function checkDirectoryStructure(): CheckResult {
  const details: Record<string, unknown> = {};

  // Check if logs directory exists or can be created
  details.logsDir = LOGS_DIR;
  details.logsDirExists = fs.existsSync(LOGS_DIR);

  // Check if specs directory exists or can be created
  details.specsDir = SPECS_DIR;
  details.specsDirExists = fs.existsSync(SPECS_DIR);

  // Check for .claude directory
  const claudeDir = path.join(process.cwd(), '.claude');
  details.claudeDirExists = fs.existsSync(claudeDir);

  // Check for .claude/commands directory
  const commandsDir = path.join(claudeDir, 'commands');
  details.commandsDirExists = fs.existsSync(commandsDir);

  let warning: string | undefined;
  if (!details.claudeDirExists || !details.commandsDirExists) {
    warning = '.claude/commands directory not found - custom slash commands may not work';
  }

  return {
    success: true,
    warning,
    details
  };
}

/**
 * Validates a GitHub issue number (basic check).
 */
function checkIssueNumber(issueNumber: number): CheckResult {
  const details: Record<string, unknown> = {
    issueNumber
  };

  if (isNaN(issueNumber) || issueNumber <= 0) {
    return {
      success: false,
      error: `Invalid issue number: ${issueNumber}`,
      details
    };
  }

  // Try to fetch the issue using gh CLI
  const issueData = execCommand(`gh issue view ${issueNumber} --json number,title,state 2>&1`);

  if (issueData === null || issueData.includes('Could not resolve')) {
    return {
      success: false,
      error: `Issue #${issueNumber} not found or not accessible`,
      details
    };
  }

  try {
    const parsed = JSON.parse(issueData);
    details.title = parsed.title;
    details.state = parsed.state;
    details.exists = true;
  } catch {
    return {
      success: false,
      error: `Failed to parse issue data for #${issueNumber}`,
      details
    };
  }

  return {
    success: true,
    details
  };
}

/**
 * Prints usage information and exits.
 */
function printUsageAndExit(): never {
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
}

/**
 * Parses command line arguments.
 */
function parseArguments(args: string[]): { issueNumber: number } {
  if (args.length < 1) {
    printUsageAndExit();
  }

  const issueNumber = parseInt(args[0], 10);
  if (isNaN(issueNumber)) {
    console.error(`Invalid issue number: ${args[0]}`);
    process.exit(1);
  }

  return { issueNumber };
}

/**
 * Main health check runner.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { issueNumber } = parseArguments(args);

  log('Starting ADW health check...', 'info');

  const result: HealthCheckResult = {
    success: true,
    timestamp: new Date().toISOString(),
    checks: {},
    warnings: [],
    errors: []
  };

  // Run all checks
  log('Checking environment variables...', 'info');
  result.checks.environmentVariables = checkEnvironmentVariables();

  log('Checking git repository...', 'info');
  result.checks.gitRepository = checkGitRepository();

  log('Checking Claude Code CLI...', 'info');
  result.checks.claudeCodeCLI = checkClaudeCodeCLI();

  log('Checking GitHub CLI...', 'info');
  result.checks.gitHubCLI = checkGitHubCLI();

  log('Checking directory structure...', 'info');
  result.checks.directoryStructure = checkDirectoryStructure();

  log(`Checking issue #${issueNumber}...`, 'info');
  result.checks.issueAccessibility = checkIssueNumber(issueNumber);

  // Collect warnings and errors
  for (const [checkName, checkResult] of Object.entries(result.checks)) {
    if (checkResult.error) {
      result.errors.push(`${checkName}: ${checkResult.error}`);
    }
    if (checkResult.warning) {
      result.warnings.push(`${checkName}: ${checkResult.warning}`);
    }
    if (!checkResult.success) {
      result.success = false;
    }
  }

  // Output results in human-readable format
  console.log('\n' + '='.repeat(60));
  console.log('ADW Health Check Results');
  console.log('='.repeat(60) + '\n');

  // Environment Variables
  const envCheck = result.checks.environmentVariables;
  console.log(`${envCheck.success ? '✅' : '❌'} Environment Variables`);
  if (envCheck.success) {
    const details = envCheck.details as { required: string[]; optional: string[] };
    console.log(`   Required: ${details.required.join(', ')}`);
    if (details.optional.length > 0) {
      console.log(`   Optional: ${details.optional.join(', ')}`);
    }
  } else {
    console.log(`   Error: ${envCheck.error}`);
  }

  // Git Repository
  const gitCheck = result.checks.gitRepository;
  console.log(`${gitCheck.success ? '✅' : '❌'} Git Repository`);
  if (gitCheck.success) {
    const details = gitCheck.details as { currentBranch: string; remotes: string[]; userName?: string; userEmail?: string };
    console.log(`   Branch: ${details.currentBranch}`);
    console.log(`   Remotes: ${details.remotes.join(', ') || 'none'}`);
    if (details.userName) {
      console.log(`   User: ${details.userName} <${details.userEmail}>`);
    }
    if (gitCheck.warning) {
      console.log(`   ⚠️  Warning: ${gitCheck.warning}`);
    }
  } else {
    console.log(`   Error: ${gitCheck.error}`);
  }

  // Claude Code CLI
  const claudeCheck = result.checks.claudeCodeCLI;
  console.log(`${claudeCheck.success ? '✅' : '❌'} Claude Code CLI`);
  if (claudeCheck.success) {
    const details = claudeCheck.details as { configuredPath: string; version: string; inPath: boolean };
    console.log(`   Path: ${details.configuredPath}`);
    console.log(`   Version: ${details.version}`);
    console.log(`   In PATH: ${details.inPath ? 'yes' : 'no'}`);
  } else {
    console.log(`   Error: ${claudeCheck.error}`);
  }

  // GitHub CLI
  const ghCheck = result.checks.gitHubCLI;
  console.log(`${ghCheck.success ? '✅' : '❌'} GitHub CLI`);
  if (ghCheck.success) {
    const details = ghCheck.details as { installed: boolean; authenticated: boolean; hasGitHubPAT: boolean };
    console.log(`   Installed: ${details.installed ? 'yes' : 'no'}`);
    console.log(`   Authenticated: ${details.authenticated ? 'yes' : 'no'}`);
    console.log(`   GITHUB_PAT set: ${details.hasGitHubPAT ? 'yes' : 'no'}`);
    if (ghCheck.warning) {
      console.log(`   ⚠️  Warning: ${ghCheck.warning}`);
    }
  } else {
    console.log(`   Error: ${ghCheck.error}`);
  }

  // Directory Structure
  const dirCheck = result.checks.directoryStructure;
  console.log(`${dirCheck.success ? '✅' : '❌'} Directory Structure`);
  if (dirCheck.success) {
    const details = dirCheck.details as { logsDir: string; logsDirExists: boolean; specsDir: string; specsDirExists: boolean; claudeDirExists: boolean; commandsDirExists: boolean };
    console.log(`   Logs dir: ${details.logsDir} ${details.logsDirExists ? '(exists)' : '(will be created)'}`);
    console.log(`   Specs dir: ${details.specsDir} ${details.specsDirExists ? '(exists)' : '(will be created)'}`);
    console.log(`   .claude dir: ${details.claudeDirExists ? 'exists' : 'missing'}`);
    console.log(`   .claude/commands: ${details.commandsDirExists ? 'exists' : 'missing'}`);
    if (dirCheck.warning) {
      console.log(`   ⚠️  Warning: ${dirCheck.warning}`);
    }
  } else {
    console.log(`   Error: ${dirCheck.error}`);
  }

  // Issue Accessibility
  const issueCheck = result.checks.issueAccessibility;
  console.log(`${issueCheck.success ? '✅' : '❌'} Issue #${issueNumber}`);
  if (issueCheck.success) {
    const details = issueCheck.details as { title: string; state: string };
    console.log(`   Title: ${details.title}`);
    console.log(`   State: ${details.state}`);
    // Get repo URL for the issue link
    const repoUrl = execCommand('gh repo view --json url -q .url');
    if (repoUrl) {
      console.log(`   URL: ${repoUrl}/issues/${issueNumber}`);
    }
  } else {
    console.log(`   Error: ${issueCheck.error}`);
  }

  // Summary
  console.log('\n' + '-'.repeat(60));
  if (result.success) {
    console.log('✅ All health checks passed!');
  } else {
    console.log('❌ Health check failed!');
    console.log(`   ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  }
  console.log('-'.repeat(60) + '\n');

  // Also write to a JSONL file for programmatic consumption
  const outputFile = path.join(process.cwd(), 'healthCheck.jsonl');
  fs.writeFileSync(outputFile, JSON.stringify(result) + '\n');
  log(`Results written to: ${outputFile}`, 'info');

  process.exit(result.success ? 0 : 1);
}

main();
