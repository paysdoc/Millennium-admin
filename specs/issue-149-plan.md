# Feature: Persist Token Counts at Regular Intervals

## Feature Description
Add interim persistence of token counts to disk during ADW workflow execution. Currently, token counts are accumulated in local variables as each phase runs and only written to disk at the very end via `completeWorkflow()`. If a process dies mid-workflow, all accumulated token counts are lost. This feature introduces a `persistTokenCounts` utility that writes the running token count totals to the orchestrator's `state.json` metadata field at regular intervals, ensuring minimal loss of cost data on unexpected termination.

## User Story
As a workflow operator
I want token counts to be persisted to disk at regular intervals during workflow execution
So that accumulated cost data is preserved even if the process dies mid-workflow

## Problem Statement
Token counts in the ADW workflow are held exclusively in memory during processing. They flow as local variables up the call chain (agent result → phase function → orchestrator) and are only persisted to `state.json` at the end via `completeWorkflow()`. If the orchestrator process crashes or is killed mid-workflow, all token counts accumulated up to that point are permanently lost, making it impossible to track actual API costs for failed or interrupted runs.

## Solution Statement
Introduce a `persistTokenCounts` function in `adws/core/costReport.ts` that writes the current accumulated `ModelUsageMap` and `costUsd` to the orchestrator's `state.json` metadata field via `AgentStateManager.writeState()`. Call this function at the natural boundaries where token counts are already available — after each phase completes and after each agent execution within retry loops. This leverages the existing `AgentStateManager.writeState()` merge semantics (shallow merge with existing state) so that token counts are incrementally updated without overwriting other metadata.

The persistence points are:
1. **Orchestrator level** — After each phase returns its `{ costUsd, modelUsage }`, persist the running totals to `state.json` before starting the next phase.
2. **Retry loops** — After each agent execution within `runUnitTestsWithRetry`, `runE2ETestsWithRetry`, and `runReviewWithRetry`, persist the accumulated totals.

This approach requires no new files, no new dependencies, and minimal changes. It works within existing patterns by adding `persistTokenCounts` calls at strategic points.

## Relevant Files
Use these files to implement the feature:

- **`adws/core/costReport.ts`** — Where `mergeModelUsageMaps` and cost utilities live. The new `persistTokenCounts` function will be added here since it's a cost-related persistence utility.
- **`adws/core/index.ts`** — Core module barrel export. Must export the new `persistTokenCounts` function.
- **`adws/workflowPhases.ts`** — Contains all phase functions (`executePlanPhase`, `executeBuildPhase`, `executeTestPhase`, `executeReviewPhase`) and `completeWorkflow`. Each phase function must call `persistTokenCounts` after accumulating costs. The `handleWorkflowError` function should also persist whatever token counts are available.
- **`adws/agents/testRetry.ts`** — Contains `runUnitTestsWithRetry` and `runE2ETestsWithRetry`. Must persist token counts after each agent execution within retry loops.
- **`adws/agents/reviewRetry.ts`** — Contains `runReviewWithRetry`. Must persist token counts after each agent execution within the retry loop.
- **`adws/adwPlanBuildTestReview.tsx`** — Largest orchestrator. Must persist running totals between phase calls.
- **`adws/adwPlanBuild.tsx`** — Plan+Build orchestrator. Must persist running totals between phase calls.
- **`adws/adwPlanBuildTest.tsx`** — Plan+Build+Test orchestrator. Must persist running totals between phase calls.
- **`adws/adwPlan.tsx`** — Plan-only orchestrator. Single phase, persist after plan phase.
- **`adws/adwBuild.tsx`** — Build-only orchestrator (standalone, doesn't use `workflowPhases` pattern). Must persist after build agent completes.
- **`adws/adwTest.tsx`** — Test-only orchestrator. Must persist after each test phase.
- **`adws/adwPrReview.tsx`** — PR Review orchestrator. Must persist token counts.
- **`adws/__tests__/costReport.test.ts`** — Existing cost report tests. Add tests for `persistTokenCounts`.
- **`adws/__tests__/workflowPhases.test.ts`** — Existing workflow phase tests. Verify `persistTokenCounts` is called.

### New Files
- **`adws/__tests__/persistTokenCounts.test.ts`** — Dedicated unit tests for the `persistTokenCounts` function.

## Implementation Plan
### Phase 1: Foundation
Create the `persistTokenCounts` utility function in `adws/core/costReport.ts`. This function takes an orchestrator state path, the accumulated cost in USD, and the accumulated `ModelUsageMap`, then writes them to the orchestrator's `state.json` metadata using `AgentStateManager.writeState()`. Export it from `adws/core/index.ts`.

### Phase 2: Core Implementation
Integrate `persistTokenCounts` calls at all points where token counts are accumulated:
1. In the retry loops (`testRetry.ts`, `reviewRetry.ts`) — after each agent execution.
2. In the orchestrator entry points (`adwPlanBuildTestReview.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlan.tsx`, `adwBuild.tsx`, `adwTest.tsx`, `adwPrReview.tsx`) — after each phase returns.

### Phase 3: Integration
Wire up the retry loops to receive the `orchestratorStatePath` (already available via their options) and ensure the persisted data doesn't conflict with the final `completeWorkflow()` write. Verify that the `AgentStateManager.writeState()` merge semantics correctly overlay the interim token counts with the final complete data.

## Step by Step Tasks

### Step 1: Add `persistTokenCounts` function to `adws/core/costReport.ts`
- Add a new exported function `persistTokenCounts(statePath: string, costUsd: number, modelUsage: ModelUsageMap): void` that calls `AgentStateManager.writeState(statePath, { metadata: { totalCostUsd: costUsd, modelUsage } })`.
- Since `AgentStateManager.writeState` does a shallow merge at the top level, but `metadata` is a nested object, the function must read existing state first, merge the metadata, and write back. Use the existing `AgentStateManager.readState()` to get current metadata, spread the existing metadata, and overlay `totalCostUsd` and `modelUsage`.
- Import `AgentStateManager` from `./agentState` (already available in the module scope via the core barrel).

### Step 2: Export `persistTokenCounts` from `adws/core/index.ts`
- Add `persistTokenCounts` to the cost report exports in `adws/core/index.ts`.

### Step 3: Write unit tests for `persistTokenCounts`
- Create `adws/__tests__/persistTokenCounts.test.ts`.
- Test that `persistTokenCounts` correctly writes `totalCostUsd` and `modelUsage` to the state metadata.
- Test that it preserves existing metadata fields (e.g., `unitTestsPassed`).
- Test that it handles empty model usage maps gracefully.
- Test that it handles the case where no prior state exists.
- Run tests to validate they pass.

### Step 4: Add persistence calls to orchestrator entry points
- In `adwPlanBuildTestReview.tsx`: after each phase (`executePlanPhase`, `executeBuildPhase`, `executeTestPhase`, `executeReviewPhase`) returns, compute running totals and call `persistTokenCounts`.
- In `adwPlanBuildTest.tsx`: after each phase returns, persist running totals.
- In `adwPlanBuild.tsx`: after each phase returns, persist running totals.
- In `adwPlan.tsx`: after plan phase returns, persist token counts.
- In `adwBuild.tsx`: after build agent completes, persist token counts.
- In `adwTest.tsx`: after each test phase (unit tests, E2E tests), persist running totals.
- In `adwPrReview.tsx`: this orchestrator does not currently track costs per phase — no changes needed here since the phases don't return cost data.

### Step 5: Add persistence calls to retry loops
- In `adws/agents/testRetry.ts` — `runUnitTestsWithRetry`: after each `runTestAgent` and `runResolveTestAgent` call, call `persistTokenCounts(statePath, costUsd, modelUsage)`.
- In `adws/agents/testRetry.ts` — `runE2ETestsWithRetry`: after each `runE2ETestAgent` and `runResolveE2ETestAgent` call, call `persistTokenCounts(statePath, costUsd, modelUsage)`.
- In `adws/agents/reviewRetry.ts` — `runReviewWithRetry`: after each `runReviewAgent` and `runPatchAgent` call, call `persistTokenCounts(statePath, costUsd, modelUsage)`.

### Step 6: Add persistence to error handlers
- In `workflowPhases.ts` — `handleWorkflowError`: accept optional `costUsd` and `modelUsage` parameters and persist them in the error state metadata if provided.
- Update orchestrator error handling paths to pass accumulated token counts to `handleWorkflowError`.

### Step 7: Run validation commands
- Run `npm run lint` to verify code quality.
- Run `npm run build` to verify no build errors.
- Run `npm test` to verify all tests pass with zero regressions.

## Testing Strategy
### Unit Tests
- Test `persistTokenCounts` writes correct data to state metadata.
- Test that existing metadata is preserved when persisting token counts.
- Test edge cases: empty model usage map, zero cost, non-existent state file.
- Test that `persistTokenCounts` does not overwrite non-token-count metadata fields.

### Integration Tests
- Verify that orchestrator workflows persist token counts after each phase by checking mock calls.
- Verify retry loops persist token counts after each agent execution.
- Verify that `completeWorkflow` still correctly writes the final state on top of interim persisted data.

### Edge Cases
- Process crash after partial persistence — verify the last persisted values are readable.
- Empty model usage map persisted correctly.
- Multiple rapid calls to `persistTokenCounts` don't corrupt state.
- Recovery mode: verify persisted token counts from a crashed run are visible in state.json.
- Metadata merge: verify that interim `totalCostUsd` written by `persistTokenCounts` is correctly overwritten by the final `completeWorkflow()` call.

## Acceptance Criteria
- Token counts (both `totalCostUsd` and `modelUsage`) are persisted to `state.json` after each phase completes in all orchestrators.
- Token counts are persisted after each agent execution within test and review retry loops.
- Existing metadata fields in `state.json` are preserved when persisting token counts.
- `completeWorkflow()` continues to write the authoritative final token counts, correctly overwriting any interim values.
- All existing tests pass with zero regressions.
- New unit tests for `persistTokenCounts` pass.
- `npm run lint`, `npm run build`, and `npm test` all succeed.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `AgentStateManager.writeState()` method does a **shallow** merge (`{ ...existingState, ...state }`), meaning the `metadata` field is fully replaced, not deep-merged. The `persistTokenCounts` function must therefore read existing metadata first, merge it with the token count fields, and write the combined metadata object back. This is critical to avoid losing other metadata fields like `unitTestsPassed`.
- This feature is purely backend/ADW infrastructure — it has no UI component and does not affect the Next.js frontend.
- The `adwBuild.tsx` orchestrator is a standalone script that doesn't use the shared `workflowPhases.ts` pattern. It manages its own state directly, so it needs its own `persistTokenCounts` call.
- The `adwPrReview.tsx` orchestrator doesn't currently track per-phase costs (its phases don't return `{ costUsd, modelUsage }`). Adding cost tracking to the PR review workflow is out of scope for this issue.
- Future consideration: the retry loops in `testRetry.ts` and `reviewRetry.ts` receive `orchestratorStatePath` via their options, so the state path is already available — no interface changes are needed.
