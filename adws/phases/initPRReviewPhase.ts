/**
 * PR review workflow initialization phase.
 *
 * Handles fetching PR details, checking for unaddressed comments,
 * setting up worktree, and initializing state.
 */

import {
  log,
  generateAdwId,
  ensureLogsDirectory,
  type AgentState,
  AgentStateManager,
} from '../core';
import {
  fetchPRDetails,
  getUnaddressedComments,
  postPRWorkflowComment,
  type PRReviewWorkflowContext,
  ensureWorktree,
} from '../github';
import type { PRReviewWorkflowConfig } from './phaseUtils';

/**
 * Initializes a PR review workflow: fetches PR details, checks for unaddressed
 * comments, sets up worktree, and initializes state.
 */
export function initializePRReviewWorkflow(prNumber: number, adwId: string | null): PRReviewWorkflowConfig {
  const prDetails = fetchPRDetails(prNumber);
  log(`Fetched PR: ${prDetails.title}`, 'success');

  const resolvedAdwId = adwId ?? generateAdwId(prDetails.title);

  log('===================================', 'info');
  log('PR Review Orchestrator', 'info');
  log(`PR: #${prNumber}`, 'info');
  log(`ADW ID: ${resolvedAdwId}`, 'info');
  log('===================================', 'info');

  if (prDetails.state === 'CLOSED' || prDetails.state === 'MERGED') {
    log(`PR #${prNumber} is ${prDetails.state}, skipping`, 'info');
    process.exit(0);
  }

  const unaddressedComments = getUnaddressedComments(prNumber);

  if (unaddressedComments.length === 0) {
    log(`No unaddressed review comments on PR #${prNumber}, exiting`, 'info');
    process.exit(0);
  }

  log(`Found ${unaddressedComments.length} unaddressed review comment(s)`, 'info');

  const logsDir = ensureLogsDirectory(resolvedAdwId);
  const issueNumber = prDetails.issueNumber || 0;
  const orchestratorStatePath = AgentStateManager.initializeState(resolvedAdwId, 'pr-review-orchestrator');
  log(`State: ${orchestratorStatePath}`, 'info');

  const initialState: Partial<AgentState> = {
    adwId: resolvedAdwId,
    issueNumber,
    branchName: prDetails.headBranch,
    agentName: 'pr-review-orchestrator',
    execution: AgentStateManager.createExecutionState('running'),
    metadata: { prNumber, reviewComments: unaddressedComments.length },
  };
  AgentStateManager.writeState(orchestratorStatePath, initialState);
  AgentStateManager.appendLog(orchestratorStatePath, `Starting PR Review workflow for PR #${prNumber}`);

  const ctx: PRReviewWorkflowContext = {
    issueNumber,
    adwId: resolvedAdwId,
    prNumber,
    reviewComments: unaddressedComments.length,
    branchName: prDetails.headBranch,
  };

  const worktreePath = ensureWorktree(prDetails.headBranch);
  log(`Worktree path: ${worktreePath}`, 'info');

  postPRWorkflowComment(prNumber, 'pr_review_starting', ctx);

  return {
    prNumber,
    issueNumber,
    adwId: resolvedAdwId,
    prDetails,
    unaddressedComments,
    worktreePath,
    logsDir,
    orchestratorStatePath,
    ctx,
  };
}
