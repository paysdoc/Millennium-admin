/**
 * Shared types and utilities for workflow phase modules.
 *
 * Provides the configuration interfaces that are created during
 * initialization and passed to every subsequent phase function.
 */

import type {
  IssueClassSlashCommand,
  GitHubIssue,
  PRDetails,
  PRReviewComment,
  AgentIdentifier,
  RecoveryState,
} from '../core';
import type {
  WorkflowContext,
  PRReviewWorkflowContext,
} from '../github';

/**
 * Configuration shared across all workflow phase functions.
 * Created by initializeWorkflow() and passed to every phase.
 */
export interface WorkflowConfig {
  issueNumber: number;
  adwId: string;
  issue: GitHubIssue;
  issueType: IssueClassSlashCommand;
  worktreePath: string;
  defaultBranch: string;
  logsDir: string;
  orchestratorStatePath: string;
  orchestratorName: AgentIdentifier;
  recoveryState: RecoveryState;
  ctx: WorkflowContext;
  branchName: string;
}

/**
 * Configuration shared across all PR review workflow phase functions.
 * Created by initializePRReviewWorkflow() and passed to every phase.
 */
export interface PRReviewWorkflowConfig {
  prNumber: number;
  issueNumber: number;
  adwId: string;
  prDetails: PRDetails;
  unaddressedComments: PRReviewComment[];
  worktreePath: string;
  logsDir: string;
  orchestratorStatePath: string;
  ctx: PRReviewWorkflowContext;
}
