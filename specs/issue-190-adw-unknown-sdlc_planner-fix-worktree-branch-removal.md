# Bug: ADW does not remove worktree directory or branch on PR close

## Metadata
issueNumber: `190`
adwId: `adw-unknown`
issueJson: `{}`

## Bug Description
When a PR is closed (merged or not), the ADW webhook trigger calls `handlePullRequestEvent()` in `webhookHandlers.ts`, which calls `removeWorktree(headBranch)` to clean up the worktree. However, the worktree directory is not actually removed because:

1. **Running processes block removal:** ADW workflows may spawn long-running processes (e.g., `npm start`, `npx tsx`) in the worktree directory. These processes hold file locks that prevent both `git worktree remove --force` and `fs.rmSync()` from succeeding.
2. **Local branch is never deleted:** After worktree removal, the local git branch remains. The `removeWorktree()` function only handles directory cleanup, not branch deletion.
3. **Remote branch is never deleted:** The remote branch on GitHub is also not deleted during cleanup.

**Expected behavior:** When a PR is closed, the worktree directory should be removed (after killing any running processes), and both the local and remote branches should be deleted.

**Actual behavior:** The worktree directory remains on disk because running processes block removal, and the local/remote branches are never deleted regardless.

## Problem Statement
The worktree cleanup process in `worktreeCleanup.ts` and the PR close handler in `webhookHandlers.ts` do not:
1. Kill processes running inside the worktree directory before attempting removal
2. Delete the local git branch after worktree removal
3. Delete the remote git branch after worktree removal

## Solution Statement
1. Add a `killProcessesInDirectory()` utility function to `worktreeCleanup.ts` that uses `lsof` to find and kill processes with open files in the worktree directory before attempting removal.
2. Add `deleteLocalBranch()` and `deleteRemoteBranch()` functions to `gitOperations.ts` for branch cleanup.
3. Update `removeWorktree()` in `worktreeCleanup.ts` to call `killProcessesInDirectory()` before attempting worktree removal.
4. Update `handlePullRequestEvent()` in `webhookHandlers.ts` to delete both local and remote branches after successful worktree removal.
5. Update `removeWorktreesForIssue()` in `worktreeCleanup.ts` to also delete local branches for each removed worktree.
6. Add unit tests for all new and modified functions.

## Steps to Reproduce
1. Create a GitHub issue and let ADW process it (creating a worktree, starting `npm start` or similar processes in the worktree).
2. Merge or close the PR created by ADW.
3. Observe that the webhook trigger receives the PR close event and calls `handlePullRequestEvent()`.
4. Observe that `removeWorktree()` fails silently because processes are still running in the worktree directory.
5. Observe that the local and remote branches remain even if worktree removal succeeds.

## Root Cause Analysis
The root cause is twofold:

1. **Process interference:** `removeWorktree()` in `worktreeCleanup.ts:19-47` attempts `git worktree remove --force` first, then falls back to `fs.rmSync()`. Both operations fail when processes (spawned by ADW workflows like `npm start` or `npx tsx`) are still running with their CWD or open file handles in the worktree directory. There is no attempt to kill these processes before cleanup.

2. **Missing branch deletion:** Neither `removeWorktree()` in `worktreeCleanup.ts` nor `handlePullRequestEvent()` in `webhookHandlers.ts` performs any branch deletion. The worktree cleanup only handles directory removal, leaving orphaned local and remote branches.

The `removeWorktreesForIssue()` function at `worktreeCleanup.ts:57-100` (called on issue close from `trigger_webhook.ts:241-246`) has the same problems: no process killing and no branch deletion.

## Relevant Files
Use these files to fix the bug:

- `adws/github/worktreeCleanup.ts` - Contains `removeWorktree()` and `removeWorktreesForIssue()` functions. Needs process killing before removal and branch name extraction for branch deletion.
- `adws/github/gitOperations.ts` - Contains git operations (branch creation, push, etc.). Needs new `deleteLocalBranch()` and `deleteRemoteBranch()` functions.
- `adws/triggers/webhookHandlers.ts` - Contains `handlePullRequestEvent()` which handles PR close events. Needs to call branch deletion after worktree cleanup.
- `adws/github/worktreeOperations.ts` - Re-exports from `worktreeCleanup.ts` and `worktreeCreation.ts`. May need to re-export new functions.
- `adws/github/index.ts` - Main exports for the github module. Needs to export new functions.
- `adws/__tests__/worktreeOperations.test.ts` - Existing tests for worktree operations. Needs new tests for process killing and branch deletion.
- `adws/README.md` - Contains ADW documentation. Should be read to understand overall system.
- `guidelines/coding_guidelines.md` - Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `deleteLocalBranch()` and `deleteRemoteBranch()` to `gitOperations.ts`

- Read `adws/github/gitOperations.ts`.
- Add a `deleteLocalBranch(branchName: string): boolean` function:
  - Runs `git branch -D "{branchName}"` to force-delete the local branch.
  - Returns `true` on success, `false` if the branch doesn't exist or deletion fails.
  - Logs the result using the existing `log()` utility.
  - Must NOT attempt to delete protected branches (`main`, `master`, `develop`). Return `false` and log a warning if attempted.
- Add a `deleteRemoteBranch(branchName: string): boolean` function:
  - Runs `git push origin --delete "{branchName}"` to delete the remote branch.
  - Returns `true` on success, `false` if the branch doesn't exist on remote or deletion fails.
  - Logs the result using the existing `log()` utility.
  - Must NOT attempt to delete protected branches (`main`, `master`, `develop`). Return `false` and log a warning if attempted.
- Export both functions from the module.

### Step 2: Export new functions from `github/index.ts`

- Read `adws/github/index.ts`.
- Add `deleteLocalBranch` and `deleteRemoteBranch` to the exports from `./gitOperations`.

### Step 3: Add `killProcessesInDirectory()` to `worktreeCleanup.ts`

- Read `adws/github/worktreeCleanup.ts`.
- Add a `killProcessesInDirectory(directoryPath: string): void` function:
  - Uses `lsof +D "{directoryPath}" -t` to find PIDs of processes with open files in the directory. The `-t` flag outputs only PIDs.
  - If PIDs are found, send `SIGTERM` to each process using `process.kill(pid, 'SIGTERM')`.
  - Wait a brief moment (500ms), then check if processes are still running using `process.kill(pid, 0)`.
  - If any remain, send `SIGKILL` using `process.kill(pid, 'SIGKILL')`.
  - Wrap all operations in try-catch to handle cases where `lsof` is not available or processes have already exited.
  - Log actions using the existing `log()` utility.
  - Filter out the current process PID (`process.pid`) to avoid killing the cleanup process itself.

### Step 4: Update `removeWorktree()` to kill processes and return branch info

- Read `adws/github/worktreeCleanup.ts`.
- Modify `removeWorktree()` to call `killProcessesInDirectory(worktreePath)` BEFORE attempting `git worktree remove --force`.
- Also call `killProcessesInDirectory()` in the fallback path before `fs.rmSync()`.
- After successful worktree removal, call `deleteLocalBranch(branchName)` to delete the local branch.
- Import `deleteLocalBranch` from `./gitOperations`.

### Step 5: Update `removeWorktreesForIssue()` to extract branch names and delete branches

- In `worktreeCleanup.ts`, update `removeWorktreesForIssue()`:
  - Before removing each worktree, call `killProcessesInDirectory(wtPath)`.
  - After successful worktree removal, extract the branch name from the worktree list output and call `deleteLocalBranch()` for each removed branch.
  - To get branch names, change the function to parse `git worktree list --porcelain` output to extract both paths and branch names for matching worktrees.

### Step 6: Update `handlePullRequestEvent()` to delete remote branch

- Read `adws/triggers/webhookHandlers.ts`.
- After the worktree cleanup block (lines 49-60), add remote branch deletion:
  - Import `deleteRemoteBranch` from `../github/gitOperations`.
  - Call `deleteRemoteBranch(headBranch)` after worktree cleanup.
  - Log the result but don't fail the overall handler if remote branch deletion fails.

### Step 7: Add unit tests for new functions

- Read `adws/__tests__/worktreeOperations.test.ts` for existing test patterns.
- Add tests to `adws/__tests__/worktreeOperations.test.ts` for:
  - `killProcessesInDirectory()`:
    - Handles no running processes (lsof returns empty).
    - Successfully kills processes found by lsof.
    - Handles lsof command not being available.
    - Handles processes that have already exited.
    - Filters out current process PID.
  - `removeWorktree()` updated behavior:
    - Calls killProcessesInDirectory before removal.
    - Calls deleteLocalBranch after successful removal.
  - `removeWorktreesForIssue()` updated behavior:
    - Calls killProcessesInDirectory for each matching worktree.
    - Deletes local branches for removed worktrees.
- Add tests to `adws/__tests__/gitOperations.test.ts` for:
  - `deleteLocalBranch()`:
    - Successfully deletes a branch.
    - Returns false when branch doesn't exist.
    - Returns false and warns for protected branches (main, master, develop).
  - `deleteRemoteBranch()`:
    - Successfully deletes a remote branch.
    - Returns false when remote branch doesn't exist.
    - Returns false and warns for protected branches (main, master, develop).
- Create a new test file `adws/__tests__/webhookHandlers.test.ts` for:
  - `handlePullRequestEvent()`:
    - Calls removeWorktree and deleteRemoteBranch when PR is closed.
    - Handles missing headBranch gracefully.
    - Does not fail if remote branch deletion fails.
    - Extracts issue number and closes linked issue.

### Step 8: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to validate the fix with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `lsof` command is available on both macOS and Linux. If it's not available, the cleanup should still proceed (just without process killing), so this must be handled gracefully.
- Protected branches (`main`, `master`, `develop`) must never be deleted. Both `deleteLocalBranch` and `deleteRemoteBranch` must guard against this.
- The `killProcessesInDirectory` function should use `SIGTERM` first (graceful), then `SIGKILL` (forced) as a fallback, following Unix conventions.
- The `handlePullRequestEvent` handler should not fail entirely if branch deletion fails - these are best-effort cleanup operations.
- No new npm packages are required for this fix. All functionality uses built-in Node.js APIs and system commands (`lsof`, `git`).
