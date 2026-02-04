# Bug: TypeError when E2E test agent returns API error with undefined test_name

## Bug Description
When the E2E test agent fails due to an API error (e.g., HTTP 500), the agent returns an error message instead of the expected JSON format. This causes `parseE2ETestResult` to return `null`, which then cascades through the code. When the retry logic in `testRetry.ts` attempts to resolve the failed test, it passes an `E2ETestResult` object with an undefined `test_name` property to `runResolveE2ETestAgent`. This function then crashes when calling `.replace()` on the undefined `test_name` property.

**Symptoms:**
- Error: `TypeError: Cannot read properties of undefined (reading 'replace')`
- Log message shows: `Resolving E2E test: undefined (attempt X/Y)`
- The entire test workflow crashes and aborts

**Expected behavior:** The code should gracefully handle cases where `test_name` is undefined and either use a fallback value or skip the resolution attempt with a meaningful error message.

**Actual behavior:** The code crashes with a TypeError, aborting the entire workflow.

## Problem Statement
The `runResolveE2ETestAgent` function in `testAgent.ts` (line 223) assumes that `failedE2ETest.test_name` is always defined, but when the E2E test agent returns an API error instead of valid JSON, the parsed result can have undefined properties. The code does not validate the `E2ETestResult` object before using its properties.

## Solution Statement
1. Add defensive null/undefined checks in `runResolveE2ETestAgent` to handle cases where `test_name` is undefined
2. Add validation in `testRetry.ts` to skip resolution attempts when the E2E result is missing required properties
3. Add unit tests to verify the fix handles undefined `test_name` gracefully

## Steps to Reproduce
1. Run an E2E test workflow where the Anthropic API returns a 500 error
2. The E2E test agent returns an error message instead of JSON
3. `parseE2ETestResult` returns `null` or an incomplete object
4. The retry loop in `testRetry.ts` attempts to resolve the "failed" test
5. `runResolveE2ETestAgent` crashes when calling `.replace()` on undefined

## Root Cause Analysis
The root cause is a lack of defensive programming in two locations:

1. **`testAgent.ts:223`** - The `runResolveE2ETestAgent` function directly accesses `failedE2ETest.test_name` without checking if it's defined:
   ```typescript
   const testName = failedE2ETest.test_name.replace(/\s+/g, '-').toLowerCase();
   ```

2. **`testRetry.ts:130-133`** - The retry loop logs and passes the `result.test_name` without validating it exists:
   ```typescript
   log(`Resolving E2E test: ${result.test_name} (attempt ${retryCount + 1}/${maxRetries})`, 'info');
   const resolveResult = await runResolveE2ETestAgent(result, logsDir, initState(statePath, 'test-resolver-agent'));
   ```

When the API returns an error, `parseE2ETestResult` attempts to parse the error message as JSON and fails, returning `null`. However, the code flow can still reach the resolution logic with an incomplete or malformed result object.

## Relevant Files
Use these files to fix the bug:

- `adws/agents/testAgent.ts` - Contains the `runResolveE2ETestAgent` function with the vulnerable `.replace()` call on line 223. This is the primary location of the bug.
- `adws/agents/testRetry.ts` - Contains the `runE2ETestsWithRetry` function that calls `runResolveE2ETestAgent` without validating the `E2ETestResult` object. Lines 130-133 need validation.
- `adws/__tests__/testAgent.test.ts` - Contains existing tests for the testAgent module. New tests should be added here to verify the fix.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add validation helper function to testAgent.ts
- Add a helper function `isValidE2ETestResult` that checks if an `E2ETestResult` object has a valid `test_name` property
- The function should return `false` if `test_name` is undefined, null, or not a string

### Step 2: Update runResolveE2ETestAgent to handle undefined test_name
- Add defensive check at the start of `runResolveE2ETestAgent` to validate `failedE2ETest.test_name`
- If `test_name` is undefined, use a fallback value like `'unknown-test'` for the log filename
- Log a warning when using the fallback value
- Keep the original `test_name` (even if undefined) in the JSON payload to the resolver so it can investigate

### Step 3: Update testRetry.ts to validate E2ETestResult before resolution
- In `runE2ETestsWithRetry`, before calling `runResolveE2ETestAgent`, validate that `result.test_name` exists
- If `test_name` is undefined, log an error and skip the resolution attempt for that test
- Update the log message on line 130 to use optional chaining: `result.test_name ?? 'unknown'`

### Step 4: Add unit tests for undefined test_name handling
- Add a test case in `testAgent.test.ts` for `runResolveE2ETestAgent` with undefined `test_name`
- Verify the function doesn't throw and uses the fallback value
- Verify the function still calls the resolver agent with the original (undefined) test_name in the JSON

### Step 5: Run Validation Commands
- Run the validation commands listed below to validate the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- This is a defensive programming fix that prevents the workflow from crashing when external API errors occur
- The fix follows the coding guidelines for error handling: "Implement robust error handling to gracefully manage unexpected situations"
- The fix also follows the TypeScript guidelines: "Avoid ! Non-null Assertion Operator" and to handle potential null or undefined values explicitly
- No new libraries are required for this fix
