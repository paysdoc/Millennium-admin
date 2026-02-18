# Bug: Worktree creation fails due to empty branchName and remaining unquoted shell arguments

## Metadata
issueNumber: ``
adwId: `bug`
issueJson: ``

## Bug Description
ADW workflows are failing with the error:
```
Error: Failed to create worktree for branch '': Error: Command failed: git worktree add -b " /path/.worktrees/" develop
/bin/sh: chore-issue-160-adw-update-logger-dbeom3-add-adwid-to-logger: command not found
Preparing worktree (new branch '')
fatal: '' is not a valid branch name
```

The previous fix (commit `8b732db`) quoted `${branchName}` in most `execSync` calls and added branch name validation. However, **two critical issues remain**:

1. **Empty branchName propagation**: `createWorktree()` and `createWorktreeForNewBranch()` accept empty string branchNames without validation, allowing invalid git commands to be constructed and executed.
2. **Unquoted shell arguments**: Several `execSync` calls still have unquoted variables — `${branchName}` in `prCommentDetector.ts:21`, and `${baseBranch}`/`${base}`/`${defaultBranch}` in `worktreeCreation.ts` and `gitOperations.ts`.

**Expected behavior:** Worktree creation should either succeed with a valid branch name, or fail early with a clear error message before any git command is executed.

**Actual behavior:** An empty `branchName` reaches `execSync`, producing an invalid `git worktree add -b "" "..."` command. Additionally, unquoted branch/base names in other `execSync` calls can be misinterpreted by the shell.

## Problem Statement
1. `createWorktree()` and `createWorktreeForNewBranch()` in `worktreeCreation.ts` do not validate that `branchName` is non-empty before constructing and executing shell commands.
2. `prCommentDetector.ts:21` has `git log ${branchName}` with an unquoted `${branchName}`.
3. `worktreeCreation.ts:129,162` have unquoted `${baseBranch}`/`${base}` in `execSync` calls.
4. `gitOperations.ts:188,195,216,224` have unquoted `${defaultBranch}` in `execSync` calls.
5. `worktreeOperations.ts:179` has unquoted `${defaultBranch}` in `execSync` call.

## Solution Statement
1. **Add input validation** to `createWorktree()` and `createWorktreeForNewBranch()` — throw early if `branchName` is empty.
2. **Quote all remaining unquoted variables** in `execSync` calls across `prCommentDetector.ts`, `worktreeCreation.ts`, `gitOperations.ts`, and `worktreeOperations.ts`.
3. **Add/update tests** to verify the fixes.

## Steps to Reproduce
1. Run an ADW workflow that calls `createWorktree('')` or `createWorktreeForNewBranch('')` — either through a code path that passes an empty branchName or by calling the function directly with `''`.
2. Observe that the git command executes with an empty branch name: `git worktree add -b "" "/path/.worktrees/" develop`
3. Git fails with: `fatal: '' is not a valid branch name`
4. Separately, run any code path that calls `getLastAdwCommitTimestamp()` in `prCommentDetector.ts` with a branch name containing hyphens — the unquoted `${branchName}` in `git log` can be misinterpreted by the shell.

## Root Cause Analysis
### 1. No input validation in worktree creation functions (Primary cause)
`createWorktree()` (line 80) and `createWorktreeForNewBranch()` (line 151) in `worktreeCreation.ts` accept any string for `branchName` — including empty strings. When `branchName` is `''`:
- `getWorktreePath('')` returns `/path/.worktrees/` (trailing slash, no subdirectory)
- The `execSync` command becomes `git worktree add -b "" "/path/.worktrees/" develop`
- Git rejects the empty branch name: `fatal: '' is not a valid branch name`

### 2. Unquoted `${branchName}` in prCommentDetector.ts (Secondary cause)
Line 21: `git log ${branchName} --format="%aI %s" --no-merges` — when `branchName` contains characters the shell interprets specially (or is very long), the shell can misinterpret the command. This produces the `/bin/sh: <branchName>: command not found` error seen in the log.

### 3. Unquoted `${baseBranch}`, `${base}`, and `${defaultBranch}` in multiple files
- `worktreeCreation.ts:129`: `git worktree add -b "${branchName}" "${worktreePath}" ${baseBranch}` — `${baseBranch}` unquoted
- `worktreeCreation.ts:162`: `git worktree add -b "${branchName}" "${worktreePath}" ${base}` — `${base}` unquoted
- `gitOperations.ts:188`: `git checkout ${defaultBranch}` — `${defaultBranch}` unquoted
- `gitOperations.ts:195`: `git pull origin ${defaultBranch}` — `${defaultBranch}` unquoted
- `gitOperations.ts:216`: `git fetch origin ${defaultBranch}` — `${defaultBranch}` unquoted
- `gitOperations.ts:224`: `git merge origin/${defaultBranch} --no-edit` — `${defaultBranch}` unquoted
- `worktreeOperations.ts:179`: `git checkout ${defaultBranch} && git pull` — `${defaultBranch}` unquoted

## Relevant Files
Use these files to fix the bug:

- `adws/github/worktreeCreation.ts` — Contains `createWorktree()` and `createWorktreeForNewBranch()` which need empty branchName validation and have unquoted `${baseBranch}`/`${base}`.
- `adws/github/prCommentDetector.ts` — Contains `getLastAdwCommitTimestamp()` with unquoted `${branchName}` on line 21.
- `adws/github/gitOperations.ts` — Contains `checkoutDefaultBranch()` and `mergeLatestFromDefaultBranch()` with unquoted `${defaultBranch}` on lines 188, 195, 216, 224.
- `adws/github/worktreeOperations.ts` — Contains `freeBranchFromMainRepo()` with unquoted `${defaultBranch}` on line 179.
- `adws/__tests__/worktreeOperations.test.ts` — Existing tests for worktree operations; must be updated with empty branchName validation tests and updated `execSync` assertions for quoted baseBranch/defaultBranch.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests for workflow phases; should verify empty branchName is never passed to worktree functions.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.
- `adws/README.md` — ADW documentation for context.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add input validation to `createWorktree()` and `createWorktreeForNewBranch()` in `worktreeCreation.ts`
- Read `adws/github/worktreeCreation.ts`
- Add an early validation check at the top of `createWorktree()` (after line 80) that throws a descriptive error if `branchName` is empty or contains only whitespace:
  ```typescript
  if (!branchName || !branchName.trim()) {
    throw new Error('branchName must be a non-empty string');
  }
  ```
- Add the same validation check at the top of `createWorktreeForNewBranch()` (after line 151)
- Quote `${baseBranch}` on line 129: change `${baseBranch}` to `"${baseBranch}"`
- Quote `${base}` on line 162: change `${base}` to `"${base}"`

### 2. Quote `${branchName}` in `prCommentDetector.ts`
- Read `adws/github/prCommentDetector.ts`
- On line 21, change `git log ${branchName}` to `git log "${branchName}"`

### 3. Quote `${defaultBranch}` in `gitOperations.ts`
- Read `adws/github/gitOperations.ts`
- On line 188, change `git checkout ${defaultBranch}` to `git checkout "${defaultBranch}"`
- On line 195, change `git pull origin ${defaultBranch}` to `git pull origin "${defaultBranch}"`
- On line 216, change `git fetch origin ${defaultBranch}` to `git fetch origin "${defaultBranch}"`
- On line 224, change `git merge origin/${defaultBranch} --no-edit` to `git merge "origin/${defaultBranch}" --no-edit`

### 4. Quote `${defaultBranch}` in `worktreeOperations.ts`
- Read `adws/github/worktreeOperations.ts`
- On line 179, change `git checkout ${defaultBranch} && git pull` to `git checkout "${defaultBranch}" && git pull`

### 5. Update tests in `worktreeOperations.test.ts`
- Read `adws/__tests__/worktreeOperations.test.ts`
- Add test cases for `createWorktree` and `createWorktreeForNewBranch` that verify:
  - Calling with an empty string `''` throws an error containing 'branchName must be a non-empty string'
  - Calling with a whitespace-only string `'  '` throws an error containing 'branchName must be a non-empty string'
- Update any existing `execSync` assertions for `git worktree add -b` commands to expect quoted `baseBranch` arguments (e.g., `"develop"` or `"main"`)
- Update any existing `execSync` assertions for `git checkout`/`git pull` commands to expect quoted `defaultBranch` arguments
- Run `npm test -- --run adws/__tests__/worktreeOperations.test.ts` to verify

### 6. Run validation commands
- Execute every command in the `Validation Commands` section below to confirm the bug is fixed with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm test -- --run adws/__tests__/worktreeOperations.test.ts` - Verify worktree operations tests pass including new empty branchName validation
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run all tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- This bug fix is purely defensive — adding input validation at the boundaries of `createWorktree()` and `createWorktreeForNewBranch()` to fail fast with a clear error message, and quoting all remaining unquoted shell variables to prevent shell interpretation issues.
- The previous fix (commit `8b732db`) correctly quoted `${branchName}` in most places, added `validateBranchName()` in `gitAgent.ts`, and fixed the `adw-` prefix duplication. This fix addresses the gaps that were missed.
- The `prCommentDetector.ts` unquoted `${branchName}` is the likely source of the `/bin/sh: chore-issue-160-...: command not found` error in the user's log — when the branch name is passed to `git log` without quotes, the shell can misinterpret parts of it.
- While the root cause of *why* `branchName` is empty when reaching `createWorktree()` may also need investigation (possibly related to the `options?.cwd` code path in `workflowLifecycle.ts:74-78`), the immediate fix is to validate inputs at the function boundary so these functions never attempt to execute invalid git commands.
