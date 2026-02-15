# PR-Review: Commit and push persist token counts implementation

## PR-Review Description
The reviewer (paysdoc) noted that PR #151 has no implementation — only the plan file (`specs/issue-149-plan.md`) was committed in commit `4bc6b38`. The full implementation exists as uncommitted local changes across 12 modified files and 1 new test file, but these were never staged, committed, or pushed to the remote branch. The PR review asks that the implementation be committed and pushed so the PR contains the actual code changes.

## Summary of Original Implementation Plan
The original plan (`specs/issue-149-plan.md`) describes adding a `persistTokenCounts` utility function to `adws/core/costReport.ts` that writes accumulated `ModelUsageMap` and `costUsd` to the orchestrator's `state.json` metadata via `AgentStateManager.writeState()`. The function is called at natural boundaries: after each phase completes in orchestrator entry points, after each agent execution in retry loops, and in error handlers. The plan has 7 steps: (1) add `persistTokenCounts` function, (2) export from barrel, (3) write unit tests, (4) add persistence calls to orchestrators, (5) add persistence calls to retry loops, (6) add persistence to error handlers, (7) run validation.

## Relevant Files
Use these files to resolve the review:

- **`adws/core/costReport.ts`** — Contains the new `persistTokenCounts` function. Must be committed.
- **`adws/core/index.ts`** — Contains the new barrel export for `persistTokenCounts`. Must be committed.
- **`adws/__tests__/persistTokenCounts.test.ts`** — New unit test file for `persistTokenCounts`. Must be committed.
- **`adws/__tests__/reviewRetry.test.ts`** — Updated test mocks for `persistTokenCounts` and `AgentStateManager.writeState`. Must be committed.
- **`adws/workflowPhases.ts`** — Updated `handleWorkflowError` to accept optional cost parameters and persist them. Must be committed.
- **`adws/adwPlanBuildTestReview.tsx`** — Updated to persist running totals after each phase and pass cost data to error handler. Must be committed.
- **`adws/adwPlanBuildTest.tsx`** — Updated to persist running totals after each phase and pass cost data to error handler. Must be committed.
- **`adws/adwPlanBuild.tsx`** — Updated to persist running totals after each phase and pass cost data to error handler. Must be committed.
- **`adws/adwPlan.tsx`** — Updated to persist token counts after plan phase. Must be committed.
- **`adws/adwBuild.tsx`** — Updated to persist token counts after build agent completes. Must be committed.
- **`adws/adwTest.tsx`** — Updated to persist running totals after unit tests and E2E tests. Must be committed.
- **`adws/agents/testRetry.ts`** — Updated with `persistTokenCounts` calls after each agent execution in retry loops. Must be committed.
- **`adws/agents/reviewRetry.ts`** — Updated with `persistTokenCounts` calls after each agent execution in the retry loop. Must be committed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Run validation commands to verify the uncommitted implementation is correct
- Run `npm run lint` to check for code quality issues in the uncommitted changes.
- Run `npm run build` to verify no build errors with the uncommitted changes.
- Run `npm test` to verify all tests pass (including the new `persistTokenCounts.test.ts`).
- If any validation command fails, fix the issues before proceeding to the next step.

### Step 2: Commit all implementation files
- Stage all 13 changed/new files:
  - `adws/core/costReport.ts`
  - `adws/core/index.ts`
  - `adws/__tests__/persistTokenCounts.test.ts`
  - `adws/__tests__/reviewRetry.test.ts`
  - `adws/workflowPhases.ts`
  - `adws/adwPlanBuildTestReview.tsx`
  - `adws/adwPlanBuildTest.tsx`
  - `adws/adwPlanBuild.tsx`
  - `adws/adwPlan.tsx`
  - `adws/adwBuild.tsx`
  - `adws/adwTest.tsx`
  - `adws/agents/testRetry.ts`
  - `adws/agents/reviewRetry.ts`
- Commit with an appropriate message following the project's commit convention (e.g., `feat: persist token counts at regular intervals during workflow execution`).

### Step 3: Push to remote branch
- Push the commit to the remote branch `feat-issue-149-adw-persist-token-count-gbz6j4-persist-token-counts-regularly`.

### Step 4: Run validation commands to confirm zero regressions
- Run `npm run lint` to confirm code quality.
- Run `npm run build` to confirm no build errors.
- Run `npm test` to confirm all tests pass with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The implementation is already complete and correct across all 13 files. The only issue flagged by the reviewer is that it was never committed and pushed.
- The implementation correctly handles the `AgentStateManager.writeState()` shallow merge by reading existing state first, spreading existing metadata, and overlaying `totalCostUsd` and `modelUsage` — preserving other metadata fields like `unitTestsPassed`.
- The `adwPrReview.tsx` orchestrator was intentionally not modified since it does not track per-phase costs.
- Validation must pass before committing to ensure the implementation has zero regressions.
