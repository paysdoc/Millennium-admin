# Feature: adwPrReview should run tests before pushing

## Feature Description
The `adwPrReview` orchestrator should run the validation test suite (via `adwTest` flow) before pushing changes to the origin branch. This ensures that changes made in response to PR review comments don't introduce regressions or break existing functionality. If tests fail after the maximum number of retry attempts, an error comment should be posted to the PR explaining why the issue cannot be resolved.

## User Story
As a developer using the ADW PR review workflow
I want tests to run automatically before my changes are pushed
So that I can be confident that PR review changes don't introduce regressions

## Problem Statement
Currently, `adwPrReview.tsx` implements changes from PR review comments and pushes them directly to the branch without running any validation tests. This can lead to:
- Regressions being introduced by review changes
- Build failures being pushed to the branch
- Type errors or linting issues going undetected
- Code quality degradation over time

## Solution Statement
Integrate the existing test workflow (`adwTest.tsx` logic) into `adwPrReview.tsx` between the implementation phase and the push phase. The solution will:
1. Run unit tests and E2E tests after the build agent completes
2. Attempt to resolve test failures automatically (up to `MAX_TEST_RETRY_ATTEMPTS`)
3. Only push changes if all tests pass
4. Post an error comment to the PR if tests exceed maximum retry attempts, explaining the failure

## Relevant Files
Use these files to implement the feature:

- `adws/adwPrReview.tsx` - Main orchestrator that needs to be modified to include test running. Currently handles Plan → Build → Commit → Push workflow. Needs test phase inserted between Build and Push.
- `adws/adwTest.tsx` - Reference implementation for the test workflow with retry logic. Contains `runUnitTestsWithRetry` and `runE2ETestsWithRetry` patterns.
- `adws/agents/testAgent.ts` - Contains test agent functions: `runTestAgent`, `runE2ETestAgent`, `runResolveTestAgent`, `runResolveE2ETestAgent`, `discoverE2ETestFiles`. These should be imported and used in adwPrReview.
- `adws/core/dataTypes.ts` - Contains `PRReviewWorkflowStage` type that needs new stages for test running.
- `adws/github/workflowComments.ts` - Contains `formatPRReviewWorkflowComment` function that needs to handle new test-related stages.
- `adws/core/config.ts` - Contains `MAX_TEST_RETRY_ATTEMPTS` constant for retry limit.
- `adws/__tests__/testAgent.test.ts` - Existing tests for test agent functionality to reference.

### New Files
- `adws/__tests__/adwPrReview.test.ts` - Unit tests for the new test integration in PR review workflow.

## Implementation Plan
### Phase 1: Foundation
1. Add new PR review workflow stages for test running to `PRReviewWorkflowStage` type
2. Add corresponding comment formatters for the new stages in `workflowComments.ts`
3. Export `MAX_TEST_RETRY_ATTEMPTS` from `core/index.ts` if not already exported

### Phase 2: Core Implementation
1. Import test agent functions into `adwPrReview.tsx`
2. Create helper functions for running tests with retry logic (similar to `adwTest.tsx`)
3. Insert test phase between build completion and commit/push
4. Handle test failures by posting error comment and exiting

### Phase 3: Integration
1. Update workflow comments to reflect test progress
2. Add state tracking for test phase in agent state
3. Ensure proper error handling propagates test failures to PR comments
4. Test the complete flow end-to-end

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add new PR review workflow stages to dataTypes.ts
- Add the following stages to `PRReviewWorkflowStage` type in `adws/core/dataTypes.ts`:
  - `'pr_review_testing'` - Tests are running
  - `'pr_review_test_failed'` - Tests failed and being resolved
  - `'pr_review_test_passed'` - All tests passed
  - `'pr_review_test_max_attempts'` - Tests exceeded max retry attempts

### Step 2: Add comment formatters for new test stages
- Update `formatPRReviewWorkflowComment` function in `adws/github/workflowComments.ts` to handle the new stages:
  - `pr_review_testing`: "Running validation tests before pushing changes..."
  - `pr_review_test_failed`: "Tests failed, attempting automatic resolution..."
  - `pr_review_test_passed`: "All tests passed!"
  - `pr_review_test_max_attempts`: "Tests exceeded maximum retry attempts. Changes not pushed." with detailed error info

### Step 3: Update PRReviewWorkflowContext interface
- Add optional fields to `PRReviewWorkflowContext` in `adws/github/workflowComments.ts`:
  - `testAttempt?: number` - Current test attempt number
  - `maxTestAttempts?: number` - Maximum attempts allowed
  - `failedTests?: string[]` - List of failed test names

### Step 4: Import test agent functions in adwPrReview.tsx
- Add imports from `'./agents'`:
  - `runTestAgent`
  - `runE2ETestAgent`
  - `runResolveTestAgent`
  - `runResolveE2ETestAgent`
  - `discoverE2ETestFiles`
  - `TestResult`
  - `E2ETestResult`
- Add import from `'./core'`:
  - `MAX_TEST_RETRY_ATTEMPTS`

### Step 5: Create test helper functions in adwPrReview.tsx
- Create `runUnitTestsWithRetry` function (adapted from adwTest.tsx):
  - Takes `logsDir`, `orchestratorStatePath`, `maxRetries` as parameters
  - Returns `{ passed: boolean; costUsd: number; totalRetries: number; failedTests: TestResult[] }`
  - Runs unit tests and attempts resolution on failures
  - Posts `pr_review_test_failed` comments during resolution attempts

- Create `runE2ETestsWithRetry` function (adapted from adwTest.tsx):
  - Takes `logsDir`, `orchestratorStatePath`, `maxRetries` as parameters
  - Returns `{ passed: boolean; costUsd: number; totalRetries: number; failedTests: E2ETestResult[] }`
  - Runs E2E tests and attempts resolution on failures

### Step 6: Insert test phase in main workflow
- After `pr_review_implemented` stage and before `pr_review_committing`:
  - Post `pr_review_testing` workflow comment
  - Run unit tests with retry logic
  - If unit tests pass, run E2E tests with retry logic
  - If all tests pass:
    - Post `pr_review_test_passed` workflow comment
    - Continue to commit and push phases
  - If tests fail after max attempts:
    - Post `pr_review_test_max_attempts` workflow comment with failure details
    - Update orchestrator state with failure
    - Exit with error code (do not push changes)

### Step 7: Update error handling
- Ensure `pr_review_test_max_attempts` error comment includes:
  - The number of retry attempts made
  - List of failing tests
  - Suggestion for manual intervention
- Update the `PRReviewWorkflowContext` error message to include test failure context

### Step 8: Update file header documentation
- Update the header comment in `adwPrReview.tsx` to reflect the new workflow:
  ```
  * Workflow:
  * 1. Fetch PR details and review comments
  * 2. Detect unaddressed review comments
  * 3. Run Plan Agent to create revision plan
  * 4. Run Build Agent to implement changes
  * 5. Run validation tests with automatic failure resolution
  * 6. Commit and push to the PR branch (only if tests pass)
  ```

### Step 9: Create unit tests for the new functionality
- Create `adws/__tests__/adwPrReview.test.ts` with tests:
  - Test that test phase is invoked after build phase
  - Test that push is skipped when tests fail
  - Test that error comment is posted on max retry attempts
  - Test that workflow completes when tests pass

### Step 10: Run validation commands
- Run all validation commands to verify no regressions

## Testing Strategy
### Unit Tests
- Test `runUnitTestsWithRetry` helper function with mocked test agent
- Test `runE2ETestsWithRetry` helper function with mocked test agent
- Test error comment formatting for test failures
- Test workflow state transitions during test phase

### Integration Tests
- Verify test phase is correctly positioned in workflow
- Verify push is blocked when tests fail
- Verify error comment contains meaningful failure information
- Verify successful test run allows push to proceed

### Edge Cases
- All tests pass on first attempt
- Tests fail then pass after resolution
- Tests fail after max retry attempts
- No E2E tests configured (should still pass)
- Test agent execution error (not test failure)
- Network errors during test execution

## Acceptance Criteria
- [ ] Tests run automatically after build phase in PR review workflow
- [ ] Changes are only pushed if all tests pass
- [ ] Test failures are automatically resolved (up to MAX_TEST_RETRY_ATTEMPTS)
- [ ] Clear error comment is posted to PR when tests exceed max attempts
- [ ] Error comment includes: attempt count, failing tests, suggestion for resolution
- [ ] Workflow status comments reflect test progress
- [ ] No regressions in existing PR review functionality
- [ ] Unit tests cover the new test integration logic
- [ ] All validation commands pass

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Validate ADW TypeScript types
- `npm test -- --run adws/__tests__` - Run ADW tests to validate no regressions
- `npm test` - Run all tests to validate feature works with zero regressions

## Notes
- The test integration should reuse patterns from `adwTest.tsx` for consistency
- The `MAX_TEST_RETRY_ATTEMPTS` constant from config should be used (default: 5)
- Test failures should not leave the branch in an inconsistent state - changes are only pushed after tests pass
- The error comment should provide actionable information for manual resolution
- Consider that running tests adds latency to the PR review workflow, but ensures code quality
- The existing `testAgent.ts` functions handle all the low-level test execution - this feature only needs to orchestrate them
- State tracking through `AgentStateManager` should include test phase metadata for debugging
