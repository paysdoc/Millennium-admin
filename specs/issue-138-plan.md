# Feature: Use Given ADW Orchestrator from Issue

## Feature Description
Update the ADW trigger system to route issues to the orchestrator specified by the ADW command in the issue body, rather than only using the issue-type-based defaults. Currently, `getWorkflowScript()` only handles `/adw_plan_build_test_review` as a direct orchestrator override. All other ADW commands are mapped to issue types first, and then the issue type determines which orchestrator to use via a fixed switch statement. This feature adds a comprehensive mapping from ADW commands to their corresponding orchestrator scripts, so that when a user specifies an ADW command like `/adw_plan_build` in an issue, the trigger spawns the matching `adwPlanBuild.tsx` orchestrator directly. The default issue-type-based routing remains as the fallback for commands without a dedicated orchestrator or when no ADW command is specified.

## User Story
As a developer using the ADW system
I want to specify which orchestrator to use via an ADW command in my issue
So that I can control the exact workflow stages executed for my issue

## Problem Statement
The `getWorkflowScript()` function only has a special case for `/adw_plan_build_test_review`. All other ADW commands (e.g., `/adw_plan`, `/adw_build`, `/adw_plan_build`, `/adw_plan_build_test`) are ignored when determining the orchestrator, and routing falls back to the issue type. This means specifying `/adw_plan_build` in an issue classified as `/feature` still routes to `adwPlanBuildTest.tsx` instead of the intended `adwPlanBuild.tsx`. Users cannot control which orchestrator runs unless they happen to use the one hard-coded special case.

## Solution Statement
Add a `adwCommandToOrchestratorMap` constant in `dataTypes.ts` that maps each ADW command to its corresponding orchestrator script path (where one exists). Update `getWorkflowScript()` in `issueClassifier.ts` to consult this map first: if the ADW command has a mapped orchestrator, return it directly; otherwise fall back to the existing issue-type-based switch. This approach is data-driven, extensible, and preserves backward compatibility.

## Relevant Files
Use these files to implement the feature:

- `adws/core/dataTypes.ts` - Contains `AdwSlashCommand` type and `adwCommandToIssueTypeMap`. Add the new `adwCommandToOrchestratorMap` here alongside the existing mapping constants.
- `adws/triggers/issueClassifier.ts` - Contains `getWorkflowScript()` which needs to be updated to use the new orchestrator map instead of only handling a single ADW command.
- `adws/__tests__/issueClassifier.test.ts` - Contains tests for `getWorkflowScript()`. Needs updated and new tests covering orchestrator routing for all ADW commands.

## Implementation Plan
### Phase 1: Foundation
Add the `adwCommandToOrchestratorMap` constant to `adws/core/dataTypes.ts`. This map provides the single source of truth for which ADW commands have dedicated orchestrator scripts. Commands without a dedicated orchestrator (e.g., `/adw_review`, `/adw_document`, `/adw_patch`) are omitted from the map, causing the system to fall back to issue-type-based routing.

### Phase 2: Core Implementation
Update `getWorkflowScript()` in `adws/triggers/issueClassifier.ts` to look up the ADW command in `adwCommandToOrchestratorMap` before falling back to the issue-type switch. Remove the hard-coded `/adw_plan_build_test_review` check since it will be covered by the map.

### Phase 3: Integration
Update existing tests and add comprehensive new tests in `adws/__tests__/issueClassifier.test.ts` to verify that every ADW command with a mapped orchestrator routes correctly, and that commands without a mapped orchestrator fall back to issue-type-based routing.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `adwCommandToOrchestratorMap` to `adws/core/dataTypes.ts`
- Add a new exported constant `adwCommandToOrchestratorMap` of type `Partial<Record<AdwSlashCommand, string>>` after the existing `adwCommandToIssueTypeMap`.
- Map each ADW command that has a dedicated orchestrator script:
  - `/adw_plan` → `'adws/adwPlan.tsx'`
  - `/adw_build` → `'adws/adwBuild.tsx'`
  - `/adw_test` → `'adws/adwTest.tsx'`
  - `/adw_plan_build` → `'adws/adwPlanBuild.tsx'`
  - `/adw_plan_build_test` → `'adws/adwPlanBuildTest.tsx'`
  - `/adw_plan_build_test_review` → `'adws/adwPlanBuildTestReview.tsx'`
  - `/adw_sdlc` → `'adws/adwPlanBuildTestReview.tsx'` (most complete orchestrator)
- Omit ADW commands without dedicated orchestrators: `/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build_review`, `/adw_plan_build_document`. These will fall back to issue-type-based routing.
- Add a JSDoc comment explaining the purpose and fallback behavior.
- Export the new constant from `adws/core/index.ts` if not already re-exported via barrel.

### Step 2: Update `getWorkflowScript()` in `adws/triggers/issueClassifier.ts`
- Import `adwCommandToOrchestratorMap` from `'../core'`.
- Replace the hard-coded `/adw_plan_build_test_review` check with a lookup in `adwCommandToOrchestratorMap`.
- When `adwCommand` is provided and exists in the map, return the mapped orchestrator script path.
- When `adwCommand` is not in the map (or is undefined), fall through to the existing issue-type switch.
- Update the JSDoc comment for `getWorkflowScript()` to document the new behavior.

### Step 3: Update tests in `adws/__tests__/issueClassifier.test.ts`
- Add `adwCommandToOrchestratorMap` to the mock for `'../core'`.
- Update the existing `getWorkflowScript` test: `'returns adwPlanBuildTestReview when adwCommand is /adw_plan_build_test_review'` — this test should still pass since the behavior is unchanged (now driven by the map instead of a hard-coded check).
- Update the test `'ignores adwCommand when not /adw_plan_build_test_review'` — this test needs to change since `/adw_plan_build_test` now routes to `adwPlanBuildTest.tsx` via the map. Update it to test only commands that are NOT in the map (e.g., `/adw_patch`, `/adw_document`).
- Add new tests for each mapped ADW command to verify correct orchestrator routing:
  - `/adw_plan` → `adwPlan.tsx`
  - `/adw_build` → `adwBuild.tsx`
  - `/adw_test` → `adwTest.tsx`
  - `/adw_plan_build` → `adwPlanBuild.tsx`
  - `/adw_plan_build_test` → `adwPlanBuildTest.tsx`
  - `/adw_sdlc` → `adwPlanBuildTestReview.tsx`
- Add tests for unmapped commands falling back to issue-type routing:
  - `/adw_patch` with issueType `/bug` → `adwPlanBuild.tsx`
  - `/adw_document` with issueType `/chore` → `adwPlanBuildTest.tsx`
  - `/adw_review` with issueType `/pr_review` → `adwPlanBuild.tsx`
- Add a parametric test that iterates over all entries in `adwCommandToOrchestratorMap` to verify each routes to the correct orchestrator.

### Step 4: Run validation commands
- Run `npm run lint` to ensure code quality.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate all tests pass with zero regressions.

## Testing Strategy
### Unit Tests
- Test `getWorkflowScript()` with every ADW command that has a mapped orchestrator to verify direct routing.
- Test `getWorkflowScript()` with ADW commands that lack a mapped orchestrator to verify fallback to issue-type routing.
- Test `getWorkflowScript()` with no ADW command to verify default issue-type routing.
- Parametric test iterating over `adwCommandToOrchestratorMap` entries to ensure comprehensive coverage.

### Integration Tests
- The existing `classifyIssueForTrigger` and `classifyGitHubIssue` tests indirectly validate the end-to-end flow. No additional integration tests are needed since the change is isolated to `getWorkflowScript()`.

### Edge Cases
- `adwCommand` is `undefined` — should fall back to issue-type routing.
- `adwCommand` is a valid `AdwSlashCommand` but not in the orchestrator map (e.g., `/adw_patch`) — should fall back to issue-type routing.
- `adwCommand` is mapped but `issueType` would route differently — the map should take priority.
- `issueType` is an unexpected value with no ADW command — should use the default fallback (`adwPlanBuildTest.tsx`).

## Acceptance Criteria
- All ADW commands with dedicated orchestrators (`/adw_plan`, `/adw_build`, `/adw_test`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_test_review`, `/adw_sdlc`) route to their corresponding orchestrator script when specified in an issue.
- ADW commands without dedicated orchestrators (`/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build_review`, `/adw_plan_build_document`) fall back to issue-type-based routing.
- When no ADW command is specified, the default issue-type-based routing is unchanged.
- The `adwCommandToOrchestratorMap` is the single source of truth for ADW-to-orchestrator mapping, making it easy to add new orchestrators in the future.
- All existing tests continue to pass.
- New tests cover all mapped and unmapped ADW commands.
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This feature does not affect the UI, so no E2E test is needed.
- The `adwClearComments.tsx` script is a utility, not a workflow orchestrator, and is intentionally excluded from the map.
- The `adwPrReview.tsx` script is triggered separately by PR review events and is not part of the ADW command routing, so it is also excluded from the map.
- Future orchestrators can be added by simply extending `adwCommandToOrchestratorMap` with new entries — no changes to `getWorkflowScript()` logic will be needed.
