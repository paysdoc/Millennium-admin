# Bug: E2E test resolution skipped due to testName/test_name property mismatch

## Metadata
issueNumber: `0`
adwId: `update-bug-chore-and-60g8oc`
issueJson: `E2E`

## Bug Description
When E2E tests fail during the ADW test retry workflow, the resolution step is skipped with the error "Skipping E2E test resolution: missing or invalid test_name". This causes the retry loop to burn through all retry attempts without ever attempting to resolve the failing test, ultimately blocking PR creation.

**Symptoms:**
- `test_characters_overview` passes (has its own `Output Format` section with `test_name`)
- Other E2E tests that fail report "Skipping E2E test resolution: missing or invalid test_name" on every retry
- The retry loop exhausts all attempts doing nothing
- PR is never created

**Expected behavior:** When an E2E test fails, the retry loop should resolve the failure and re-run the test.

**Actual behavior:** The retry loop detects an invalid `test_name`, skips resolution, increments the retry counter, and repeats — wasting all retries.

## Problem Statement
There is a property name mismatch between the E2E test runner command output format and the TypeScript interface that parses the results:

1. `.claude/commands/test_e2e.md` specifies `testName` (camelCase) in its `Output Format` section
2. The `E2ETestResult` TypeScript interface in `adws/agents/testAgent.ts` expects `test_name` (snake_case)
3. E2E test files that don't define their own `Output Format` (`test_character_detail.md`, `test_character_edit.md`, `test_character_image_display.md`) inherit the camelCase format from the runner
4. At runtime, `extractJson<E2ETestResult>()` parses the JSON with `testName` but the code accesses `result.test_name` which is `undefined`
5. `isValidE2ETestResult()` returns `false`, causing the retry loop to skip resolution entirely

Additionally, the retry loop has a secondary issue: when `isValidE2ETestResult` fails, the code only increments the retry counter without attempting any recovery, creating a dead loop that wastes all retry attempts.

## Solution Statement
Apply a three-part fix, aligning everything to camelCase (`testName`) to match the `test_e2e.md` output format:

1. **Fix the TypeScript interface** in `adws/agents/testAgent.ts` to use `testName` (camelCase), matching the `.claude/commands/test_e2e.md` output format
2. **Add runtime normalization** in `runE2ETestAgent()` to handle the `test_name` → `testName` mapping as a defensive fallback, so any results using the old snake_case format are handled gracefully
3. **Fix the retry dead loop** in `testRetry.ts` so that when `testName` is missing, it derives the name from the test file path (which is always available) and proceeds with resolution instead of skipping

## Steps to Reproduce
1. Trigger the ADW test workflow (e.g., `npx tsx adws/adwPlanBuildTestReview.tsx <issue>`)
2. Have at least one E2E test file without its own `Output Format` section (e.g., `test_character_detail.md`)
3. When the E2E test fails, the agent returns JSON with `testName` (camelCase) per `test_e2e.md`
4. The retry loop logs "Skipping E2E test resolution: missing or invalid test_name" for every retry
5. After max retries, the workflow fails with "E2E tests failed after maximum retry attempts"

## Root Cause Analysis
The root cause is a naming convention mismatch between two sources of truth:

- **`.claude/commands/test_e2e.md` (line 53)**: Defines the output format with `testName` (camelCase)
- **`adws/agents/testAgent.ts` (line 29)**: Defines the `E2ETestResult` interface with `test_name` (snake_case)

When the E2E test agent runs, it follows the `test_e2e.md` output format and produces JSON with `testName`. The `extractJson<E2ETestResult>()` call at `testAgent.ts:138` parses this into a JavaScript object, but TypeScript generics don't enforce property names at runtime. The resulting object has `testName` but not `test_name`.

The `isValidE2ETestResult()` function at `testAgent.ts:63-65` checks `typeof result.test_name === 'string'`, which returns `false` because `result.test_name` is `undefined`.

In the retry loop at `testRetry.ts:125-129`, when this validation fails, the code skips resolution and just increments `retryCount`, creating a dead loop. The same invalid result is checked on every iteration with the same outcome.

The bug was masked for `test_characters_overview.md` because it defines its own `Output Format` section with `test_name` (snake_case), which happened to match the interface.

## Relevant Files
Use these files to fix the bug:

- `adws/README.md` — Context for the ADW system architecture
- `.claude/commands/test_e2e.md` — E2E test runner command with `testName` in output format (line 53) — this is already correct (camelCase), no changes needed
- `adws/agents/testAgent.ts` — **Primary fix target**: Contains `E2ETestResult` interface (line 28-35) with incorrect `test_name` that must be changed to `testName`, `isValidE2ETestResult` (line 63-65), and `runE2ETestAgent` (line 116-151) where normalization should be added
- `adws/agents/testRetry.ts` — Contains the retry loop (line 111-153) with the dead loop bug when `isValidE2ETestResult` fails; all `test_name` references must be updated to `testName`
- `adws/__tests__/testAgent.test.ts` — Existing tests for `testAgent.ts` that need `test_name` references updated to `testName` and new test cases for normalization logic
- `adws/__tests__/cwdPropagation.test.ts` — Contains test data with `test_name` references that must be updated to `testName`
- `e2e-tests/test_character_detail.md` — E2E test file missing `Output Format` section
- `e2e-tests/test_character_edit.md` — E2E test file missing `Output Format` section
- `e2e-tests/test_character_image_display.md` — E2E test file missing `Output Format` section
- `e2e-tests/test_characters_overview.md` — E2E test file with `Output Format` section that needs `test_name` updated to `testName`
- `guidelines/coding_guidelines.md` — Coding guidelines to follow
- `.claude/commands/resolve_failed_e2e_test.md` — E2E test resolver command (references `test_name` in its instructions, must be updated to `testName`)

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update the E2ETestResult interface in testAgent.ts
- Read `adws/agents/testAgent.ts`
- In the `E2ETestResult` interface (line 28-35), change `test_name: string` to `testName: string`
- Update `isValidE2ETestResult()` (line 63-65) to check `result.testName` instead of `result.test_name`
- Update the JSDoc comments to reference `testName` instead of `test_name`
- Update the return type annotation from `{ test_name: string }` to `{ testName: string }`
- Update all other references to `test_name` in this file to `testName` (e.g., in `runResolveE2ETestAgent`)

### Step 2: Add runtime normalization in testAgent.ts
- In `runE2ETestAgent()` (after line 138 where `extractJson` is called), add normalization logic:
  - After parsing the JSON result, check if the result has `test_name` but not `testName`
  - If so, copy `test_name` to `testName` to handle the snake_case variant gracefully
  - This is a defensive fallback for any in-flight or cached results that still use the old format
- Keep the normalization minimal and focused — just the property name mapping

### Step 3: Fix the retry dead loop in testRetry.ts
- Read `adws/agents/testRetry.ts`
- Update all references from `test_name` to `testName` throughout the file (log messages, property accesses, etc.)
- In `runE2ETestsWithRetry()`, modify the `isValidE2ETestResult` failure branch (lines 125-129):
  - When `testName` is missing, derive it from the test file path using `path.basename(testFile, '.md')`
  - Set `result.testName` to the derived name
  - Proceed with resolution instead of skipping (remove the `continue` statement)
  - Log a warning that `testName` was derived from file path as a fallback
- This ensures the retry loop always attempts resolution even if `testName` is malformed

### Step 4: Add Output Format sections to E2E test files
- Read `e2e-tests/test_characters_overview.md` for reference (has an `Output Format` section)
- Update `e2e-tests/test_characters_overview.md` to change `test_name` to `testName` in its Output Format section
- Add an `Output Format` section to each E2E test file that is missing one:
  - `e2e-tests/test_character_detail.md` — add with `testName: "Character Detail Page"`
  - `e2e-tests/test_character_edit.md` — add with `testName: "Character Edit Functionality"`
  - `e2e-tests/test_character_image_display.md` — add with `testName: "Character Image Display"`
- Each output format should follow the same structure as `test_characters_overview.md` with `testName`, `status`, `screenshots`, and `error` fields
- Use camelCase `testName` to match the `E2ETestResult` TypeScript interface and `test_e2e.md` output format

### Step 5: Update resolve_failed_e2e_test.md
- Read `.claude/commands/resolve_failed_e2e_test.md`
- Update references from `test_name` to `testName` in the instructions (line 9: `test_name`: The name of the failing test → `testName`)
- Update `test_path` to `testPath` for consistency if referenced in the E2E result interface, but only if the interface uses camelCase for that field too

### Step 6: Update unit tests
- Read `adws/__tests__/testAgent.test.ts`
- Update all `test_name` references in test data and assertions to `testName`
- Add test cases to the `runE2ETestAgent` describe block:
  - Test that when agent output contains `test_name` (snake_case), the result still has a valid `testName` (camelCase) via normalization
  - Test that when agent output contains `testName` (camelCase), it works as expected (no regression)
- Add test cases to the `isValidE2ETestResult` describe block:
  - Test that an object with only `test_name` (no `testName`) returns false (since normalization happens before this check)
- Read `adws/__tests__/cwdPropagation.test.ts`
- Update all `test_name` references in test data to `testName`

### Step 7: Run validation commands
- Execute the validation commands below to confirm the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `E2ETestResult` TypeScript interface uses `test_name` (snake_case) which contradicts the camelCase convention used in `.claude/commands/test_e2e.md` output format. The fix aligns the interface and all code to camelCase (`testName`).
- The `test_e2e.md` output format already uses `testName` (camelCase) and is the source of truth — no changes needed there.
- Note: The `TestResult` interface (for unit tests, not E2E) also uses `test_name` and is aligned with `.claude/commands/test.md` which also uses `test_name`. That is a separate convention for non-E2E tests and is NOT in scope for this fix.
- No new libraries are required for this fix.
- The normalization in Step 2 is deliberately kept as a temporary defensive measure. Once all E2E test files have the correct output format with `testName`, agents will produce `testName` natively. The normalization prevents breakage during the transition or if any E2E test file still uses the old `test_name` format.
