# Chore: Update the trigger to remove worktrees on issue close

## Chore Description
Update the webhook trigger to remove all worktrees associated with an issue number when the issue is closed. Currently, worktree cleanup only happens when a PR is closed (removing the worktree for that specific PR branch). However, there are cases where no PR exists, or a prior attempt to close the issue failed while the PR did close. In those cases, orphaned worktrees remain on disk. This chore adds an `issues` `closed` event handler that finds and removes all worktrees whose branch names contain the issue number pattern (`issue-{number}-`), ensuring complete cleanup regardless of how the issue was closed.

## Relevant Files
Use these files to resolve the chore:

- `adws/triggers/trigger_webhook.ts` — The webhook trigger that receives GitHub events. Currently handles `issues` `opened` and `pull_request` `closed` events. Needs a new handler for `issues` `closed` to trigger worktree cleanup.
- `adws/github/worktreeOperations.ts` — Contains all worktree management functions (`removeWorktree`, `listWorktrees`, etc.). Needs a new `removeWorktreesForIssue` function that finds and removes all worktrees matching an issue number.
- `adws/github/index.ts` — Barrel export file for the `github` module. Needs to export the new `removeWorktreesForIssue` function.
- `adws/__tests__/worktreeOperations.test.ts` — Unit tests for worktree operations. Needs tests for the new `removeWorktreesForIssue` function.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `removeWorktreesForIssue` function to `worktreeOperations.ts`

- Add a new exported function `removeWorktreesForIssue(issueNumber: number): number` at the end of `adws/github/worktreeOperations.ts` (before any closing content, after the `ensureWorktree` function).
- The function should:
  1. Call `listWorktrees()` to get all worktree paths (these are paths under `.worktrees/`, e.g., `/project/.worktrees/feature-issue-142-some-title`).
  2. Filter worktree paths whose directory name contains the pattern `-issue-{issueNumber}-` (use a regex like `/-issue-{issueNumber}-/` against the `path.basename()` of each worktree path). This pattern matches branch-derived directory names like `feature-issue-142-some-title`, `bugfix-issue-142-fix-bug`, `chore-issue-142-update-trigger`, etc.
  3. For each matching worktree path, call `execSync(\`git worktree remove "\${wtPath}" --force\`, { stdio: 'pipe' })` to remove it. If the git command fails but the directory still exists, fall back to `fs.rmSync` (same pattern as the existing `removeWorktree` function).
  4. Log each removal attempt and result.
  5. Return the count of successfully removed worktrees.
  6. Run `execSync('git worktree prune', { stdio: 'pipe' })` after all removals to clean up stale entries.
- Keep the function pure in its logic — it takes an issue number and returns a count. Side effects (git commands, fs operations, logging) are necessary but should be isolated to this function.

### Step 2: Export `removeWorktreesForIssue` from `adws/github/index.ts`

- Add `removeWorktreesForIssue` to the existing `// Worktree Operations` export block in `adws/github/index.ts`.

### Step 3: Add `issues` `closed` handler to `trigger_webhook.ts`

- In `adws/triggers/trigger_webhook.ts`, update the import from `'../github/worktreeOperations'` to also import `removeWorktreesForIssue`.
- In the `issues` event handler section (around line 250-260), change the logic from only handling `action === 'opened'` to also handling `action === 'closed'`:
  - After the existing `if (event !== 'issues')` guard, replace the single `if (action !== 'opened')` check with an if/else-if structure:
    - `if (action === 'closed')`: Extract the issue number from the payload, call `removeWorktreesForIssue(issueNumber)`, log the result, and respond with `{ status: 'worktrees_cleaned', issue: issueNumber, removed: count }`.
    - `else if (action === 'opened')`: Keep the existing logic for spawning ADW workflows.
    - `else`: Log and ignore the action (existing behavior).
  - The `closed` handler should be synchronous (no async needed since `removeWorktreesForIssue` uses `execSync`).

### Step 4: Add unit tests for `removeWorktreesForIssue` in `worktreeOperations.test.ts`

- Add a new `describe('removeWorktreesForIssue', ...)` block in `adws/__tests__/worktreeOperations.test.ts`.
- Import `removeWorktreesForIssue` in the existing import statement from `'../github/worktreeOperations'`.
- Add the following test cases:
  1. **Removes all worktrees matching the issue number**: Mock `listWorktrees` (via `execSync` returning a worktree list with multiple entries matching issue 42 and some not matching). Verify that `git worktree remove` is called for each matching path and the function returns the correct count.
  2. **Returns 0 when no worktrees match**: Mock `listWorktrees` returning worktrees that don't match the issue number. Verify the function returns 0 and no `git worktree remove` calls are made.
  3. **Returns 0 when no worktrees exist**: Mock `listWorktrees` returning an empty list. Verify the function returns 0.
  4. **Handles removal failures gracefully with fs.rmSync fallback**: Mock `git worktree remove` throwing an error for one worktree but `fs.existsSync` returning true, so `fs.rmSync` is used as fallback. Verify it still counts as removed.
  5. **Does not match partial issue numbers** (e.g., issue 1 should not match `issue-10` or `issue-100`): Mock worktrees with paths containing `issue-1-`, `issue-10-`, and `issue-100-`. Verify only `issue-1-` is matched when calling with issue number 1.

### Step 5: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to ensure everything passes with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The regex pattern for matching issue numbers in worktree paths must use word boundary or delimiter matching to avoid false positives (e.g., issue 1 must not match issue 10, issue 100, etc.). The pattern `-issue-{N}-` naturally handles this since the issue number is always followed by a dash (the slug separator).
- The `listWorktrees()` function already filters out the main repository worktree, so we only operate on `.worktrees/` entries.
- The `removeWorktreesForIssue` function is intentionally separate from `removeWorktree` (which takes a branch name) to keep each function focused on a single responsibility.
