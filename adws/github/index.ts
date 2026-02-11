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
  fetchIssueCommentsRest,
  deleteIssueComment,
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
  mergeLatestFromDefaultBranch,
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
  getWorktreesDir,
  copyEnvToWorktree,
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
  ADW_SIGNATURE,
  ADW_SIGNATURE_PATTERN,
  truncateText,
  isAdwComment,
  isAdwRunningForIssue,
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
