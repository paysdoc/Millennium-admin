/**
 * Workflow comment formatting and posting functions.
 * Re-exports from focused modules for backwards compatibility.
 */

// Base utilities and parsing
export {
  STAGE_ORDER,
  truncateText,
  parseWorkflowStageFromComment,
  extractAdwIdFromComment,
  extractBranchNameFromComment,
  extractPrUrlFromComment,
  extractPlanPathFromComment,
  detectRecoveryState,
} from './workflowCommentsBase';

// Issue workflow comments
export {
  type WorkflowContext,
  formatResumingComment,
  formatWorkflowComment,
  postWorkflowComment,
} from './workflowCommentsIssue';

// PR review workflow comments
export {
  type PRReviewWorkflowContext,
  formatPRReviewWorkflowComment,
  postPRWorkflowComment,
} from './workflowCommentsPR';
