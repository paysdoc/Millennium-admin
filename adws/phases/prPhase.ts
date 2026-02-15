/**
 * PR creation phase for workflows.
 */

import {
  log,
  shouldExecuteStage,
} from '../core';
import {
  createPullRequest,
  postWorkflowComment,
} from '../github';
import type { WorkflowConfig } from './workflowLifecycle';

/**
 * Executes the PR phase: create pull request.
 */
export function executePRPhase(config: WorkflowConfig): void {
  const { recoveryState, issueNumber, issue, ctx, defaultBranch, worktreePath } = config;

  if (shouldExecuteStage('pr_created', recoveryState)) {
    postWorkflowComment(issueNumber, 'pr_creating', ctx);
    log('Creating Pull Request...', 'info');

    const prUrl = createPullRequest(issue, '', '', defaultBranch, worktreePath);
    ctx.prUrl = prUrl;

    postWorkflowComment(issueNumber, 'pr_created', ctx);
    log(`Pull Request created: ${prUrl}`, 'success');
  } else {
    log('Skipping PR creation (already completed)', 'info');
  }
}
