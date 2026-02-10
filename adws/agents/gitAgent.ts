/**
 * Git Agent - Branch name generation and commit operations via Claude skills.
 * Uses /generate_branch_name and /commit slash commands from .claude/commands/
 */

import * as path from 'path';
import { GitHubIssue, IssueClassSlashCommand, log } from '../core';
import { runClaudeAgentWithCommand, AgentResult } from './claudeAgent';
import { getMainRepoPath } from '../github/worktreeOperations';

/**
 * Formats structured args for the /generate_branch_name skill.
 */
export function formatBranchNameArgs(
  issueClass: IssueClassSlashCommand,
  adwId: string,
  issue: GitHubIssue
): string {
  return `issue_class: ${issueClass}
adw_id: ${adwId}
issue: ${JSON.stringify(issue)}`;
}

/**
 * Extracts the branch name from the agent's output.
 * The skill returns ONLY the branch name.
 */
export function extractBranchNameFromOutput(output: string): string {
  const trimmed = output.trim();
  const lines = trimmed.split('\n').filter(line => line.trim());
  return lines[lines.length - 1].trim();
}

/**
 * Runs the /generate_branch_name skill to create a branch in the main repo.
 *
 * @param issueType - Issue classification slash command
 * @param adwId - ADW session identifier
 * @param issue - GitHub issue details
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory
 * @param cwd - Optional working directory (defaults to main repo path)
 */
export async function runGenerateBranchNameAgent(
  issueType: IssueClassSlashCommand,
  adwId: string,
  issue: GitHubIssue,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<AgentResult & { branchName: string }> {
  const args = formatBranchNameArgs(issueType, adwId, issue);
  const outputFile = path.join(logsDir, 'branch-name-agent.jsonl');
  const effectiveCwd = cwd || getMainRepoPath();

  log('Branch Name Agent starting:', 'info');
  log(`  Issue: #${issue.number} - ${issue.title}`, 'info');
  log(`  Issue type: ${issueType}`, 'info');
  log(`  ADW ID: ${adwId}`, 'info');
  log(`  CWD: ${effectiveCwd}`, 'info');

  const result = await runClaudeAgentWithCommand(
    '/generate_branch_name',
    args,
    'Branch Name',
    outputFile,
    'sonnet',
    undefined,
    statePath,
    effectiveCwd
  );

  const branchName = extractBranchNameFromOutput(result.output);
  log(`Branch name generated: ${branchName}`, 'success');

  return { ...result, branchName };
}

/**
 * Formats structured args for the /commit skill.
 */
export function formatCommitArgs(
  agentName: string,
  issueClass: string,
  issueContext: string
): string {
  return `agent_name: ${agentName}
issue_class: ${issueClass}
issue: ${issueContext}`;
}

/**
 * Extracts the commit message from the agent's output.
 * The skill returns ONLY the commit message.
 */
export function extractCommitMessageFromOutput(output: string): string {
  const trimmed = output.trim();
  const lines = trimmed.split('\n').filter(line => line.trim());
  return lines[lines.length - 1].trim();
}

/**
 * Runs the /commit skill to stage and commit changes.
 *
 * @param agentName - Name of the agent making the commit
 * @param issueClass - Issue classification string
 * @param issueContext - Issue JSON or PR details JSON
 * @param logsDir - Directory to write agent logs
 * @param statePath - Optional path to agent's state directory
 * @param cwd - Optional working directory (worktree path)
 */
export async function runCommitAgent(
  agentName: string,
  issueClass: string,
  issueContext: string,
  logsDir: string,
  statePath?: string,
  cwd?: string
): Promise<AgentResult & { commitMessage: string }> {
  const args = formatCommitArgs(agentName, issueClass, issueContext);
  const outputFile = path.join(logsDir, 'commit-agent.jsonl');

  log('Commit Agent starting:', 'info');
  log(`  Agent name: ${agentName}`, 'info');
  log(`  Issue class: ${issueClass}`, 'info');
  if (cwd) log(`  CWD: ${cwd}`, 'info');

  const result = await runClaudeAgentWithCommand(
    '/commit',
    args,
    'Commit',
    outputFile,
    'sonnet',
    undefined,
    statePath,
    cwd
  );

  const commitMessage = extractCommitMessageFromOutput(result.output);
  log(`Commit message: ${commitMessage}`, 'success');

  return { ...result, commitMessage };
}
