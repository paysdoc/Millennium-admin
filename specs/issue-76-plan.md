# Bug: Fix failing tests in worktreeOperations.test.ts

## Bug Description
Three tests in `adws/__tests__/worktreeOperations.test.ts` are failing after commit `52e998fe258bf71e3672720132fbbacfddb58a2b`. The tests are expecting `git checkout main` but the actual command now includes `&& git pull`.

**Symptoms:**
- Test: "commits and pushes changes when there are uncommitted changes" - FAILING
- Test: "skips commit when there are no uncommitted changes" - FAILING
- Test: "continues even when push fails" - FAILING

**Expected vs Actual:**
- Expected: `'git checkout main'`
- Actual: `'git checkout main && git pull'`

## Problem Statement
The `freeBranchFromMainRepo` function in `adws/github/worktreeOperations.ts` was updated to include `git pull` after checking out the default branch, but the corresponding unit tests were not updated to reflect this change.

## Solution Statement
Update the three failing test assertions in `adws/__tests__/worktreeOperations.test.ts` to expect the new command format `'git checkout main && git pull'` instead of just `'git checkout main'`.

## Steps to Reproduce
1. Run `npm test`
2. Observe 3 failing tests in `adws/__tests__/worktreeOperations.test.ts`
3. All failures are in the `freeBranchFromMainRepo` describe block
4. Each failure shows: `Expected: "git checkout main"` / `Received: "git checkout main && git pull"`

## Root Cause Analysis
Commit `52e998fe258bf71e3672720132fbbacfddb58a2b` modified `adws/github/worktreeOperations.ts` line 179 from:
```typescript
execSync(`git checkout ${defaultBranch}`, { stdio: 'pipe', cwd: mainRepoPath });
```
to:
```typescript
execSync(`git checkout ${defaultBranch} && git pull`, { stdio: 'pipe', cwd: mainRepoPath });
```

This change was intentional (described as "for worktrees switch to default branch and pulls in latest changes") but the unit tests were not updated to match the new behavior.

## Relevant Files
Use these files to fix the bug:

- `adws/__tests__/worktreeOperations.test.ts` - Contains the failing tests that need to be updated. The assertions on lines 869, 887, and 911 need to be changed to expect the new command format.
- `adws/github/worktreeOperations.ts` - Contains the `freeBranchFromMainRepo` function that was modified. This file does NOT need changes; it is referenced for understanding the expected behavior.

## Step by Step Tasks

### 1. Update test "commits and pushes changes when there are uncommitted changes"
- Locate the test at approximately line 839 in `adws/__tests__/worktreeOperations.test.ts`
- Change line 869 from:
  ```typescript
  expect(String(execCalls[5][0])).toBe('git checkout main');
  ```
  to:
  ```typescript
  expect(String(execCalls[5][0])).toBe('git checkout main && git pull');
  ```

### 2. Update test "skips commit when there are no uncommitted changes"
- Locate the test at approximately line 872 in `adws/__tests__/worktreeOperations.test.ts`
- Change line 887 from:
  ```typescript
  expect(String(execCalls[2][0])).toBe('git checkout main');
  ```
  to:
  ```typescript
  expect(String(execCalls[2][0])).toBe('git checkout main && git pull');
  ```

### 3. Update test "continues even when push fails"
- Locate the test at approximately line 890 in `adws/__tests__/worktreeOperations.test.ts`
- Change line 911 from:
  ```typescript
  expect(String(execCalls[5][0])).toBe('git checkout main');
  ```
  to:
  ```typescript
  expect(String(execCalls[5][0])).toBe('git checkout main && git pull');
  ```

### 4. Run Validation Commands
- Execute all validation commands listed below to ensure the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- This is a simple test update to match an intentional behavior change in the source code
- The change to add `git pull` after checkout is intentional and correct behavior - it ensures the main repository has the latest changes after switching branches
- No changes to the source code are needed; only the test assertions need updating
