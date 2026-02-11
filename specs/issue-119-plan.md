# Bug: Actions still run in main worktree instead of dedicated worktree

## Bug Description
Several workflow phase functions in `adws/workflowPhases.ts` do not pass the `worktreePath` parameter to agent functions they invoke. This causes those agents to spawn Claude CLI processes with `cwd: process.cwd()` (the main repository directory) instead of `cwd: worktreePath` (the dedicated worktree). The result is that build and test agents operate on files in the main repository rather than in the isolated worktree created for the workflow.

**Expected behavior:** All agents (plan, build, test, commit) execute within the dedicated worktree directory, ensuring complete isolation from the main repository.

**Actual behavior:** The build agent in `executeBuildPhase` and both test retry functions in `executeTestPhase` run in the main repository because `worktreePath` is not forwarded to them.

## Problem Statement
The `executeBuildPhase` function calls `runBuildAgent()` without passing `worktreePath` as the `cwd` parameter. The `executeTestPhase` function calls `runUnitTestsWithRetry()` and `runE2ETestsWithRetry()` without passing `worktreePath` via the options `cwd` field. This means those agents default to `process.cwd()` (the main repo), breaking worktree isolation and risking corruption of the main repo during concurrent workflows.

## Solution Statement
Pass `worktreePath` from the `WorkflowConfig` to every agent invocation in `executeBuildPhase` and `executeTestPhase`. This requires adding the `worktreePath` argument to the `runBuildAgent()` call and adding `cwd: worktreePath` to the options objects passed to `runUnitTestsWithRetry()` and `runE2ETestsWithRetry()`. Then add tests to verify that `worktreePath` is correctly propagated in all workflow phases.

## Steps to Reproduce
1. Create a GitHub issue that triggers the ADW workflow (e.g., via the CRON trigger).
2. The workflow creates a dedicated worktree at `.worktrees/<branch-name>/`.
3. `executePlanPhase` runs correctly in the worktree (it passes `worktreePath` to `runPlanAgent`).
4. `executeBuildPhase` calls `runBuildAgent(issue, logsDir, planContent, buildProgressCallback, buildAgentStatePath)` — **missing `worktreePath`** as the 6th argument.
5. The build agent spawns with `cwd: process.cwd()` and modifies files in the main repository.
6. `executeTestPhase` calls `runUnitTestsWithRetry({ logsDir, orchestratorStatePath, maxRetries })` — **missing `cwd: worktreePath`** in options.
7. `executeTestPhase` calls `runE2ETestsWithRetry({ logsDir, orchestratorStatePath, maxRetries })` — **missing `cwd: worktreePath`** in options.
8. Test agents run tests against the main repository instead of the worktree.

## Root Cause Analysis
The bug stems from incomplete parameter forwarding when the worktree system was integrated into the workflow phases:

1. **`executeBuildPhase` (line 360):** The call to `runBuildAgent` passes 5 arguments but omits the 6th `cwd` parameter. The function signature `runBuildAgent(issue, logsDir, planContent, onProgress?, statePath?, cwd?)` accepts `cwd` as the last optional parameter, but it is never provided.

2. **`executeTestPhase` (lines 417-449):** The `TestRetryOptions` interface supports an optional `cwd` field, and the PR review test phase (`executePRReviewTestPhase`) correctly passes `cwd: worktreePath`. However, the standard `executeTestPhase` does not destructure `worktreePath` from `config` and does not pass it in the options objects.

The pattern is consistent: `executePlanPhase` and `executePRPhase` correctly pass `worktreePath`, while `executeBuildPhase` and `executeTestPhase` do not. The PR review workflow equivalents (`executePRReviewBuildPhase` and `executePRReviewTestPhase`) correctly pass `cwd` — confirming this is an oversight in the standard workflow path only.

## Relevant Files
Use these files to fix the bug:

- **`adws/workflowPhases.ts`** — Contains `executeBuildPhase` (line 360) and `executeTestPhase` (lines 404-480) where `worktreePath` must be forwarded to agent calls.
- **`adws/agents/buildAgent.ts`** — Defines `runBuildAgent` which already accepts a `cwd` parameter (line 84) but never receives it from `executeBuildPhase`.
- **`adws/agents/testRetry.ts`** — Defines `TestRetryOptions` with optional `cwd` field (line 31) and `runUnitTestsWithRetry`/`runE2ETestsWithRetry` which already support `cwd` but don't receive it from `executeTestPhase`.
- **`adws/__tests__/cwdPropagation.test.ts`** — Existing tests for cwd propagation at the agent level. New tests should be added for workflow-phase-level propagation.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix `executeBuildPhase` to pass `worktreePath` to `runBuildAgent`

- In `adws/workflowPhases.ts`, locate the `runBuildAgent` call at line 360.
- Current code:
  ```typescript
  const buildResult = await runBuildAgent(issue, logsDir, planContent, buildProgressCallback, buildAgentStatePath);
  ```
- Change to:
  ```typescript
  const buildResult = await runBuildAgent(issue, logsDir, planContent, buildProgressCallback, buildAgentStatePath, worktreePath);
  ```
- Note: `worktreePath` is already destructured from `config` at line 306.

### Step 2: Fix `executeTestPhase` to pass `worktreePath` to test retry functions

- In `adws/workflowPhases.ts`, locate the `executeTestPhase` function (line 404).
- Add `worktreePath` to the destructured config properties at line 410:
  ```typescript
  const { orchestratorStatePath, issueNumber, ctx, logsDir, worktreePath } = config;
  ```
- Update `runUnitTestsWithRetry` call (around line 417) to include `cwd`:
  ```typescript
  const unitTestsResult = await runUnitTestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    cwd: worktreePath,
  });
  ```
- Update `runE2ETestsWithRetry` call (around line 446) to include `cwd`:
  ```typescript
  const e2eTestsResult = await runE2ETestsWithRetry({
    logsDir,
    orchestratorStatePath,
    maxRetries: MAX_TEST_RETRY_ATTEMPTS,
    cwd: worktreePath,
  });
  ```

### Step 3: Add tests to verify worktree path propagation in workflow phases

- In `adws/__tests__/cwdPropagation.test.ts`, add new test cases that verify:
  1. `executeBuildPhase` passes `worktreePath` as `cwd` to `runBuildAgent` (and ultimately to `spawn`).
  2. `executeTestPhase` passes `worktreePath` as `cwd` in the options to `runUnitTestsWithRetry` and `runE2ETestsWithRetry`.
- These tests should mock the agent functions and verify the `cwd` argument is forwarded.

### Step 4: Run validation commands

- Run all validation commands listed below to confirm the fix is correct, tests pass, and there are no regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The PR review workflow phases (`executePRReviewBuildPhase` and `executePRReviewTestPhase`) already correctly pass `cwd: worktreePath`. Use them as reference implementations for the standard workflow fixes.
- The fix is minimal: two lines changed in `executeBuildPhase`, three lines changed in `executeTestPhase`, plus test additions. No new files or dependencies are needed.
