# Feature: adwTest and adwPlanBuildTest ADWs

## Feature Description
Create two new AI Developer Workflow (ADW) scripts:
1. **adwTest** - Runs comprehensive validation tests (`/test` and `/test_e2e`) with automatic failure resolution using retry logic
2. **adwPlanBuildTest** - Orchestrates the complete development workflow by executing adwPlan, adwBuild, and adwTest in sequence

The adwTest ADW will invoke test agents using the Claude 'sonnet' model for cost efficiency, but switch to the Claude 'opus' model when invoking failure resolution agents for more complex reasoning. It implements retry logic controlled by the `MAX_TEST_RETRY_ATTEMPTS` environment variable (default: 5).

## User Story
As a developer
I want an automated test runner that can detect and resolve test failures
So that I can run comprehensive validation with automatic error correction

## Problem Statement
Currently, the ADW system has adwPlan and adwBuild phases but lacks an automated testing phase. When tests fail during development:
- Developers must manually identify and fix failing tests
- There's no retry mechanism for transient failures
- The workflow stops without attempting to resolve issues

## Solution Statement
Create an adwTest ADW that:
1. Runs the `/test` command (unit tests, linting, type checks, build)
2. Runs the `/test_e2e` command for each E2E test file
3. When tests fail, invokes `/resolve_failed_test` or `/resolve_failed_e2e_test` with the failure details
4. Retries failed tests up to MAX_TEST_RETRY_ATTEMPTS times
5. Uses 'sonnet' model for test execution and 'opus' model for failure resolution

Additionally, create an adwPlanBuildTest orchestrator that runs the complete workflow: Plan → Build → Test.

## Relevant Files
Use these files to implement the feature:

- `adws/adwPlanBuild.tsx` - Existing orchestrator pattern showing how to chain adw scripts sequentially
- `adws/adwPlan.tsx` - Existing plan ADW for reference on workflow structure and error handling
- `adws/adwBuild.tsx` - Existing build ADW for reference on workflow structure and state management
- `adws/agents/claudeAgent.ts` - Contains `runClaudeAgentWithCommand()` for invoking slash commands with specific models
- `adws/agents/index.ts` - Exports agent functions, will need to export new test agent functions
- `adws/core/config.ts` - Configuration constants, will need MAX_TEST_RETRY_ATTEMPTS
- `adws/core/dataTypes.ts` - Type definitions, may need new workflow stages for test phase
- `adws/core/index.ts` - Re-exports core utilities
- `.claude/commands/test.md` - The `/test` slash command that runs unit tests, linting, type checks, and build
- `.claude/commands/test_e2e.md` - The `/test_e2e` slash command for E2E tests using Playwright
- `.claude/commands/resolve_failed_test.md` - Command for resolving failed unit/build tests
- `.claude/commands/resolve_failed_e2e_test.md` - Command for resolving failed E2E tests

### New Files
- `adws/adwTest.tsx` - New ADW script for test execution with retry logic
- `adws/adwPlanBuildTest.tsx` - New orchestrator that runs Plan → Build → Test
- `adws/agents/testAgent.ts` - Agent functions for running tests and resolving failures
- `adws/__tests__/testAgent.test.ts` - Unit tests for the test agent functions

## Implementation Plan
### Phase 1: Foundation
1. Add MAX_TEST_RETRY_ATTEMPTS configuration constant to `adws/core/config.ts`
2. Add new workflow stages for test phase to `adws/core/dataTypes.ts`
3. Create test agent functions in `adws/agents/testAgent.ts`

### Phase 2: Core Implementation
1. Implement `adwTest.tsx` with:
   - Test execution using `/test` command
   - E2E test discovery and execution using `/test_e2e` command
   - Failure detection and resolution using `/resolve_failed_test` and `/resolve_failed_e2e_test`
   - Retry loop with MAX_TEST_RETRY_ATTEMPTS limit
   - Model switching (sonnet for tests, opus for resolution)

### Phase 3: Integration
1. Create `adwPlanBuildTest.tsx` orchestrator that chains adwPlan → adwBuild → adwTest
2. Export new agent functions from `adws/agents/index.ts`
3. Add unit tests for the new test agent functions

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add MAX_TEST_RETRY_ATTEMPTS configuration

Update `adws/core/config.ts` to add the new environment variable:
- Add `MAX_TEST_RETRY_ATTEMPTS` constant that reads from `process.env.MAX_TEST_RETRY_ATTEMPTS`
- Default value should be 5
- Parse as integer from environment

### Step 2: Add test workflow stages to dataTypes.ts

Update `adws/core/dataTypes.ts` to add new workflow stages:
- Add to `WorkflowStage` type: `'test_running'`, `'test_failed'`, `'test_resolving'`, `'test_passed'`
- Add new `AgentIdentifier` values: `'test-orchestrator'`, `'test-agent'`, `'test-resolver-agent'`

### Step 3: Create test agent functions

Create `adws/agents/testAgent.ts` with the following functions:

```typescript
/**
 * Runs the /test command and returns parsed test results.
 * Uses 'sonnet' model for cost efficiency.
 */
export async function runTestAgent(
  logsDir: string,
  statePath?: string
): Promise<TestAgentResult>

/**
 * Runs the /test_e2e command for a specific E2E test file.
 * Uses 'sonnet' model for cost efficiency.
 */
export async function runE2ETestAgent(
  testFilePath: string,
  logsDir: string,
  statePath?: string
): Promise<E2ETestAgentResult>

/**
 * Runs the /resolve_failed_test command with failure details.
 * Uses 'opus' model for complex reasoning.
 */
export async function runResolveTestAgent(
  failedTest: TestResult,
  logsDir: string,
  statePath?: string
): Promise<AgentResult>

/**
 * Runs the /resolve_failed_e2e_test command with failure details.
 * Uses 'opus' model for complex reasoning.
 */
export async function runResolveE2ETestAgent(
  failedE2ETest: E2ETestResult,
  logsDir: string,
  statePath?: string
): Promise<AgentResult>

/**
 * Discovers E2E test files in the e2e-tests directory.
 */
export function discoverE2ETestFiles(): string[]
```

Define interfaces:
- `TestResult` - Matches the JSON output from `/test` command
- `E2ETestResult` - Matches the JSON output from `/test_e2e` command
- `TestAgentResult` - Contains success status and array of TestResult
- `E2ETestAgentResult` - Contains success status and E2ETestResult

### Step 4: Update agents/index.ts exports

Add exports for the new test agent functions:
- Export `runTestAgent`, `runE2ETestAgent`, `runResolveTestAgent`, `runResolveE2ETestAgent`, `discoverE2ETestFiles`
- Export the new types: `TestResult`, `E2ETestResult`, `TestAgentResult`, `E2ETestAgentResult`

### Step 5: Create adwTest.tsx

Create `adws/adwTest.tsx` with the following workflow:

1. **Argument Parsing**: Accept `[adw-id]` as optional argument
2. **Initialize State**: Create test-orchestrator state
3. **Run Unit Tests**:
   - Invoke `/test` command using 'sonnet' model
   - Parse JSON output to get test results
   - Identify any failed tests
4. **Resolve Unit Test Failures**:
   - For each failed test, invoke `/resolve_failed_test` with 'opus' model
   - Pass the test failure JSON as argument
5. **Retry Unit Tests**: If failures were resolved, re-run `/test`
6. **Run E2E Tests**:
   - Discover E2E test files in `e2e-tests/` directory
   - For each test file, invoke `/test_e2e` with 'sonnet' model
   - Parse JSON output to get test results
7. **Resolve E2E Test Failures**:
   - For each failed E2E test, invoke `/resolve_failed_e2e_test` with 'opus' model
   - Pass the E2E failure JSON as argument
8. **Retry E2E Tests**: If failures were resolved, re-run the specific E2E test
9. **Retry Loop**:
   - Continue retrying until all tests pass or attempt count exceeds MAX_TEST_RETRY_ATTEMPTS
   - Log each retry attempt
10. **Report Results**: Print summary of passed/failed tests

The script should:
- Exit with code 0 if all tests pass
- Exit with code 1 if tests still fail after max retries
- Log progress and status throughout

### Step 6: Create adwPlanBuildTest.tsx

Create `adws/adwPlanBuildTest.tsx` modeled after `adwPlanBuild.tsx`:

1. **Argument Parsing**: Accept `<github-issue-number> [adw-id]`
2. **Run Plan Phase**: Execute `npx tsx adws/adwPlan.tsx <issue> <adw-id>`
3. **Run Build Phase**: Execute `npx tsx adws/adwBuild.tsx <issue> <adw-id>`
4. **Run Test Phase**: Execute `npx tsx adws/adwTest.tsx <adw-id>`
5. **Error Handling**: Stop workflow if any phase fails
6. **Summary**: Print overall workflow completion status

### Step 7: Create unit tests for testAgent

Create `adws/__tests__/testAgent.test.ts` with tests for:
- `discoverE2ETestFiles()` - Test E2E file discovery
- `runTestAgent()` - Mock Claude CLI and verify output parsing
- `runE2ETestAgent()` - Mock Claude CLI and verify output parsing
- `runResolveTestAgent()` - Verify opus model is used
- `runResolveE2ETestAgent()` - Verify opus model is used

Mock the `child_process` module similar to existing tests in `adws/__tests__/`.

### Step 8: Run validation commands

Execute the validation commands to ensure all changes work correctly with zero regressions.

## Testing Strategy
### Unit Tests
- Test `discoverE2ETestFiles()` returns correct file paths
- Test test agent functions correctly parse JSON output from `/test` command
- Test E2E test agent functions correctly parse JSON output from `/test_e2e` command
- Test resolver agents use 'opus' model
- Test retry logic respects MAX_TEST_RETRY_ATTEMPTS limit

### Integration Tests
- Test adwTest.tsx runs to completion with mock test results
- Test adwPlanBuildTest.tsx chains all phases correctly

### Edge Cases
- No E2E test files exist (should skip E2E tests gracefully)
- All tests pass on first attempt (no resolution needed)
- Tests fail and cannot be resolved after max retries
- Invalid JSON output from test agents
- Test command times out

## Acceptance Criteria
- [ ] adwTest.tsx runs `/test` command using 'sonnet' model
- [ ] adwTest.tsx runs `/test_e2e` command for each E2E test file using 'sonnet' model
- [ ] adwTest.tsx invokes `/resolve_failed_test` with 'opus' model when unit tests fail
- [ ] adwTest.tsx invokes `/resolve_failed_e2e_test` with 'opus' model when E2E tests fail
- [ ] adwTest.tsx retries failed tests up to MAX_TEST_RETRY_ATTEMPTS times
- [ ] MAX_TEST_RETRY_ATTEMPTS defaults to 5 and can be configured via environment variable
- [ ] adwPlanBuildTest.tsx executes adwPlan, adwBuild, and adwTest in sequence
- [ ] adwPlanBuildTest.tsx stops workflow if any phase fails
- [ ] All existing tests pass
- [ ] Linting passes
- [ ] Build succeeds

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions
- `npx tsc --noEmit -p adws/tsconfig.json` - Verify ADW TypeScript compiles correctly

## Notes
- The `/test` command outputs JSON array of test results that can be parsed to identify failures
- The `/test_e2e` command outputs JSON with test name, status, screenshots, and error fields
- E2E tests are stored as markdown files in an `e2e-tests/` directory (to be created when needed)
- The retry logic should track which specific tests failed and only retry those
- When no E2E tests exist, the E2E phase should complete successfully with a log message
- Consider adding workflow comments to GitHub issues for adwTest (similar to adwPlan/adwBuild) in a future enhancement
