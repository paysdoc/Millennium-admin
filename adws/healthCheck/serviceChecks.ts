/**
 * Service Connectivity Checks
 *
 * Validates external services: git, Claude Code CLI, GitHub CLI,
 * directory structure, and GitHub issue accessibility.
 */

import * as fs from 'fs';
import * as path from 'path';
import { CLAUDE_CODE_PATH, GITHUB_PAT, LOGS_DIR, SPECS_DIR } from '../core';
import type { CheckResult } from './healthCheckUtils';
import { commandExists, execCommand } from './healthCheckUtils';

/** Checks git repository configuration. */
export const checkGitRepository = (): CheckResult => {
  const isGitRepo = fs.existsSync(path.join(process.cwd(), '.git'));
  if (!isGitRepo) {
    return { success: false, error: 'Not in a git repository', details: { isGitRepo: false } };
  }

  const branch = execCommand('git rev-parse --abbrev-ref HEAD');
  const remotes = execCommand('git remote');
  const status = execCommand('git status --porcelain');
  const userName = execCommand('git config user.name');
  const userEmail = execCommand('git config user.email');
  const userConfigured = Boolean(userName && userEmail);

  return {
    success: true,
    warning: userConfigured ? undefined : 'Git user.name or user.email not configured',
    details: {
      isGitRepo: true,
      currentBranch: branch || 'unknown',
      hasRemote: remotes !== null && remotes.length > 0,
      remotes: remotes?.split('\n').filter(Boolean) ?? [],
      hasUncommittedChanges: status !== null && status.length > 0,
      userConfigured,
      userName: userName || undefined,
      userEmail: userEmail || undefined,
    },
  };
};

/** Checks Claude Code CLI functionality. */
export const checkClaudeCodeCLI = (): CheckResult => {
  const cliExists = fs.existsSync(CLAUDE_CODE_PATH);
  const inPath = commandExists('claude');

  if (!cliExists && !inPath) {
    return {
      success: false,
      error: `Claude CLI not found at ${CLAUDE_CODE_PATH} and not in PATH`,
      details: { configuredPath: CLAUDE_CODE_PATH, pathExists: false, inPath: false },
    };
  }

  const claudePath = cliExists ? CLAUDE_CODE_PATH : 'claude';
  const version = execCommand(`${claudePath} --version`);

  return {
    success: true,
    details: { configuredPath: CLAUDE_CODE_PATH, pathExists: cliExists, inPath, version: version || 'unknown' },
  };
};

/** Checks GitHub CLI (gh) functionality. */
export const checkGitHubCLI = (): CheckResult => {
  const ghExists = commandExists('gh');
  if (!ghExists) {
    return { success: false, error: 'GitHub CLI (gh) not installed', details: { installed: false } };
  }

  const authStatus = execCommand('gh auth status 2>&1');
  const authenticated = authStatus !== null && !authStatus.includes('not logged');
  const hasGitHubPAT = Boolean(GITHUB_PAT);
  const warning = !authenticated && !hasGitHubPAT
    ? 'GitHub CLI not authenticated and no GITHUB_PAT set'
    : undefined;

  return { success: true, warning, details: { installed: true, authenticated, hasGitHubPAT } };
};

/** Checks that expected directories exist (or can be created). */
export const checkDirectoryStructure = (): CheckResult => {
  const claudeDir = path.join(process.cwd(), '.claude');
  const commandsDir = path.join(claudeDir, 'commands');
  const logsDirExists = fs.existsSync(LOGS_DIR);
  const specsDirExists = fs.existsSync(SPECS_DIR);
  const claudeDirExists = fs.existsSync(claudeDir);
  const commandsDirExists = fs.existsSync(commandsDir);

  return {
    success: true,
    warning: !claudeDirExists || !commandsDirExists
      ? '.claude/commands directory not found - custom slash commands may not work'
      : undefined,
    details: {
      logsDir: LOGS_DIR, logsDirExists,
      specsDir: SPECS_DIR, specsDirExists,
      claudeDirExists, commandsDirExists,
    },
  };
};

/** Validates a GitHub issue number and checks accessibility via gh CLI. */
export const checkIssueNumber = (issueNumber: number): CheckResult => {
  const details: Record<string, unknown> = { issueNumber };

  if (isNaN(issueNumber) || issueNumber <= 0) {
    return { success: false, error: `Invalid issue number: ${issueNumber}`, details };
  }

  const issueData = execCommand(`gh issue view ${issueNumber} --json number,title,state 2>&1`);
  if (issueData === null || issueData.includes('Could not resolve')) {
    return { success: false, error: `Issue #${issueNumber} not found or not accessible`, details };
  }

  try {
    const parsed = JSON.parse(issueData) as { title: string; state: string };
    return {
      success: true,
      details: { ...details, title: parsed.title, state: parsed.state, exists: true },
    };
  } catch {
    return { success: false, error: `Failed to parse issue data for #${issueNumber}`, details };
  }
};
