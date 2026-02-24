# Bug: Playwright runs on incorrect port — E2E_BASE_URL not set from allocated port

## Metadata
issueNumber: `205`
adwId: `playwright-runs-on-i-zz9if2`
issueJson: `{"number":205,"title":"PlayWright runs on incorrect port","body":"/adwPlanBuildTest\n\n/bug\n\nThe env variable, E2E_BASE_URL, is not set when running playwright. This should be set dynamically when portAllocator.ts finds a suitable port. Otherwise PlayWright will run on port 3000","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-02-23T13:37:08Z","comments":[],"actionableComment":null}`

## Bug Description
When Playwright E2E tests are run by the ADW workflow system, they always connect to `http://localhost:3000` instead of the dynamically allocated port. The `portAllocator.ts` correctly allocates a random port (10000–60000) and the `applicationUrl` is stored in `WorkflowConfig`, but this URL is never passed to the Playwright subprocess as the `E2E_BASE_URL` environment variable. Playwright's config (`playwright.config.ts:12`) reads `process.env.E2E_BASE_URL || 'http://localhost:3000'`, so without the env var it defaults to port 3000.

**Expected behavior:** Playwright tests use the dynamically allocated port (e.g., `http://localhost:34567`).
**Actual behavior:** Playwright tests always connect to `http://localhost:3000` regardless of the allocated port.

## Problem Statement
The `runPlaywrightE2ETests()` function in `adws/agents/testAgent.ts` spawns `npx playwright test` without setting `E2E_BASE_URL` in the subprocess environment. Although the `applicationUrl` flows through `WorkflowConfig` → `testPhase.ts` → `testRetry.ts`, it is never forwarded to the `runPlaywrightE2ETests()` call.

## Solution Statement
1. Add an optional `applicationUrl` parameter to `runPlaywrightE2ETests()`.
2. When `applicationUrl` is provided, set `E2E_BASE_URL` in the spawned process's environment so Playwright picks it up.
3. Update the two call sites in `testRetry.ts` (`runE2ETestsWithRetry`) to pass the `applicationUrl` through to `runPlaywrightE2ETests()`.

## Steps to Reproduce
1. ADW workflow allocates a random port (e.g., 34567) via `allocateRandomPort()` in `workflowLifecycle.ts:160`.
2. The `applicationUrl` (`http://localhost:34567`) is stored in `WorkflowConfig`.
3. `executeTestPhase()` in `testPhase.ts` passes `applicationUrl` to `runE2ETestsWithRetry()`.
4. `runE2ETestsWithRetry()` in `testRetry.ts` calls `runPlaywrightE2ETests(cwd)` — only passing `cwd`, not `applicationUrl`.
5. `runPlaywrightE2ETests()` in `testAgent.ts` spawns `npx playwright test` with default env — no `E2E_BASE_URL` set.
6. `playwright.config.ts` falls back to `http://localhost:3000`.

## Root Cause Analysis
The `runPlaywrightE2ETests()` function (`adws/agents/testAgent.ts:278-335`) only accepts an optional `cwd` parameter and does not accept or use an `applicationUrl`. When it spawns the Playwright process (`line 283`), it does not set `E2E_BASE_URL` in the subprocess environment. Meanwhile, `testRetry.ts` receives `applicationUrl` in the `TestRetryOptions` but only uses it for the resolve agent (`runResolveE2ETestAgent`), not for the actual Playwright execution. This is a data-flow gap: the port is allocated and stored but never reaches the Playwright subprocess.

## Relevant Files
Use these files to fix the bug:

- `adws/agents/testAgent.ts` — Contains `runPlaywrightE2ETests()` which spawns Playwright without setting `E2E_BASE_URL`. This is the primary file to fix.
- `adws/agents/testRetry.ts` — Contains `runE2ETestsWithRetry()` which calls `runPlaywrightE2ETests()` without forwarding `applicationUrl`. Two call sites need updating (lines 98 and 148).
- `adws/__tests__/testAgent.test.ts` — Contains existing tests for `runPlaywrightE2ETests()`. Needs a new test to verify `E2E_BASE_URL` is set in the subprocess env.
- `playwright.config.ts` — Reference only. Shows how `E2E_BASE_URL` is consumed (no changes needed).
- `adws/phases/workflowLifecycle.ts` — Reference only. Shows where port is allocated (no changes needed).
- `adws/phases/testPhase.ts` — Reference only. Shows `applicationUrl` already flows to `runE2ETestsWithRetry` (no changes needed).
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Update `runPlaywrightE2ETests()` to accept and use `applicationUrl`
- In `adws/agents/testAgent.ts`, add an optional `applicationUrl` parameter to `runPlaywrightE2ETests()`.
- When spawning the Playwright subprocess (the `spawn('npx', ['playwright', 'test'], ...)` call on line 283), set `E2E_BASE_URL` in the `env` option of the spawn config.
- Inherit the current `process.env` and override `E2E_BASE_URL` with the `applicationUrl` value when provided.
- Update the function's JSDoc to document the new parameter.

### 2. Update `runE2ETestsWithRetry()` to pass `applicationUrl` to Playwright
- In `adws/agents/testRetry.ts`, update the call to `runPlaywrightE2ETests(cwd)` on line 98 to also pass `applicationUrl`.
- Update the retry call to `runPlaywrightE2ETests(cwd)` on line 148 to also pass `applicationUrl`.

### 3. Add a unit test verifying `E2E_BASE_URL` is set in the subprocess env
- In `adws/__tests__/testAgent.test.ts`, add a new test case within the `runPlaywrightE2ETests` describe block that verifies when `applicationUrl` is passed, the spawned process receives `E2E_BASE_URL` in its environment.
- Assert that `spawn` is called with `env` containing `E2E_BASE_URL` set to the provided URL.
- Also add a test verifying that when `applicationUrl` is NOT provided, `E2E_BASE_URL` is not explicitly overridden (inherits from `process.env`).

### 4. Run validation commands
- Run all validation commands listed below to confirm the bug is fixed with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The fix is minimal and surgical: only two source files change (`testAgent.ts` and `testRetry.ts`) plus the test file.
- The `prReviewPhase.ts` flow also benefits from this fix since it calls the same `runE2ETestsWithRetry()` with `applicationUrl`.
- No new libraries are required.
