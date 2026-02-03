# Bug: Fix worktree edge case when branch is already checked out

## Bug Description
When the `ensureWorktree` function attempts to create a worktree for an existing branch that is already checked out (either in the main repository or another worktree), the `git worktree add` command fails. Git does not allow the same branch to be checked out in multiple places simultaneously.

**Symptoms:**
- ADW workflow fails with a git error when trying to create a worktree for a branch that's already checked out elsewhere
- Error message similar to: `fatal: '{branchName}' is already checked out at '/path/to/main/repo'`

**Expected Behavior:**
- If the branch is checked out in the main repository, the function should:
  1. Push any uncommitted changes in the main repository
  2. Switch the main repository to the default branch
  3. Create the worktree for the target branch

**Actual Behavior:**
- The `createWorktree` function throws an error because `git worktree add` fails when the branch is already checked out

## Problem Statement
The `ensureWorktree` function (line 248 in `worktreeOperations.ts`) handles the case where a worktree already exists for a branch by reusing it. However, there's no handling for the case where:
1. The branch exists but is already checked out in the main repository
2. The branch exists but is already checked out in a different worktree (not the expected worktree path)

In these cases, `git worktree add` fails and the workflow cannot proceed.

## Solution Statement
Modify the `createWorktree` function to detect when the target branch is already checked out elsewhere and handle it appropriately:

1. Add a new helper function `isBranchCheckedOutElsewhere` to detect if a branch is checked out in the main repository or another worktree
2. Add a new helper function `getMainRepoPath` to get the path of the main repository
3. When a branch is checked out in the main repository:
   - Check for uncommitted changes and commit/push them if needed
   - Switch the main repository to the default branch
   - Then create the worktree for the target branch
4. When a branch is checked out in another worktree:
   - Detect and reuse that existing worktree instead of creating a new one

## Steps to Reproduce
1. Check out a feature branch in the main repository (e.g., `git checkout feature/issue-51`)
2. Run an ADW workflow that tries to create a worktree for the same branch
3. The workflow fails with: `fatal: 'feature/issue-51' is already checked out at '/path/to/repo'`

## Root Cause Analysis
The root cause is in the `createWorktree` function (`worktreeOperations.ts:100-141`):

1. At line 124-126, when a branch exists, it runs `git worktree add "{worktreePath}" {branchName}`
2. Git has a safety feature that prevents a branch from being checked out in multiple locations simultaneously
3. If the branch is already checked out anywhere (main repo or another worktree), this command fails
4. The `ensureWorktree` function only checks if a worktree at the expected path exists (`getWorktreeForBranch`), but doesn't check if the branch is checked out elsewhere

The fix needs to:
- Detect when the branch is checked out elsewhere before attempting `git worktree add`
- Handle the main repository case by switching it to the default branch first
- Handle the other worktree case by reusing the existing worktree

## Relevant Files
Use these files to fix the bug:

- `adws/github/worktreeOperations.ts` - Contains the `ensureWorktree`, `createWorktree`, and related functions. This is the primary file that needs modification to handle the edge case.
- `adws/github/gitOperations.ts` - Contains `getDefaultBranch`, `getCurrentBranch`, `pushBranch`, and `checkoutDefaultBranch` functions that can be leveraged for the fix.
- `adws/__tests__/worktreeOperations.test.ts` - Contains unit tests for worktree operations. Needs new tests for the edge case.
- `adws/github/index.ts` - Exports the worktree operations. May need to export new helper functions.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add helper function to check if branch is checked out elsewhere
- Add a new function `isBranchCheckedOutElsewhere(branchName: string): { checkedOut: boolean; path: string | null; isMainRepo: boolean }` to `worktreeOperations.ts`
- This function should parse `git worktree list --porcelain` output to find where the branch is checked out
- Return the path where it's checked out and whether it's the main repository
- The function should check both the `branch` line in porcelain output and compare paths

### Step 2: Add helper function to get main repository path
- Add a new function `getMainRepoPath(): string` to `worktreeOperations.ts`
- This function should return the path of the main repository (first worktree listed, which doesn't contain `.worktrees`)
- Parse `git worktree list --porcelain` to get the main worktree path

### Step 3: Add helper function to free branch from main repository
- Add a new function `freeBranchFromMainRepo(branchName: string): void` to `worktreeOperations.ts`
- This function should:
  - Import and use `getDefaultBranch` from `gitOperations.ts`
  - Check for uncommitted changes in the main repo using `git status --porcelain`
  - If there are changes, stage and commit them with a message like `"WIP: auto-commit before switching to worktree"`
  - Push the branch to origin
  - Checkout the default branch in the main repository
- Handle errors appropriately and provide meaningful error messages

### Step 4: Update createWorktree to handle branch checked out elsewhere
- Modify the `createWorktree` function to check if the branch is checked out elsewhere before attempting `git worktree add`
- If the branch is checked out in the main repository:
  - Call `freeBranchFromMainRepo` to switch main repo to default branch
  - Then proceed with creating the worktree
- If the branch is checked out in another worktree:
  - Return that worktree path with a log message indicating reuse
- Only proceed with `git worktree add` if the branch is not checked out elsewhere

### Step 5: Update getWorktreeForBranch to check all worktrees by branch name
- Modify `getWorktreeForBranch` to also check if the branch is checked out in any worktree (not just the expected path)
- Return the actual path where the branch is checked out, if any
- This allows reusing existing worktrees even if they're at unexpected paths

### Step 6: Export new helper functions
- Update `adws/github/index.ts` to export the new helper functions if they need to be used externally
- At minimum, export `isBranchCheckedOutElsewhere` and `getMainRepoPath` for testing purposes

### Step 7: Add unit tests for isBranchCheckedOutElsewhere
- Add a new `describe` block in `worktreeOperations.test.ts` for `isBranchCheckedOutElsewhere`
- Test case: returns `{ checkedOut: false, path: null, isMainRepo: false }` when branch is not checked out anywhere
- Test case: returns `{ checkedOut: true, path: '/main/repo', isMainRepo: true }` when branch is checked out in main repo
- Test case: returns `{ checkedOut: true, path: '/worktrees/branch', isMainRepo: false }` when branch is checked out in another worktree

### Step 8: Add unit tests for getMainRepoPath
- Add a new `describe` block for `getMainRepoPath`
- Test case: correctly identifies and returns the main repository path
- Test case: handles error gracefully when git command fails

### Step 9: Add unit tests for freeBranchFromMainRepo
- Add a new `describe` block for `freeBranchFromMainRepo`
- Test case: commits and pushes changes when there are uncommitted changes
- Test case: skips commit when there are no changes
- Test case: switches main repo to default branch
- Test case: throws error with meaningful message on failure

### Step 10: Add unit tests for the edge case in createWorktree
- Add test case: `'handles branch already checked out in main repository'`
  - Mock scenario where branch exists and is checked out in main repo
  - Verify `freeBranchFromMainRepo` is called
  - Verify worktree is created successfully after freeing the branch
- Add test case: `'reuses worktree when branch is checked out in different worktree path'`
  - Mock scenario where branch is checked out in an existing worktree at a different path
  - Verify the existing worktree path is returned

### Step 11: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

### Manual Validation Steps
To manually reproduce and verify the fix:
1. Checkout a feature branch in the main repository: `git checkout feature/test-branch`
2. Run the ADW workflow or call `ensureWorktree('feature/test-branch')` directly
3. Verify the workflow:
   - Detects the branch is checked out in main repo
   - Switches main repo to default branch
   - Creates worktree for the feature branch
4. Verify the main repository is now on the default branch
5. Verify the worktree exists at the expected path with the feature branch

## Notes
- The fix should be minimal and surgical - only handle the specific edge case without changing the overall workflow
- The `freeBranchFromMainRepo` function should be cautious about auto-committing changes - the commit message should clearly indicate it was an automatic WIP commit
- Consider logging all operations clearly so developers can understand what happened if something goes wrong
- The fix assumes the main repository checkout of the branch was unintentional or temporary - in production workflows, branches should typically only be checked out in worktrees
- Import `getDefaultBranch` from `gitOperations.ts` rather than duplicating the logic
- No new external libraries are required for this fix
