# PR-Review: Coding Guidelines Compliance for Issue #49

## PR-Review Description
The PR review comment states that "Coding guidelines as stipulated in `/guidelines` have not been adhered to". After analyzing the implementation against the coding guidelines in `guidelines/coding_guidelines.md`, the following violations were identified:

1. **File Size Violations (>150 lines guideline)**:
   - `adwPrReview.tsx` = 598 lines (exceeds 150 line limit by 448 lines)
   - `adwTest.tsx` = 412 lines (exceeds 150 line limit by 262 lines)
   - `workflowComments.ts` = 703 lines (exceeds 150 line limit by 553 lines)

2. **Code Duplication Violations (Modular Design guideline)**:
   - `runUnitTestsWithRetry` function in `adwPrReview.tsx` (lines 61-145) is nearly identical to the same function in `adwTest.tsx` (lines 103-174)
   - `runE2ETestsWithRetry` function in `adwPrReview.tsx` (lines 151-269) is nearly identical to the same function in `adwTest.tsx` (lines 180-291)
   - This violates "Structure the code in a modular way to promote reusability and separation of concerns"

3. **Function Reusability (Higher-Order Functions guideline)**:
   - The test retry logic should be extracted to a shared module for reuse
   - The duplicated functions could be replaced with a single shared implementation

## Summary of Original Implementation Plan
The original plan at `specs/issue-49-plan.md` implemented the feature to add test running before pushing in the PR review workflow. The implementation:
- Added new `PRReviewWorkflowStage` types for test stages
- Added comment formatters for test stages in `workflowComments.ts`
- Added `runUnitTestsWithRetry` and `runE2ETestsWithRetry` functions in `adwPrReview.tsx`
- Integrated test phase between build completion and commit/push
- Created unit tests in `adws/__tests__/adwPrReview.test.ts`

However, the implementation copied test retry functions from `adwTest.tsx` rather than extracting shared logic, leading to code duplication and file size violations.

## Relevant Files
Use these files to resolve the review:

- `adws/adwPrReview.tsx` - Main PR review orchestrator (598 lines). Needs to import shared test utilities instead of defining them locally.
- `adws/adwTest.tsx` - Test workflow orchestrator (412 lines). Needs to use shared test utilities instead of local definitions.
- `adws/github/workflowComments.ts` - Workflow comment formatting (703 lines). Needs to be split into smaller focused modules.
- `guidelines/coding_guidelines.md` - Reference for coding standards that must be followed.

### New Files
- `adws/agents/testRetry.ts` - New shared module for test retry logic. Will contain `runUnitTestsWithRetry` and `runE2ETestsWithRetry` functions.
- `adws/github/workflowCommentsBase.ts` - Base workflow comment utilities (truncate, stage parsing).
- `adws/github/workflowCommentsIssue.ts` - Issue workflow comment formatters.
- `adws/github/workflowCommentsPR.ts` - PR review workflow comment formatters.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create shared test retry module
- Create `adws/agents/testRetry.ts` with the shared test retry logic
- Move `runUnitTestsWithRetry` function from `adwTest.tsx` to the new module
- Move `runE2ETestsWithRetry` function from `adwTest.tsx` to the new module
- Add type definitions for `TestRetryResult` and `TestRetryOptions`
- Make functions accept optional callback for posting workflow comments (for PR review use case)
- Export all functions and types from the new module
- Ensure file stays under 150 lines

### Step 2: Update agents index to export test retry utilities
- Update `adws/agents/index.ts` to export the new test retry functions and types from `testRetry.ts`

### Step 3: Refactor adwTest.tsx to use shared module
- Remove local `runUnitTestsWithRetry` function definition
- Remove local `runE2ETestsWithRetry` function definition
- Import `runUnitTestsWithRetry` and `runE2ETestsWithRetry` from `./agents`
- Verify file size is now under 150 lines (should reduce from 412 to ~240 lines)

### Step 4: Refactor adwPrReview.tsx to use shared module
- Remove local `TestRetryResult` interface definition
- Remove local `runUnitTestsWithRetry` function definition
- Remove local `runE2ETestsWithRetry` function definition
- Import shared functions from `./agents`
- Create wrapper functions that add PR comment posting callbacks
- Verify file size is reduced significantly (should reduce from 598 to ~390 lines)

### Step 5: Split workflowComments.ts into smaller modules
- Create `adws/github/workflowCommentsBase.ts` with:
  - `truncateText` utility function
  - `STAGE_ORDER` constant
  - `STAGE_HEADER_MAP` constant
  - Stage parsing functions (`parseWorkflowStageFromComment`, `extractAdwIdFromComment`, etc.)
  - `detectRecoveryState` function
  - Target: ~100 lines

- Create `adws/github/workflowCommentsIssue.ts` with:
  - `WorkflowContext` interface
  - All issue workflow comment formatters (formatStartingComment, formatClassifiedComment, etc.)
  - `formatWorkflowComment` function
  - `postWorkflowComment` function
  - Target: ~150 lines

- Create `adws/github/workflowCommentsPR.ts` with:
  - `PRReviewWorkflowContext` interface
  - All PR review workflow comment formatters
  - `formatPRReviewWorkflowComment` function
  - `postPRWorkflowComment` function
  - Target: ~150 lines

- Update `adws/github/workflowComments.ts` to:
  - Re-export all types and functions from the split modules
  - Keep as barrel file for backwards compatibility
  - Target: ~30 lines

### Step 6: Update github index exports
- Ensure `adws/github/index.ts` continues to export all necessary types and functions
- No changes should be needed if workflowComments.ts re-exports correctly

### Step 7: Update imports in test files
- Update `adws/__tests__/adwPrReview.test.ts` if any imports changed
- Verify all imports resolve correctly

### Step 8: Run validation commands
- Run all validation commands to verify no regressions and all guidelines are now followed

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Validate ADW TypeScript types
- `npm test -- --run adws/__tests__` - Run ADW tests to validate no regressions
- `npm test` - Run all tests to validate the review is complete with zero regressions

## Notes
- The key insight is that the test retry logic was duplicated rather than shared. By extracting it to `adws/agents/testRetry.ts`, both `adwTest.tsx` and `adwPrReview.tsx` can use the same implementation.
- The `workflowComments.ts` file grew to 703 lines because it handles both issue workflow comments and PR review workflow comments. Splitting it into focused modules improves maintainability.
- The shared test retry functions should accept optional callbacks for posting status updates, allowing `adwPrReview.tsx` to post PR comments during test execution without duplicating the retry logic.
- After this refactoring:
  - `testRetry.ts` should be ~120 lines (shared test retry logic)
  - `adwTest.tsx` should be ~120 lines (orchestrator only)
  - `adwPrReview.tsx` should be ~140 lines (orchestrator only)
  - `workflowCommentsBase.ts` should be ~100 lines
  - `workflowCommentsIssue.ts` should be ~150 lines
  - `workflowCommentsPR.ts` should be ~150 lines
  - All files will comply with the 150 line guideline
