/**
 * Review-patch retry loop for automated review and patching.
 * Modeled on testRetry.ts. Iterates: review -> patch blockers -> commit+push -> re-review.
 */

import { log, AgentStateManager, type IssueClassSlashCommand, type ModelUsageMap } from '../core';
import { retryRecursive, reduceAsync, addCost, emptyRetryCost, type RetryCost } from '../core/retryUtils';
import { runReviewAgent, type ReviewIssue } from './reviewAgent';
import { runPatchAgent } from './patchAgent';
import { runCommitAgent } from './gitAgent';
import { pushBranch } from '../github';

export interface ReviewRetryResult {
  passed: boolean;
  costUsd: number;
  totalRetries: number;
  blockerIssues: ReviewIssue[];
  modelUsage: ModelUsageMap;
}

export interface ReviewRetryOptions {
  adwId: string;
  specFile: string;
  logsDir: string;
  orchestratorStatePath: string;
  maxRetries: number;
  branchName: string;
  issueType: IssueClassSlashCommand;
  issueContext: string;
  onReviewFailed?: (attempt: number, maxAttempts: number) => void;
  cwd?: string;
}

const initState = (statePath: string, agentName: 'review-agent' | 'patch-agent'): string => {
  const adwId = AgentStateManager.readState(statePath)?.adwId || '';
  return AgentStateManager.initializeState(adwId, agentName, statePath);
};

/** Patch all blocker issues sequentially, accumulating costs immutably. */
const patchBlockerIssues = (
  blockerIssues: readonly ReviewIssue[],
  adwId: string,
  logsDir: string,
  specFile: string,
  statePath: string,
  cwd: string | undefined,
): Promise<RetryCost> =>
  reduceAsync(
    blockerIssues,
    async (cost, blockerIssue) => {
      log(`Patching blocker #${blockerIssue.review_issue_number}: ${blockerIssue.issue_description}`, 'info');
      AgentStateManager.appendLog(statePath, `Patching blocker #${blockerIssue.review_issue_number}`);

      const patchResult = await runPatchAgent(
        adwId, blockerIssue, logsDir, specFile, undefined, initState(statePath, 'patch-agent'), cwd,
      );

      const msg = patchResult.success ? 'Patch applied for' : 'Patch failed for';
      log(`${msg} blocker #${blockerIssue.review_issue_number}`, patchResult.success ? 'success' : 'error');
      AgentStateManager.appendLog(statePath, `${msg} blocker #${blockerIssue.review_issue_number}`);

      return addCost(cost, patchResult.totalCostUsd || 0, patchResult.modelUsage);
    },
    emptyRetryCost(),
  );

export async function runReviewWithRetry(opts: ReviewRetryOptions): Promise<ReviewRetryResult> {
  const {
    adwId, specFile, logsDir, orchestratorStatePath: statePath,
    maxRetries, branchName, issueType, issueContext, onReviewFailed, cwd,
  } = opts;

  let cost: RetryCost = emptyRetryCost();
  let lastBlockerIssues: readonly ReviewIssue[] = [];

  const { result: passed, attempts } = await retryRecursive(
    async (attempt) => {
      log(`Running review (attempt ${attempt + 1}/${maxRetries})...`, 'info');
      AgentStateManager.appendLog(statePath, `Review attempt ${attempt + 1}/${maxRetries}`);

      const reviewResult = await runReviewAgent(
        adwId, specFile, logsDir, initState(statePath, 'review-agent'), cwd,
      );
      cost = addCost(cost, reviewResult.totalCostUsd || 0, reviewResult.modelUsage);

      if (reviewResult.passed) {
        log('Review passed — no blocker issues found!', 'success');
        AgentStateManager.appendLog(statePath, 'Review passed');
        lastBlockerIssues = [];
        return { done: true, value: true };
      }

      lastBlockerIssues = reviewResult.blockerIssues;
      log(`${lastBlockerIssues.length} blocker issue(s) found, patching...`, 'info');
      AgentStateManager.appendLog(statePath, `${lastBlockerIssues.length} blocker issue(s) found`);

      const patchCost = await patchBlockerIssues(lastBlockerIssues, adwId, logsDir, specFile, statePath, cwd);
      cost = addCost(cost, patchCost.costUsd, patchCost.modelUsage);

      // Commit and push changes before re-review
      await runCommitAgent('review-agent', issueType, issueContext, logsDir, undefined, cwd);
      pushBranch(branchName, cwd);
      log('Changes committed and pushed', 'success');
      AgentStateManager.appendLog(statePath, 'Patch changes committed and pushed');

      onReviewFailed?.(attempt + 1, maxRetries);
      return { done: false, value: false };
    },
    { maxRetries },
  );

  if (!passed) {
    log(`Review still has blockers after ${maxRetries} attempts`, 'error');
    AgentStateManager.appendLog(statePath, `Review still has blockers after ${maxRetries} attempts`);
  }

  return {
    passed,
    costUsd: cost.costUsd,
    totalRetries: passed ? attempts - 1 : attempts,
    blockerIssues: [...lastBlockerIssues],
    modelUsage: cost.modelUsage,
  };
}
