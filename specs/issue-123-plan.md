# Bug: Issue comments should get resolved in the same branch / worktree

## Bug Description
When a user posts a `## Take action` comment on an existing GitHub issue that already has an ADW workflow run (with an existing branch and worktree), the system creates a **new branch and worktree** instead of reusing the existing ones. This results in duplicated worktrees for the same issue, wasted resources, and work happening on separate branches rather than continuing where the previous workflow left off.

**Expected behavior:** When a `## Take action` comment triggers a workflow on an issue that already has a branch/worktree from a prior ADW run, the system should reuse the existing branch and worktree.

**Actual behavior:** A new ADW ID is generated (with a random suffix), which produces a different branch name, which creates a new worktree — even though a worktree for this issue already exists.

## Problem Statement
The `initializeWorkflow()` function in `adws/workflowPhases.ts` has three compounding problems that cause it to always create a new branch/worktree for issue comment re-triggers:

1. **ADW ID generation always produces a unique value** — `generateAdwId()` includes a random suffix (`Math.random()`), so every call produces a different ID even for the same issue.
2. **Recovery state detection happens too late** — `detectRecoveryState()` is called on line 169, AFTER the ADW ID is resolved (line 101) and the branch/worktree is set up (lines 132-153). By the time recovery state is detected, a new worktree has already been created.
3. **Branch name extraction regex is broken** — `extractBranchNameFromComment()` uses the pattern `(feature|bugfix|chore|review)/issue-\d+...` (with `/` separator and long prefixes), but actual branch names use the format `feat-issue-123-adw-...` (with `-` separator and short prefixes). The regex never matches, so recovery state always has `branchName: null`.

## Solution Statement
Restructure `initializeWorkflow()` to detect recovery state **before** generating the ADW ID and branch name. When recovery state provides an existing ADW ID and/or branch name, reuse them instead of generating new ones. Additionally, fix the `extractBranchNameFromComment()` regex to match the actual branch name format used in workflow comments.

## Steps to Reproduce
1. Create a new GitHub issue (e.g., issue #100).
2. The ADW webhook triggers `initializeWorkflow()`, which:
   - Generates ADW ID: `adw-fix-login-bug-abc123` (random suffix `abc123`)
   - Generates branch name: `bug-issue-100-adw-fix-login-bug-abc123-fix-login`
   - Creates worktree at `.worktrees/bug-issue-100-adw-fix-login-bug-abc123-fix-login`
   - Posts workflow comments with the branch name and ADW ID
3. Post a `## Take action` comment on issue #100.
4. The webhook triggers `initializeWorkflow()` again, which:
   - Generates a **new** ADW ID: `adw-fix-login-bug-xyz789` (different random suffix)
   - Generates a **new** branch name: `bug-issue-100-adw-fix-login-bug-xyz789-fix-login`
   - Creates a **new** worktree at `.worktrees/bug-issue-100-adw-fix-login-bug-xyz789-fix-login`
5. **Result:** Two separate branches and worktrees exist for the same issue.

## Root Cause Analysis
The bug is caused by three compounding issues in the workflow initialization code:

**1. Random ADW ID generation (`adws/core/utils.ts:15-24`):**
`generateAdwId()` always produces a unique ID because of `Math.random().toString(36).substring(2, 8)`. Since the ADW ID is embedded in the branch name (via the `generate_branch_name` skill), every invocation produces a different branch name.

**2. Late recovery state detection (`adws/workflowPhases.ts:169`):**
`detectRecoveryState(issue.comments)` is called on line 169, but the ADW ID is resolved on line 101 and the branch/worktree is created on lines 132-153. By the time recovery is detected, the system has already committed to a new ADW ID and branch.

**3. Broken branch name extraction regex (`adws/github/workflowCommentsBase.ts:88-90`):**
```typescript
const match = commentBody.match(/`((feature|bugfix|chore|review)\/issue-\d+[a-z0-9-]*)`/);
```
This expects branch names like `feature/issue-123-xxx` but actual branches are named `feat-issue-123-adw-xxx`. The prefixes don't match (`feature` vs `feat`, `bugfix` vs `bug`) and the separator doesn't match (`/` vs `-`). This means `detectRecoveryState()` can never extract a branch name from prior comments, always returning `branchName: null`.

## Relevant Files
Use these files to fix the bug:

- **`adws/workflowPhases.ts`** — Contains `initializeWorkflow()` where recovery state detection must be moved before ADW ID/branch generation. This is the primary file to fix.
- **`adws/github/workflowCommentsBase.ts`** — Contains `extractBranchNameFromComment()` with the broken regex that prevents branch name recovery from prior workflow comments.
- **`adws/__tests__/workflowPhases.test.ts`** — Contains tests for `initializeWorkflow()` that must be updated to verify the new recovery-first behavior.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix `extractBranchNameFromComment` regex in `workflowCommentsBase.ts`

- In `adws/github/workflowCommentsBase.ts`, update the `extractBranchNameFromComment()` function (line 88-90).
- Change the regex from:
  ```typescript
  const match = commentBody.match(/`((feature|bugfix|chore|review)\/issue-\d+[a-z0-9-]*)`/);
  ```
  To match the actual branch name format used by the `generate_branch_name` skill:
  ```typescript
  const match = commentBody.match(/`((feat|bug|chore|review|test)-issue-\d+[a-z0-9-]*)`/);
  ```
- This changes two things: (a) uses short prefixes (`feat`, `bug`, `test`) instead of long ones (`feature`, `bugfix`), and (b) uses `-` separator instead of `/` separator.

### Step 2: Restructure `initializeWorkflow` in `workflowPhases.ts` to detect recovery state first

- In `adws/workflowPhases.ts`, modify `initializeWorkflow()` to:
  1. Fetch the issue first (already done on line 97).
  2. **Detect recovery state immediately after fetching the issue** — move the `detectRecoveryState(issue.comments)` call from line 169 to right after line 98.
  3. **Use recovered ADW ID if available** — change line 101 from:
     ```typescript
     const resolvedAdwId = adwId ?? generateAdwId(issue.title);
     ```
     To:
     ```typescript
     const recoveryState = detectRecoveryState(issue.comments);
     const resolvedAdwId = adwId ?? recoveryState.adwId ?? generateAdwId(issue.title);
     ```
  4. **Use recovered branch name for worktree lookup** — in the worktree setup block (lines 132-153), before generating a new branch name, check if recovery state has a branch name. If it does, skip `runGenerateBranchNameAgent` and use the recovered branch name instead:
     ```typescript
     if (recoveryState.branchName) {
       branchName = recoveryState.branchName;
       log(`Reusing branch from previous workflow: ${branchName}`, 'info');
     } else {
       const branchResult = await runGenerateBranchNameAgent(
         issueType, resolvedAdwId, issue, logsDir
       );
       branchName = branchResult.branchName;
       log(`Branch name generated: ${branchName}`, 'success');
     }
     ```
  5. Remove the second `detectRecoveryState` call that was previously on line 169 (since we've already called it earlier).
  6. Ensure the rest of the function continues to use the `recoveryState` variable from the earlier detection.

### Step 3: Update unit tests in `workflowPhases.test.ts`

- In `adws/__tests__/workflowPhases.test.ts`, update existing tests and add new tests:
  - Update the mock for `detectRecoveryState` to ensure it's called with the issue comments.
  - Add a test: **"reuses recovered ADW ID and branch name when recovery state has them"** — mock `detectRecoveryState` to return a recovery state with `adwId` and `branchName`, verify that `generateAdwId` is NOT called and `runGenerateBranchNameAgent` is NOT called, and the existing worktree is reused.
  - Add a test: **"generates new ADW ID and branch when no recovery state exists"** — mock `detectRecoveryState` to return a default (empty) recovery state, verify that `generateAdwId` IS called and `runGenerateBranchNameAgent` IS called (existing behavior for fresh issues).
  - Add a test: **"uses recovered branch name but generates new ADW ID when only branch is recovered"** — mock recovery state with `branchName` but no `adwId`, verify `generateAdwId` is called but `runGenerateBranchNameAgent` is NOT called.
  - Update the existing test `"generates ADW ID from issue title when adwId is null"` to also verify the call to `detectRecoveryState` happens before `generateAdwId`.

### Step 4: Add unit tests for fixed `extractBranchNameFromComment` regex

- In `adws/__tests__/workflowPhases.test.ts` (or a new test file if preferred for comment parsing tests), add tests for `extractBranchNameFromComment`:
  - Test that `feat-issue-123-adw-abc123-add-user-auth` is correctly extracted from a comment body containing it in backticks.
  - Test that `bug-issue-456-adw-xyz789-fix-login-error` is correctly extracted.
  - Test that `chore-issue-789-adw-def456-update-deps` is correctly extracted.
  - Test that `test-issue-323-adw-ghi789-fix-failing-tests` is correctly extracted.
  - Test that `review-issue-100-adw-jkl012-address-comments` is correctly extracted.
  - Test that null is returned for non-matching patterns.

### Step 5: Run validation commands

- Execute all validation commands to confirm the bug fix works correctly with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `extractBranchNameFromComment` regex fix is essential because without it, `detectRecoveryState` can never recover the branch name from prior workflow comments, making the reordering fix incomplete.
- The fix is backward-compatible: for fresh issues with no prior comments, `detectRecoveryState` will return the default empty state, and the existing code path (generate new ADW ID + generate new branch name) will execute as before.
- No new libraries are needed for this fix.
