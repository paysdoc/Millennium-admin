# Bug: ADW orchestrators called without full classifier result

## Metadata
issueNumber: `194`
adwId: `adw-unknown`
issueJson: `{}`

## Bug Description
When the triggers (`trigger_webhook.ts` and `trigger_cron.ts`) classify an issue and spawn an ADW orchestrator, the classifier result is not fully forwarded. The `classifyIssueForTrigger()` / `classifyGitHubIssue()` functions return an `IssueClassificationResult` containing `issueType`, `adwCommand`, and `adwId`. Issue #183 added `--issue-type` forwarding, but the `adwId` from the classification result is never passed to the spawned orchestrator.

**Expected behavior:** After the trigger classifies an issue, the spawned orchestrator should receive the full classification result — including the `adwId` and `issueType` — so it skips redundant re-classification inside `initializeWorkflow()`.

**Actual behavior:** The orchestrators are spawned without the `adwId` from classification, and logs show the spawn command as `npx tsx adws/adwPlanBuildTest.tsx 192` missing the `--issue-type` flag. The orchestrator then calls `classifyGitHubIssue()` internally, wasting an extra API call per issue.

## Problem Statement
The `classifyIssueForTrigger()` result contains an optional `adwId` field (returned when `/classify_adw` detects an explicit ADW command with an ID). This `adwId` is never forwarded from the triggers to the spawned orchestrators. The orchestrators accept `adwId` as a positional CLI argument, but the triggers don't include it in the spawn args. This causes:
1. The orchestrator generates a new `adwId` instead of reusing the classifier's ID
2. Potential inconsistency between the ID the trigger logged and the ID the orchestrator uses

## Solution Statement
Pass the `classification.adwId` from the trigger's classification result to the spawned orchestrator as the second positional argument. This ensures the orchestrator reuses the classifier-provided `adwId` when available, eliminating unnecessary ID generation and maintaining consistency.

Specifically:
1. In `trigger_webhook.ts`: include `classification.adwId` (when available) as the second positional arg in all `spawnDetached()` calls that follow classification
2. In `trigger_cron.ts`: include `classification.adwId` (when available) as the second positional arg in the `spawn()` call
3. Add unit tests to verify the `adwId` is forwarded correctly

## Steps to Reproduce
1. Create a GitHub issue with an explicit ADW command (e.g., containing `/adw_plan_build_test` with an adwId)
2. The webhook trigger receives the issue event and classifies it
3. The trigger spawns the orchestrator with `spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), '--issue-type', classification.issueType])` — note: no `adwId` in the args
4. Inside the orchestrator, `initializeWorkflow()` receives `adwId: null` and generates a new one instead of using the classifier's ID
5. The log confirms: `Spawning: npx tsx adws/adwPlanBuildTest.tsx 192` — missing both `adwId` and potentially `--issue-type`

## Root Cause Analysis
In issue #183, the fix added `--issue-type` to the spawn arguments in both triggers. However, the `classification.adwId` field from the `IssueClassificationResult` was never forwarded. The triggers call `classifyIssueForTrigger()` which can return `{ issueType, success, adwCommand, adwId }`, but only `issueType` is extracted and passed via `--issue-type`. The `adwId` is silently dropped.

The spawn calls in `trigger_webhook.ts` (lines 192, 261) and `trigger_cron.ts` (line 81) all follow this pattern:
```ts
spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), '--issue-type', classification.issueType]);
```

The `adwId` should be included as the second positional argument (before `--issue-type`):
```ts
spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), ...(classification.adwId ? [classification.adwId] : []), '--issue-type', classification.issueType]);
```

## Relevant Files
Use these files to fix the bug:

- `adws/triggers/trigger_webhook.ts` — Contains `spawnDetached()` calls that spawn orchestrators after classification. The `adwId` from `classification.adwId` must be added as a positional arg. Two classified spawn paths need updating (lines 192 and 261).
- `adws/triggers/trigger_cron.ts` — Contains `spawn()` call that spawns orchestrators after classification. The `adwId` from `classification.adwId` must be added as a positional arg (line 81).
- `adws/core/issueClassifier.ts` — Contains `IssueClassificationResult` interface and `classifyIssueForTrigger()` / `getWorkflowScript()` functions. Reference only — no changes needed.
- `adws/core/issueTypes.ts` — Contains type definitions. Reference only — no changes needed.
- `adws/__tests__/issueClassifier.test.ts` — Existing classifier tests. Reference only — no changes needed.
- `adws/__tests__/webhookHandlers.test.ts` — Existing webhook handler tests. Reference for test patterns.
- `adws/adwPlanBuildTest.tsx` — Reference orchestrator showing how `adwId` is parsed as second positional arg (line 86: `const adwId = args[1] || null`). No changes needed.
- `adws/phases/workflowLifecycle.ts` — Contains `initializeWorkflow()` which accepts `adwId` as second param. No changes needed.
- `guidelines/coding_guidelines.md` — Coding guidelines that must be followed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `trigger_webhook.ts` to forward `classification.adwId`
- In the `issue_comment` handler's classified spawn path (around line 192), update the `spawnDetached` call to conditionally include `classification.adwId` as the second positional argument (between `issueNumber` and `--issue-type`):
  ```ts
  // Before:
  spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), '--issue-type', classification.issueType]);
  // After:
  const adwIdArgs = classification.adwId ? [classification.adwId] : [];
  spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), ...adwIdArgs, '--issue-type', classification.issueType]);
  ```
- Apply the same change to the `issues` `opened` handler's classified spawn path (around line 261)
- Do NOT modify the error fallback spawn calls (lines 197, 265) — those intentionally spawn without classification results

### Step 2: Update `trigger_cron.ts` to forward `classification.adwId`
- In the `checkAndTrigger()` function (around line 81), update the `spawn()` call to conditionally include `classification.adwId` as the second positional argument:
  ```ts
  // Before:
  const child = spawn('npx', ['tsx', workflowScript, String(issue.number), '--issue-type', classification.issueType], {
  // After:
  const adwIdArgs = classification.adwId ? [classification.adwId] : [];
  const child = spawn('npx', ['tsx', workflowScript, String(issue.number), ...adwIdArgs, '--issue-type', classification.issueType], {
  ```

### Step 3: Add unit tests for adwId forwarding
- Create tests that verify the spawn calls include `classification.adwId` when present and omit it when absent
- Test in a new describe block in the existing test file or a new dedicated test file (e.g., `adws/__tests__/triggerSpawnArgs.test.ts`)
- Test cases:
  1. When `classification.adwId` is defined, the spawn args include it as the second positional arg
  2. When `classification.adwId` is undefined, the spawn args do NOT include an extra positional arg
  3. `--issue-type` is always included after the positional args regardless of adwId presence
- Mock `classifyIssueForTrigger` to return classification results with and without `adwId`
- Mock `spawn` / `spawnDetached` to capture the arguments
- Verify the correct argument array structure for both the `issue_comment` handler, the `issues opened` handler in `trigger_webhook.ts`, and the cron trigger

### Step 4: Run Validation Commands
- Run all validation commands listed below to confirm zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `adwId` is the second positional argument in all multi-phase orchestrators (e.g., `adwPlanBuildTest.tsx` parses `args[1]` as `adwId`). The `--issue-type` flag is parsed by `indexOf` and then spliced out, so its position relative to positional args doesn't matter as long as it comes after the issue number.
- When `classification.adwId` is `undefined` (which happens when `/classify_adw` doesn't return an adwId or when the fallback `/classify_issue` is used), the spawn should NOT include an empty string — it should simply omit the adwId argument entirely so the orchestrator generates one via `generateAdwId(issue.title)`.
- The error fallback spawn calls in `trigger_webhook.ts` (catch blocks) should remain unchanged — they are safety nets that intentionally spawn without classification results.
- This fix is backward-compatible: orchestrators already handle `adwId` being null (second positional arg absent) by generating a new one.
