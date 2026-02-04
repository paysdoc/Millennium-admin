# Bug: Worktree problems - .env copy, PR creation cwd, and cleanup on PR closure

## Bug Description
There are three related issues with the worktree solution for ADWs:

1. **.env file not copied to worktree**: When a worktree is created, the `.env` file (which is in `.gitignore`) is not copied from the main repository. This causes environment-related failures in the worktree because environment variables are not available.

2. **ADW reverts to main worktree before PR creation**: The `createPullRequest` function calls `getCurrentBranch()` and `pushBranch()` without passing a `cwd` parameter. This means these operations run in the main working directory instead of the worktree, causing the PR to be created from the wrong context.

3. **Worktree not cleaned up on PR closure**: While cleanup code exists in `trigger_webhook.ts`, the `WORKTREES_DIR` is based on `process.cwd()`. When the webhook server runs, its working directory may differ from the main repository, causing worktree path resolution to fail and leaving orphaned worktrees.

**Expected Behavior:**
- `.env` file should be automatically copied from main repo to worktree after worktree creation
- PR creation should execute in the worktree context, not the main repo context
- Worktrees should be properly located and removed when their associated PR is closed

**Actual Behavior:**
- `.env` is missing in worktrees, causing environment-related errors
- PR creation operations may fail or behave unexpectedly due to wrong working directory
- Worktrees persist after PR closure because they cannot be found

## Problem Statement
Three distinct issues need to be addressed:

1. In `worktreeOperations.ts`, after `git worktree add` succeeds, there's no code to copy the `.env` file from the main repository to the new worktree.

2. In `pullRequestCreator.ts`, the `createPullRequest` function (line 51-87) calls `getCurrentBranch()` (line 57) and `pushBranch()` (line 67) without a `cwd` parameter, causing them to operate on `process.cwd()` instead of the worktree.

3. In `config.ts`, `WORKTREES_DIR` is defined as `path.join(process.cwd(), '.worktrees')`. When used by the webhook trigger, `process.cwd()` may not be the main repository path, causing `removeWorktree()` to look in the wrong location.

## Solution Statement
1. **Copy .env to worktree**: Add a helper function `copyEnvToWorktree` that copies the `.env` file from the main repository to the worktree. Call this function after worktree creation in `ensureWorktree`.

2. **Fix PR creation cwd**: Update `createPullRequest` to accept an optional `cwd` parameter and pass it to `getCurrentBranch()` and `pushBranch()`. Update the orchestrators to pass the worktree path when calling `createPullRequest`.

3. **Fix worktree cleanup**: Create a new function `getWorktreesDir()` that uses `getMainRepoPath()` to determine the worktrees directory relative to the git repository, not `process.cwd()`. Update `removeWorktree` and related functions to use this.

## Steps to Reproduce

### Bug 1: .env not copied
1. Create a worktree: `ensureWorktree('feature/test-branch', 'main')`
2. Check if `.env` exists in the worktree: `ls -la .worktrees/feature-test-branch/.env`
3. Observe that `.env` does not exist

### Bug 2: PR creation wrong cwd
1. Start an ADW workflow that creates a worktree
2. Let it complete to the PR creation phase
3. Observe that `getCurrentBranch()` is called without cwd, potentially getting the wrong branch

### Bug 3: Worktree not cleaned up
1. Start the webhook server from a directory other than the main repo
2. Close a PR via webhook
3. Observe that `removeWorktree` fails to find the worktree because `WORKTREES_DIR` points to wrong location

## Root Cause Analysis

### Bug 1: Missing .env copy
- **Root Cause**: `createWorktree` and `ensureWorktree` in `worktreeOperations.ts` only run `git worktree add` without any post-processing
- **Why it fails**: `.env` is in `.gitignore` (line 46: `// environment .env`), so git doesn't include it in worktrees
- **Location**: `worktreeOperations.ts:227-286` (createWorktree) and `worktreeOperations.ts:412-421` (ensureWorktree)

### Bug 2: PR creation cwd
- **Root Cause**: `createPullRequest` function signature doesn't accept a `cwd` parameter
- **Why it fails**: `getCurrentBranch()` at line 57 and `pushBranch()` at line 67 default to `process.cwd()` which is the main repo, not the worktree
- **Location**: `pullRequestCreator.ts:51-87`

### Bug 3: Worktree cleanup path resolution
- **Root Cause**: `WORKTREES_DIR` in `config.ts:30` is `path.join(process.cwd(), '.worktrees')`
- **Why it fails**: When webhook server runs, its `process.cwd()` may not match the main repository path
- **Location**: `config.ts:30`, used by `getWorktreePath()` at `worktreeOperations.ts:157-160`

## Relevant Files
Use these files to fix the bug:

- `adws/github/worktreeOperations.ts` - Primary file for worktree creation. Needs:
  - New `copyEnvToWorktree` helper function
  - New `getWorktreesDir` function that uses git repo path instead of `process.cwd()`
  - Update `ensureWorktree` to copy .env after worktree creation
  - Update `getWorktreePath` and `removeWorktree` to use dynamic worktrees directory
- `adws/github/pullRequestCreator.ts` - PR creation logic. Needs:
  - Add `cwd` parameter to `createPullRequest` function
  - Pass `cwd` to `getCurrentBranch` and `pushBranch` calls
- `adws/adwPlanBuild.tsx` - Orchestrator that calls `createPullRequest`. Needs:
  - Pass `worktreePath` to `createPullRequest`
- `adws/adwPlanBuildTest.tsx` - Orchestrator that calls `createPullRequest`. Needs:
  - Pass `worktreePath` to `createPullRequest`
- `adws/core/config.ts` - Configuration file. For reference only (WORKTREES_DIR will be deprecated in favor of dynamic resolution)
- `adws/__tests__/worktreeOperations.test.ts` - Unit tests for worktree operations. Needs:
  - Tests for `copyEnvToWorktree`
  - Tests for `getWorktreesDir`
- `adws/triggers/trigger_webhook.ts` - Webhook trigger. For verification that cleanup works after fix.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add helper function to get worktrees directory dynamically
- Add a new function `getWorktreesDir(): string` in `worktreeOperations.ts`
- Use `getMainRepoPath()` to get the main repository path
- Return `path.join(mainRepoPath, '.worktrees')`
- This replaces the static `WORKTREES_DIR` from config for runtime operations

### Step 2: Update getWorktreePath to use dynamic worktrees directory
- Modify `getWorktreePath(branchName: string)` in `worktreeOperations.ts`
- Replace `WORKTREES_DIR` with `getWorktreesDir()`
- This ensures worktree paths are always relative to the actual git repository

### Step 3: Add helper function to copy .env to worktree
- Add a new function `copyEnvToWorktree(worktreePath: string): void` in `worktreeOperations.ts`
- Get the main repo path using `getMainRepoPath()`
- Check if `.env` exists in the main repo at `path.join(mainRepoPath, '.env')`
- If it exists, copy it to `path.join(worktreePath, '.env')`
- Log the operation for debugging
- Handle errors gracefully (log warning but don't throw if copy fails)

### Step 4: Update ensureWorktree to copy .env after creation
- In `ensureWorktree` function, after successfully creating or reusing a worktree:
- Call `copyEnvToWorktree(worktreePath)` before returning
- This ensures .env is always present in the worktree

### Step 5: Update createPullRequest to accept cwd parameter
- Modify `createPullRequest` function signature in `pullRequestCreator.ts`:
  - From: `createPullRequest(issue, planSummary, buildSummary, baseBranch?)`
  - To: `createPullRequest(issue, planSummary, buildSummary, baseBranch?, cwd?)`
- Pass `cwd` to `getCurrentBranch(cwd)` at line 57
- Pass `cwd` to `pushBranch(branchName, cwd)` at line 67
- Add `cwd` option to `execSync` call for `gh pr create` at line 69-72

### Step 6: Update adwPlanBuild.tsx to pass worktreePath to createPullRequest
- In the `main()` function, find the `createPullRequest` call (around line 149)
- Pass `worktreePath` as the `cwd` parameter:
  - From: `createPullRequest(issue, '', '')`
  - To: `createPullRequest(issue, '', '', 'develop', worktreePath)`

### Step 7: Update adwPlanBuildTest.tsx to pass worktreePath to createPullRequest
- In the `main()` function, find the `createPullRequest` call (around line 170)
- Pass `worktreePath` as the `cwd` parameter:
  - From: `createPullRequest(issue, '', '')`
  - To: `createPullRequest(issue, '', '', 'develop', worktreePath)`

### Step 8: Add unit tests for getWorktreesDir
- Add a new `describe` block in `worktreeOperations.test.ts` for `getWorktreesDir`
- Test case: returns path based on main repo path, not process.cwd()
- Mock `getMainRepoPath` to return a known path and verify result

### Step 9: Add unit tests for copyEnvToWorktree
- Add a new `describe` block for `copyEnvToWorktree`
- Test case: copies .env when it exists in main repo
- Test case: does nothing when .env doesn't exist (no error)
- Test case: handles copy errors gracefully (logs warning, doesn't throw)
- Mock `fs.existsSync`, `fs.copyFileSync`, and `getMainRepoPath`

### Step 10: Export new functions from index.ts
- Update `adws/github/index.ts` to export `copyEnvToWorktree` and `getWorktreesDir`
- These may be useful for testing or external use

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
To manually verify the fixes:

**Bug 1 - .env copy:**
1. Create a worktree: `npx tsx -e "import { ensureWorktree } from './adws/github'; ensureWorktree('test-branch', 'main');"`
2. Check if .env exists: `ls -la .worktrees/test-branch/.env`
3. Verify .env was copied from main repo

**Bug 2 - PR creation cwd:**
1. Start an ADW workflow in verbose mode
2. Monitor that getCurrentBranch and pushBranch are called with correct cwd
3. Verify PR is created successfully with correct branch

**Bug 3 - Worktree cleanup:**
1. Create a worktree, then close its PR
2. Verify worktree is removed by webhook handler
3. Test by running webhook from a different directory

## Notes
- The `WORKTREES_DIR` constant in `config.ts` will still exist but should only be used for initial directory creation. Runtime operations should use `getWorktreesDir()`.
- The `.env` copy is best-effort - if it fails, the workflow continues with a warning. This prevents blocking workflows for missing optional environment files.
- Error handling for the .env copy should be robust since .env might not exist in all environments (e.g., CI).
- No new external libraries are required for this fix.
- The fixes are surgical and minimal - they address only the specific bugs without refactoring unrelated code.
