/**
 * Git worktree operations for ADW workflows.
 *
 * Barrel re-export file for backward compatibility.
 * Implementation is split across:
 * - worktreeUtils.ts: Shared utilities and helpers
 * - worktreeCreate.ts: Worktree creation operations
 * - worktreeCleanup.ts: Worktree cleanup and listing
 */

// Shared utilities and helpers
export {
  type BranchCheckoutStatus,
  getMainRepoPath,
  getWorktreesDir,
  getWorktreePath,
  copyEnvToWorktree,
  worktreeExists,
  isBranchCheckedOutElsewhere,
  freeBranchFromMainRepo,
} from './worktreeUtils';

// Worktree creation operations
export { createWorktree, createWorktreeForNewBranch, ensureWorktree } from './worktreeCreate';

// Worktree cleanup and listing
export { removeWorktree, listWorktrees, getWorktreeForBranch, removeWorktreesForIssue } from './worktreeCleanup';