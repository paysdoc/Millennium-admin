/**
 * Git operations for branch management and commits.
 * Barrel re-export file for backward compatibility.
 */

// Branch operations
export { getCurrentBranch, generateBranchName, generateFeatureBranchName, createFeatureBranch, checkoutBranch, getDefaultBranch, inferIssueTypeFromBranch, checkoutDefaultBranch, mergeLatestFromDefaultBranch } from './gitBranch';

// Commit and push operations
export { commitChanges, pushBranch } from './gitCommit';
