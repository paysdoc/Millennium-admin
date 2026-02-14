/**
 * PR creation phase function for the standard workflow.
 *
 * Handles creating pull requests after successful build and test phases.
 */

import {
  log,
  shouldExecuteStage,
} from '../core';
import {
  postWorkflowComment,
  createPullRequest,
} from '../github';
import type { WorkflowConfig } from './phaseUtils';

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
