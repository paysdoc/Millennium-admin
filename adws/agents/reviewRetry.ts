/**
 * Review-patch retry loop for automated review and patching.
 * Modeled on testRetry.ts. Iterates: review → patch blockers → commit+push → re-review.
 */

import { log, AgentStateManager, type IssueClassSlashCommand, type ModelUsageMap, mergeModelUsageMaps, emptyModelUsageMap, persistTokenCounts } from '../core';
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

function initState(statePath: string, agentName: 'review-agent' | 'patch-agent'): string {
  const adwId = AgentStateManager.readState(statePath)?.adwId || '';
  return AgentStateManager.initializeState(adwId, agentName, statePath);
}

export async function runReviewWithRetry(opts: ReviewRetryOptions): Promise<ReviewRetryResult> {
  const {
    adwId, specFile, logsDir, orchestratorStatePath: statePath,
    maxRetries, branchName, issueType, issueContext, onReviewFailed, cwd,
  } = opts;

  let retryCount = 0;
  let costUsd = 0;
  let lastBlockerIssues: ReviewIssue[] = [];
  let modelUsage = emptyModelUsageMap();

  while (retryCount < maxRetries) {
    log(`Running review (attempt ${retryCount + 1}/${maxRetries})...`, 'info');
    AgentStateManager.appendLog(statePath, `Review attempt ${retryCount + 1}/${maxRetries}`);

    const reviewResult = await runReviewAgent(
      adwId, specFile, logsDir, initState(statePath, 'review-agent'), cwd,
    );
    costUsd += reviewResult.totalCostUsd || 0;
    if (reviewResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, reviewResult.modelUsage);
    persistTokenCounts(statePath, costUsd, modelUsage);

    if (reviewResult.passed) {
      log('Review passed — no blocker issues found!', 'success');
      AgentStateManager.appendLog(statePath, 'Review passed');
      return { passed: true, costUsd, totalRetries: retryCount, blockerIssues: [], modelUsage };
    }

    lastBlockerIssues = reviewResult.blockerIssues;
    log(`${lastBlockerIssues.length} blocker issue(s) found, patching...`, 'info');
    AgentStateManager.appendLog(statePath, `${lastBlockerIssues.length} blocker issue(s) found`);

    // Patch each blocker issue
    for (const blockerIssue of lastBlockerIssues) {
      log(`Patching blocker #${blockerIssue.review_issue_number}: ${blockerIssue.issue_description}`, 'info');
      AgentStateManager.appendLog(statePath, `Patching blocker #${blockerIssue.review_issue_number}`);

      const patchResult = await runPatchAgent(
        adwId, blockerIssue, logsDir, specFile, undefined, initState(statePath, 'patch-agent'), cwd,
      );
      costUsd += patchResult.totalCostUsd || 0;
      if (patchResult.modelUsage) modelUsage = mergeModelUsageMaps(modelUsage, patchResult.modelUsage);
      persistTokenCounts(statePath, costUsd, modelUsage);

      const msg = patchResult.success ? 'Patch applied for' : 'Patch failed for';
      log(`${msg} blocker #${blockerIssue.review_issue_number}`, patchResult.success ? 'success' : 'error');
      AgentStateManager.appendLog(statePath, `${msg} blocker #${blockerIssue.review_issue_number}`);
    }

    // Commit and push changes before re-review
    await runCommitAgent('review-agent', issueType, issueContext, logsDir, undefined, cwd);
    pushBranch(branchName, cwd);
    log('Changes committed and pushed', 'success');
    AgentStateManager.appendLog(statePath, 'Patch changes committed and pushed');

    onReviewFailed?.(retryCount + 1, maxRetries);
    retryCount++;
  }

  log(`Review still has blockers after ${maxRetries} attempts`, 'error');
  AgentStateManager.appendLog(statePath, `Review still has blockers after ${maxRetries} attempts`);
  return { passed: false, costUsd, totalRetries: retryCount, blockerIssues: lastBlockerIssues, modelUsage };
}
