# Feature: Run ADW Workflow in GitHub Worktree

## Feature Description
Update the main ADW orchestrator workflows (`adwPlanBuild.tsx` and `adwPlanBuildTest.tsx`) to execute in a separate git worktree instead of changing branches in the main repository. This enables multiple ADW workflows to run concurrently without interfering with each other or the developer's working directory. Work trees are local-only and provide isolated working directories for each workflow branch.

## User Story
As a developer or automated workflow
I want ADW workflows to run in isolated git worktrees
So that the main repository remains on its current branch and multiple workflows can run in parallel without conflicts

## Problem Statement
Currently, when an ADW workflow is triggered, it calls `checkoutDefaultBranch()` and `createFeatureBranch()` which directly modifies the branch state of the main repository. This causes several problems:
1. The developer's working directory is unexpectedly switched to a different branch
2. Multiple concurrent ADW workflows would conflict with each other
3. Any uncommitted work in the developer's directory could be affected
4. The repository cannot be used for other work while an ADW workflow is running

## Solution Statement
Implement git worktree support for ADW orchestrators:
1. Create a new `worktreeOperations.ts` module with functions to manage git worktrees
2. Modify orchestrators to create a worktree based on the default branch for each workflow
3. Execute all subprocess commands (adwPlan, adwBuild, adwTest) within the worktree directory
4. If a worktree for the target branch already exists, log a warning and reuse it
5. Clean up worktrees when their associated PR is closed (via webhook trigger)
6. The main repository base directory never changes branch

## Relevant Files
Use these files to implement the feature:

- `adws/adwPlanBuild.tsx` - Main orchestrator that needs to create/use worktree and pass working directory to subprocesses
- `adws/adwPlanBuildTest.tsx` - Main orchestrator with test phase, needs same worktree integration
- `adws/adwPrReview.tsx` - PR review orchestrator, needs worktree support for existing branches
- `adws/adwPlan.tsx` - Planning phase, needs to work within provided worktree directory instead of calling checkoutDefaultBranch
- `adws/adwBuild.tsx` - Build phase, needs to work within provided worktree directory
- `adws/adwTest.tsx` - Test phase, needs to work within provided worktree directory
- `adws/github/gitOperations.ts` - Contains current branch operations (`checkoutDefaultBranch`, `createFeatureBranch`), will be extended
- `adws/triggers/trigger_webhook.ts` - Webhook handler, needs to handle worktree cleanup when PR is closed
- `adws/core/config.ts` - Configuration constants, needs worktree directory path
- `adws/github/index.ts` - Exports from github module, needs to export new worktree functions

### New Files
- `adws/github/worktreeOperations.ts` - New module containing all worktree management functions
- `adws/__tests__/worktreeOperations.test.ts` - Unit tests for the worktree operations module

## Implementation Plan
### Phase 1: Foundation
Create the worktree operations module with all necessary git worktree management functions. This includes creating, listing, checking existence, and removing worktrees. Add configuration for the worktrees base directory.

### Phase 2: Core Implementation
Modify the orchestrator scripts (`adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPrReview.tsx`) to use worktrees. Update subprocess execution to run within the worktree directory by passing the `cwd` option to `execSync`.

### Phase 3: Integration
Update the webhook trigger to clean up worktrees when PRs are closed. Ensure all subprocesses (adwPlan, adwBuild, adwTest) receive and use the worktree path correctly. Handle edge cases like existing worktrees and recovery scenarios.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add worktrees directory configuration
- Edit `adws/core/config.ts` to add `WORKTREES_DIR` constant
- Set the default path to `.worktrees` in the project root (relative to `process.cwd()`)
- This keeps worktrees local to the repository and easy to find/manage

### Step 2: Create worktreeOperations.ts module
- Create new file `adws/github/worktreeOperations.ts`
- Implement the following functions:
  - `getWorktreePath(branchName: string): string` - Returns the path where a worktree for the given branch should be located
  - `worktreeExists(branchName: string): boolean` - Checks if a worktree already exists for the branch
  - `listWorktrees(): string[]` - Lists all existing worktrees
  - `createWorktree(branchName: string, baseBranch?: string): string` - Creates a new worktree for the branch, returns the worktree path. If baseBranch is provided, creates the worktree based on that branch.
  - `createWorktreeForNewBranch(branchName: string): string` - Creates a worktree and a new branch in one operation
  - `removeWorktree(branchName: string): boolean` - Removes a worktree for the given branch
  - `getWorktreeForBranch(branchName: string): string | null` - Gets existing worktree path for a branch if it exists
- All functions should use `execSync` from `child_process` to run git commands
- Add proper error handling and logging using the existing `log` utility

### Step 3: Create unit tests for worktreeOperations
- Create new file `adws/__tests__/worktreeOperations.test.ts`
- Write tests for each function:
  - Test `getWorktreePath` returns correct path format
  - Test `worktreeExists` returns false for non-existent worktree
  - Test `createWorktree` creates worktree successfully (mock execSync)
  - Test `removeWorktree` removes worktree successfully (mock execSync)
  - Test error handling for git command failures
- Use Jest mocks for `execSync` to avoid actual git operations in tests

### Step 4: Export worktree functions from github module
- Edit `adws/github/index.ts` to export all functions from `worktreeOperations.ts`
- Add exports: `getWorktreePath`, `worktreeExists`, `listWorktrees`, `createWorktree`, `createWorktreeForNewBranch`, `removeWorktree`, `getWorktreeForBranch`

### Step 5: Update adwPlanBuild.tsx to use worktrees
- Import worktree functions from `./github`
- Add `worktreePath` variable to track the working directory
- Before running subprocess commands:
  1. Get the default branch name using `getDefaultBranch()`
  2. Generate the feature branch name
  3. Check if worktree already exists using `worktreeExists(branchName)`
  4. If exists, log warning and get existing path with `getWorktreeForBranch(branchName)`
  5. If not exists, create worktree with `createWorktree(branchName, defaultBranch)`
- Modify `runSubprocess` function to accept optional `cwd` parameter
- Pass `worktreePath` as `cwd` to all subprocess executions
- Log the worktree path for visibility

### Step 6: Update adwPlanBuildTest.tsx to use worktrees
- Apply the same changes as Step 5:
  - Import worktree functions
  - Create/get worktree before subprocesses
  - Pass worktree path as `cwd` to subprocess executions
  - Log worktree path

### Step 7: Update adwPrReview.tsx to use worktrees
- Import worktree functions
- For PR review, the branch already exists (it's the PR head branch)
- Check if worktree exists for the PR branch
- If exists, log warning and use existing worktree
- If not exists, create worktree for the existing branch
- Update all subprocess and git operations to use the worktree path
- Note: `checkoutBranch` call should be replaced with worktree creation

### Step 8: Update adwPlan.tsx to accept working directory
- Add command line argument for working directory: `[--cwd <path>]`
- If `--cwd` is provided, use that as the working directory for all git operations
- Remove or conditionally skip `checkoutDefaultBranch()` when `--cwd` is provided (worktree already has correct branch)
- Update `createFeatureBranch` to work within the specified directory
- Ensure all git operations use the provided working directory

### Step 9: Update adwBuild.tsx to accept working directory
- Add command line argument for working directory: `[--cwd <path>]`
- If `--cwd` is provided, use that as the working directory for all operations
- Update any git operations to use the provided working directory
- Ensure file operations (reading plan, writing code) use the correct directory

### Step 10: Update adwTest.tsx to accept working directory
- Add command line argument for working directory: `[--cwd <path>]`
- If `--cwd` is provided, use that as the working directory for test execution
- Update any git operations to use the provided working directory

### Step 11: Update trigger_webhook.ts for worktree cleanup
- In the `handlePullRequestEvent` function, when a PR is closed:
  1. Extract the head branch name from the PR payload
  2. Import and call `removeWorktree(branchName)` to clean up
  3. Log the cleanup action
  4. Continue with existing issue closure logic
- Handle cases where worktree doesn't exist (PR might have been created manually)

### Step 12: Update gitOperations.ts functions for worktree support
- Modify functions that run git commands to accept optional `cwd` parameter:
  - `getCurrentBranch(cwd?: string)`
  - `commitChanges(message: string, cwd?: string)`
  - `pushBranch(branchName: string, cwd?: string)`
- Pass `cwd` option to `execSync` calls when provided
- This allows git operations to work within worktree directories

### Step 13: Add .worktrees to .gitignore
- Edit `.gitignore` to add `.worktrees/` directory
- This ensures worktrees are not tracked by git (they're local-only)

### Step 14: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all tests pass with zero regressions

## Testing Strategy
### Unit Tests
- Test `getWorktreePath` returns correct path format: `.worktrees/{branch-name}`
- Test `worktreeExists` correctly identifies existing and non-existing worktrees
- Test `createWorktree` executes correct git commands and returns path
- Test `createWorktreeForNewBranch` creates both worktree and new branch
- Test `removeWorktree` executes correct git command and handles missing worktree
- Test `listWorktrees` parses git output correctly
- Test error handling when git commands fail

### Integration Tests
- Test full workflow execution in worktree (manual verification)
- Test that main repository branch is unchanged after workflow
- Test worktree cleanup when PR is closed
- Test handling of existing worktrees (warning logged, worktree reused)

### Edge Cases
- Worktree already exists for branch (recovery scenario, PR review on existing branch)
- Branch doesn't exist yet (new feature workflow)
- Worktree removal fails (directory in use, permissions)
- Git worktree command not available (older git version)
- Multiple workflows triggered simultaneously for different issues
- Worktree directory manually deleted but git still tracks it

## Acceptance Criteria
- ADW workflows (`adwPlanBuild`, `adwPlanBuildTest`) run in git worktrees instead of switching branches in main repo
- Main repository branch is never changed by ADW workflow execution
- Worktrees are created in `.worktrees/` directory with branch name as subdirectory
- If worktree already exists for a branch, a warning is logged and the existing worktree is used
- When a PR is closed (merged or not), its associated worktree is removed
- All subprocess commands (adwPlan, adwBuild, adwTest) execute in the worktree directory
- `adwPrReview` workflow also uses worktrees for isolated execution
- Unit tests cover all new worktree operation functions
- All existing tests continue to pass
- Lint and build commands pass without errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- Git worktrees require git version 2.5 or later. Most modern systems have this.
- The `.worktrees/` directory is added to `.gitignore` to keep worktrees local-only
- Worktree paths use the branch name as the directory name, with special characters replaced (e.g., `feature/issue-51-run-adw-workflow` becomes `feature-issue-51-run-adw-workflow`)
- The worktree approach allows multiple ADW workflows to run in parallel for different issues
- Recovery scenarios (where a workflow is resuming) may have existing worktrees - this is handled by reusing them
- Manual cleanup of `.worktrees/` directory is safe - git worktree commands will handle orphaned references
- If a worktree cleanup fails during PR close, it's logged but doesn't block the issue closure
- Consider future enhancement: periodic cleanup of orphaned worktrees (worktrees for branches that no longer exist)
