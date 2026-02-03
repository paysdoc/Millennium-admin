/**
 * GitHub module - GitHub API and git operations.
 */

// GitHub API
export {
  getRepoInfo,
  fetchGitHubIssue,
  fetchPRDetails,
  fetchPRReviews,
  fetchPRReviewComments,
  commentOnPR,
  fetchPRList,
  commentOnIssue,
  type RepoInfo,
} from './githubApi';

// Git Operations
export {
  getCurrentBranch,
  generateBranchName,
  generateFeatureBranchName,
  createFeatureBranch,
  checkoutBranch,
  commitChanges,
  pushBranch,
  getDefaultBranch,
  checkoutDefaultBranch,
  inferIssueTypeFromBranch,
} from './gitOperations';

// Pull Request Creator
export { createPullRequest } from './pullRequestCreator';

// Worktree Operations
export {
  getWorktreePath,
  worktreeExists,
  listWorktrees,
  createWorktree,
  createWorktreeForNewBranch,
  removeWorktree,
  getWorktreeForBranch,
  ensureWorktree,
  getMainRepoPath,
  isBranchCheckedOutElsewhere,
  freeBranchFromMainRepo,
  type BranchCheckoutStatus,
} from './worktreeOperations';

// PR Comment Detector
export {
  getLastAdwCommitTimestamp,
  getUnaddressedComments,
  hasUnaddressedComments,
} from './prCommentDetector';

// Workflow Comments
export {
  STAGE_ORDER,
  parseWorkflowStageFromComment,
  extractAdwIdFromComment,
  extractBranchNameFromComment,
  extractPrUrlFromComment,
  extractPlanPathFromComment,
  detectRecoveryState,
  formatResumingComment,
  formatWorkflowComment,
  postWorkflowComment,
  formatPRReviewWorkflowComment,
  postPRWorkflowComment,
  type WorkflowContext,
  type PRReviewWorkflowContext,
} from './workflowComments';
