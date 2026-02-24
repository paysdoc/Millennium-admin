# Chore: Add adwId to logger output

## Metadata
issueNumber: `169`
adwId: `lt08nl`
issueJson: `## GitHub Issue #169\n**Title:** Update logger\n**State:** OPEN\n**Author:** paysdoc\n**Labels:** none\n**Created:** 2026-02-18T09:23:10Z\n\n### Description\nUpdate the logger to always show the adwId next to the date separated by space\n\n### Comments\nNo comments.`

## Chore Description
Update the `log()` utility function in `adws/core/utils.ts` so that every log line includes the `adwId` next to the ISO timestamp, separated by a space. The current log format is:

```
{emoji} [{timestamp}] {message}
```

The new format should be:

```
{emoji} [{timestamp}] [{adwId}] {message}
```

When no `adwId` has been set, the logger should omit the `adwId` bracket entirely to avoid visual noise (e.g., during early startup before an `adwId` is generated). This is achieved via a module-level setter/getter pattern so that callers do not need to pass `adwId` on every `log()` call.

## Relevant Files
Use these files to resolve the chore:

- **`adws/core/utils.ts`** — Contains the `log()` function definition, `LogLevel` type, `LOG_PREFIXES`, and `COLORS` constants. This is the primary file to modify.
- **`adws/core/index.ts`** — Barrel export for the core module. Must export the new `setLogAdwId` and `getLogAdwId` functions.
- **`adws/__tests__/generateAdwId.test.ts`** — Existing test file for utils. A new dedicated test file for the logger will be added alongside it.
- **`adws/phases/workflowLifecycle.ts`** — The main workflow lifecycle that generates the `adwId` early in the process. This is where `setLogAdwId` should be called so all subsequent log lines include the `adwId`.
- **`adws/adwBuild.tsx`** — Standalone build orchestrator that generates its own `adwId`. Must call `setLogAdwId`.
- **`adws/adwDocument.tsx`** — Standalone document orchestrator that generates its own `adwId`. Must call `setLogAdwId`.
- **`adws/adwTest.tsx`** — Standalone test orchestrator that may generate its own `adwId`. Must call `setLogAdwId`.
- **`adws/adwPatch.tsx`** — Standalone patch orchestrator that generates its own `adwId`. Must call `setLogAdwId`.
- **`adws/adwClearComments.tsx`** — Standalone utility that does not use `adwId`; no changes needed.
- **`adws/healthCheck.tsx`** — Standalone utility that does not use `adwId`; no changes needed.
- **`adws/triggers/trigger_cron.ts`** — Trigger that spawns child processes; does not use `adwId` directly; no changes needed.
- **`adws/triggers/trigger_webhook.ts`** — Trigger that spawns child processes; does not use `adwId` directly; no changes needed.
- **`guidelines/coding_guidelines.md`** — Coding guidelines to follow during implementation.

### New Files
- **`adws/__tests__/log.test.ts`** — New unit test file for the `log()` function covering the `adwId` integration.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add module-level adwId state and setter/getter to `adws/core/utils.ts`

- Add a module-level variable `let _logAdwId: string | undefined;` to hold the current adwId for logging.
- Add a `setLogAdwId(adwId: string): void` function that sets `_logAdwId`.
- Add a `getLogAdwId(): string | undefined` function that returns the current `_logAdwId`.
- Update the `log()` function to include `_logAdwId` in the output when it is set:
  - When `_logAdwId` is set: `${prefix} [${timestamp}] [${_logAdwId}] ${message}`
  - When `_logAdwId` is not set: `${prefix} [${timestamp}] ${message}` (current behavior, unchanged)
- Update the JSDoc comment on `log()` to document the new adwId behavior.

### Step 2: Export new functions from `adws/core/index.ts`

- Add `setLogAdwId` and `getLogAdwId` to the existing `utils` export block in `adws/core/index.ts`.

### Step 3: Call `setLogAdwId` in workflow entry points

Each orchestrator or standalone script that generates or receives an `adwId` should call `setLogAdwId(adwId)` immediately after the `adwId` is available so all subsequent log lines include it.

- **`adws/phases/workflowLifecycle.ts`** — This is the main entry point used by most orchestrators (`adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlanBuildTestReview.tsx`, `adwPlanBuildReview.tsx`, `adwPlanBuildDocument.tsx`, `adwSdlc.tsx`, `adwPlan.tsx`). Find where `adwId` is generated or received (via `generateAdwId()` or from CLI args) and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from `'../core'`.
- **`adws/adwBuild.tsx`** — Find where `adwId` is assigned (from CLI args) and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from `'./core'`.
- **`adws/adwDocument.tsx`** — Find where `adwId` is assigned and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from `'./core'`.
- **`adws/adwTest.tsx`** — Find where `adwId` is assigned and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from `'./core'`.
- **`adws/adwPatch.tsx`** — Find where `adwId` is assigned and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from `'./core'`.
- **`adws/adwPrReview.tsx`** — Find where `adwId` is assigned and call `setLogAdwId(adwId)` immediately after. Import `setLogAdwId` from the core module.
- **`adws/phases/prReviewPhase.ts`** — If this phase generates or receives an `adwId`, call `setLogAdwId(adwId)` as well.

### Step 4: Write unit tests in `adws/__tests__/log.test.ts`

- Create a new test file `adws/__tests__/log.test.ts`.
- Import `log`, `setLogAdwId`, `getLogAdwId`, and `LogLevel` from `'../core'`.
- Mock `console.log` using `vi.spyOn`.
- Test cases:
  1. **Default behavior (no adwId set):** Call `log('test message')` and assert output matches `{emoji} [{timestamp}] test message` (no adwId bracket).
  2. **With adwId set:** Call `setLogAdwId('abc123')`, then `log('test message')`, and assert output matches `{emoji} [{timestamp}] [abc123] test message`.
  3. **Error level with adwId:** Call `setLogAdwId('abc123')`, then `log('error msg', 'error')`, and assert output includes ANSI red color codes and `[abc123]`.
  4. **Success level with adwId:** Call `setLogAdwId('abc123')`, then `log('done', 'success')`, and assert output includes `[abc123]` and the success emoji.
  5. **getLogAdwId returns current value:** Call `setLogAdwId('xyz')` and assert `getLogAdwId()` returns `'xyz'`.
  6. **getLogAdwId returns undefined when not set:** Assert `getLogAdwId()` returns `undefined` before any `setLogAdwId` call.
- Use `beforeEach` to reset `_logAdwId` state between tests by calling `setLogAdwId` with a known value or by re-importing. Since the module state is shared, add a `resetLogAdwId(): void` function to `utils.ts` (exported but intended for testing) that sets `_logAdwId = undefined`, and export it from `index.ts`. Use `resetLogAdwId()` in `beforeEach`.

### Step 5: Run validation commands

- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the chore is complete with zero regressions.
- Fix any issues that arise from the validation commands.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The module-level state pattern (`setLogAdwId`/`getLogAdwId`) avoids changing the `log()` function signature, which would require updating 29+ files that call `log()`. This is the least disruptive approach.
- Scripts that do not use `adwId` (e.g., `healthCheck.tsx`, `adwClearComments.tsx`, triggers) will continue to log without the `adwId` bracket since they never call `setLogAdwId`.
- The `resetLogAdwId()` function is only needed for test isolation; it should not be called in production code.
