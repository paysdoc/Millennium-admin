# PR-Review: Add Concurrent ADW Workflow Isolation Test

## PR-Review Description
The PR review requests adding a test to verify that multiple concurrent ADW (Agentic Developer Workflow) workflows can run without impacting one another. The worktree feature (implemented in PR #52) was designed specifically to enable concurrent workflow execution by isolating each workflow in its own git worktree. However, the current test suite does not include explicit tests validating this concurrent isolation behavior.

The test should demonstrate that:
1. Multiple worktrees can be created simultaneously for different branches
2. Each worktree operates in complete isolation from others
3. Operations in one worktree do not affect the state of another worktree
4. The main repository's branch state is preserved during concurrent operations

## Summary of Original Implementation Plan
The original implementation plan for issue #51 introduced git worktree support for ADW orchestrators:
- Created `worktreeOperations.ts` module with functions to manage git worktrees (`createWorktree`, `ensureWorktree`, `removeWorktree`, etc.)
- Modified orchestrators (`adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPrReview.tsx`) to execute in isolated worktrees
- Added `--cwd` parameter support to subprocesses (`adwPlan.tsx`, `adwBuild.tsx`, `adwTest.tsx`)
- Implemented worktree cleanup on PR close via webhook
- Added unit tests for individual worktree operation functions

The existing tests verify individual worktree operations but do not validate the concurrent isolation behavior that the feature was designed to enable.

## Relevant Files
Use these files to resolve the review:

- `adws/__tests__/worktreeOperations.test.ts` - Existing worktree unit tests; needs new test suite for concurrent workflow isolation
- `adws/github/worktreeOperations.ts` - The worktree operations module being tested; provides the isolation mechanism
- `adws/core/config.ts` - Contains `WORKTREES_DIR` configuration used in tests

### New Files
No new files are required. The concurrent workflow isolation test will be added to the existing `adws/__tests__/worktreeOperations.test.ts` file.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Analyze existing worktree tests
- Review `adws/__tests__/worktreeOperations.test.ts` to understand the current test structure and mocking patterns
- Note the use of `vitest`, mocked `child_process.execSync`, and mocked `fs` functions
- Identify the pattern for testing worktree creation/removal operations

### Step 2: Add concurrent workflow isolation test suite
- Add a new `describe` block named `'Concurrent ADW Workflow Isolation'` to `adws/__tests__/worktreeOperations.test.ts`
- This test suite will validate that multiple concurrent workflows can operate in isolation
- Tests should cover:
  - Multiple worktrees can be created for different branches simultaneously
  - Each worktree has a unique, independent path
  - Operations in one worktree context do not affect another
  - The main repository state (mocked) remains unchanged during multi-worktree operations

### Step 3: Implement test for multiple worktree creation
- Add test: `'creates isolated worktrees for multiple concurrent workflows'`
- Mock `execSync` to simulate creating two worktrees for different branches (e.g., `feature/issue-1` and `feature/issue-2`)
- Verify each worktree gets a unique path under `.worktrees/`
- Verify both worktrees can coexist without conflict

### Step 4: Implement test for worktree path uniqueness
- Add test: `'generates unique paths for different branch names'`
- Use `getWorktreePath` to verify that different branch names produce different worktree paths
- Test with similar branch names to ensure proper isolation (e.g., `feature/issue-1` vs `feature/issue-10`)

### Step 5: Implement test for concurrent worktree existence check
- Add test: `'correctly identifies each worktree independently when multiple exist'`
- Mock `git worktree list` output showing multiple worktrees
- Verify `worktreeExists` correctly identifies each worktree by its branch
- Verify checking for one worktree doesn't return false positives for another

### Step 6: Implement test for isolated worktree removal
- Add test: `'removes one worktree without affecting others'`
- Mock scenario with multiple worktrees existing
- Remove one worktree and verify the other remains tracked
- Verify removal command targets only the specific worktree path

### Step 7: Implement test for main repository isolation
- Add test: `'main repository state is not affected by worktree operations'`
- Verify that worktree creation/removal commands don't include operations that would change the main repository's branch
- Verify the main repository path is excluded from the `listWorktrees` output (already implemented, but test specifically for concurrent scenario)

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the review is complete with zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The tests use mocking to avoid actual git operations, which is the established pattern in this codebase
- The concurrent isolation is achieved through the design of worktree operations (unique paths per branch), so the tests verify this design holds under concurrent scenarios
- The tests simulate concurrent workflows by creating/checking multiple worktrees in sequence, which validates the isolation mechanism even though the tests themselves run sequentially
- Real concurrent execution would require integration tests, but the unit tests can verify the isolation properties that make concurrency safe
- The existing `ensureWorktree` function already handles the case where a worktree exists (logs warning and reuses), which is tested but should be verified in concurrent context
