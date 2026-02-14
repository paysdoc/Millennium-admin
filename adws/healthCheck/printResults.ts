/**
 * Human-readable output formatter for health check results.
 */

import type { CheckResult, HealthCheckResult } from './healthCheckUtils';
import { execCommand } from './healthCheckUtils';

const icon = (c: CheckResult): string => (c.success ? '\u2705' : '\u274C');
const warnLine = (c: CheckResult): string | undefined =>
  c.warning ? `   \u26A0\uFE0F  Warning: ${c.warning}` : undefined;

const printError = (c: CheckResult): void => { console.log(`   Error: ${c.error}`); };

const printEnv = (c: CheckResult): void => {
  console.log(`${icon(c)} Environment Variables`);
  if (!c.success) { printError(c); return; }
  const d = c.details as { required: string[]; optional: string[] };
  console.log(`   Required: ${d.required.join(', ')}`);
  if (d.optional.length > 0) console.log(`   Optional: ${d.optional.join(', ')}`);
};

const printGit = (c: CheckResult): void => {
  console.log(`${icon(c)} Git Repository`);
  if (!c.success) { printError(c); return; }
  const d = c.details as { currentBranch: string; remotes: string[]; userName?: string; userEmail?: string };
  console.log(`   Branch: ${d.currentBranch}`);
  console.log(`   Remotes: ${d.remotes.join(', ') || 'none'}`);
  if (d.userName) console.log(`   User: ${d.userName} <${d.userEmail}>`);
  const w = warnLine(c); if (w) console.log(w);
};

const printClaude = (c: CheckResult): void => {
  console.log(`${icon(c)} Claude Code CLI`);
  if (!c.success) { printError(c); return; }
  const d = c.details as { configuredPath: string; version: string; inPath: boolean };
  console.log(`   Path: ${d.configuredPath}`);
  console.log(`   Version: ${d.version}`);
  console.log(`   In PATH: ${d.inPath ? 'yes' : 'no'}`);
};

const printGh = (c: CheckResult): void => {
  console.log(`${icon(c)} GitHub CLI`);
  if (!c.success) { printError(c); return; }
  const d = c.details as { installed: boolean; authenticated: boolean; hasGitHubPAT: boolean };
  console.log(`   Installed: ${d.installed ? 'yes' : 'no'}`);
  console.log(`   Authenticated: ${d.authenticated ? 'yes' : 'no'}`);
  console.log(`   GITHUB_PAT set: ${d.hasGitHubPAT ? 'yes' : 'no'}`);
  const w = warnLine(c); if (w) console.log(w);
};

const printDir = (c: CheckResult): void => {
  console.log(`${icon(c)} Directory Structure`);
  if (!c.success) { printError(c); return; }
  const d = c.details as {
    logsDir: string; logsDirExists: boolean; specsDir: string; specsDirExists: boolean;
    claudeDirExists: boolean; commandsDirExists: boolean;
  };
  console.log(`   Logs dir: ${d.logsDir} ${d.logsDirExists ? '(exists)' : '(will be created)'}`);
  console.log(`   Specs dir: ${d.specsDir} ${d.specsDirExists ? '(exists)' : '(will be created)'}`);
  console.log(`   .claude dir: ${d.claudeDirExists ? 'exists' : 'missing'}`);
  console.log(`   .claude/commands: ${d.commandsDirExists ? 'exists' : 'missing'}`);
  const w = warnLine(c); if (w) console.log(w);
};

const printIssue = (c: CheckResult, issueNumber: number): void => {
  console.log(`${icon(c)} Issue #${issueNumber}`);
  if (!c.success) { printError(c); return; }
  const d = c.details as { title: string; state: string };
  console.log(`   Title: ${d.title}`);
  console.log(`   State: ${d.state}`);
  const repoUrl = execCommand('gh repo view --json url -q .url');
  if (repoUrl) console.log(`   URL: ${repoUrl}/issues/${issueNumber}`);
};

/** Prints the full health check result to stdout. */
export const printResults = (result: HealthCheckResult, issueNumber: number): void => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('ADW Health Check Results');
  console.log(`${'='.repeat(60)}\n`);

  printEnv(result.checks.environmentVariables);
  printGit(result.checks.gitRepository);
  printClaude(result.checks.claudeCodeCLI);
  printGh(result.checks.gitHubCLI);
  printDir(result.checks.directoryStructure);
  printIssue(result.checks.issueAccessibility, issueNumber);

  console.log(`\n${'-'.repeat(60)}`);
  if (result.success) {
    console.log('\u2705 All health checks passed!');
  } else {
    console.log('\u274C Health check failed!');
    console.log(`   ${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
  }
  console.log(`${'-'.repeat(60)}\n`);
};
