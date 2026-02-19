# Chore: Pass classification to orchestrator to avoid duplicate classification

## Metadata
issueNumber: `183`
adwId: `adw-unknown`
issueJson: `{}`

## Chore Description
Each issue currently gets classified multiple times. The triggers (`trigger_cron.ts` and `trigger_webhook.ts`) call `classifyIssueForTrigger()` which runs the two-step classification pipeline (`/classify_adw` then `/classify_issue` fallback). The result determines which orchestrator script to spawn. However, when the orchestrator starts, `initializeWorkflow()` in `workflowLifecycle.ts` runs `classifyGitHubIssue()` — the exact same two-step classification pipeline — again. This wastes time and API calls.

The fix: pass the already-known classification from the triggers to the orchestrators via the existing `--issue-type` CLI option. The infrastructure already exists (`initializeWorkflow()` accepts `options.issueType` and skips classification when present), but only `adwPlan.tsx` currently parses `--issue-type` from its CLI args. The other 5 multi-phase orchestrators need this parsing added, and both triggers need to include `--issue-type` in the spawn arguments.

## Relevant Files
Use these files to resolve the chore:

- `adws/triggers/trigger_cron.ts` — Spawns orchestrator scripts after classification. Must pass `--issue-type` to the spawned process.
- `adws/triggers/trigger_webhook.ts` — Spawns orchestrator scripts after classification. Must pass `--issue-type` to the spawned process.
- `adws/adwPlanBuild.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwPlanBuildTest.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwPlanBuildReview.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwPlanBuildDocument.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwPlanBuildTestReview.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwSdlc.tsx` — Multi-phase orchestrator. Needs `--issue-type` argument parsing and forwarding to `initializeWorkflow()`.
- `adws/adwPlan.tsx` — Reference implementation. Already has `--issue-type` parsing (use as template for other orchestrators).
- `adws/phases/workflowLifecycle.ts` — Contains `initializeWorkflow()` which already supports `options.issueType` to skip classification. No changes needed here.
- `adws/core/issueClassifier.ts` — Contains classification functions. No changes needed here.
- `adws/core/issueTypes.ts` — Contains `IssueClassSlashCommand` type definition. No changes needed here.
- `adws/__tests__/issueClassifier.test.ts` — Existing tests. No changes needed here, but new tests are needed for trigger/orchestrator changes.
- `guidelines/coding_guidelines.md` — Coding guidelines that must be followed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `--issue-type` parsing to `adwPlanBuild.tsx`
- Use `adwPlan.tsx` as the reference implementation for argument parsing
- Update `parseArguments()` to:
  - Accept `--issue-type <type>` option (valid values: `/feature`, `/bug`, `/chore`, `/pr_review`)
  - Return `providedIssueType: IssueClassSlashCommand | null` in the result
  - Splice the `--issue-type` args out before parsing positional args
- Update `printUsageAndExit()` to document the new `--issue-type` option
- Update `main()` to pass `issueType: providedIssueType || undefined` in the options to `initializeWorkflow()`
- Import `IssueClassSlashCommand` from `./core`
- Update the JSDoc usage line at the top of the file to include `[--issue-type <type>]`

### Step 2: Add `--issue-type` parsing to `adwPlanBuildTest.tsx`
- Same changes as Step 1, adapted for `adwPlanBuildTest.tsx`

### Step 3: Add `--issue-type` parsing to `adwPlanBuildReview.tsx`
- Same changes as Step 1, adapted for `adwPlanBuildReview.tsx`

### Step 4: Add `--issue-type` parsing to `adwPlanBuildDocument.tsx`
- Same changes as Step 1, adapted for `adwPlanBuildDocument.tsx`

### Step 5: Add `--issue-type` parsing to `adwPlanBuildTestReview.tsx`
- Same changes as Step 1, adapted for `adwPlanBuildTestReview.tsx`

### Step 6: Add `--issue-type` parsing to `adwSdlc.tsx`
- Same changes as Step 1, adapted for `adwSdlc.tsx`

### Step 7: Update `trigger_cron.ts` to pass `--issue-type` when spawning workflows
- In the `checkAndTrigger()` function, after `classifyIssueForTrigger()` returns the classification result, include `--issue-type` and the classification's `issueType` in the spawn arguments
- Change the spawn call from:
  ```ts
  spawn('npx', ['tsx', workflowScript, String(issue.number)], ...)
  ```
  to:
  ```ts
  spawn('npx', ['tsx', workflowScript, String(issue.number), '--issue-type', classification.issueType], ...)
  ```

### Step 8: Update `trigger_webhook.ts` to pass `--issue-type` when spawning workflows
- There are three places in `trigger_webhook.ts` where orchestrator scripts are spawned after classification:
  1. **`issue_comment` handler** (around line 186-192): After `classifyIssueForTrigger()` resolves, pass `--issue-type` in the spawn args
  2. **`issues` `opened` handler** (around line 254-261): After `classifyIssueForTrigger()` resolves, pass `--issue-type` in the spawn args
  3. **Error fallback** in the `issue_comment` handler (around line 197): This spawns `adwPlanBuildTest.tsx` without classification. Since there's no classification result available in the catch block, leave this as-is (it will classify inside the orchestrator as a fallback)
- For the two classified paths, change spawn args from:
  ```ts
  spawnDetached('npx', ['tsx', workflowScript, String(issueNumber)]);
  ```
  to:
  ```ts
  spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), '--issue-type', classification.issueType]);
  ```

### Step 9: Run Validation Commands
- Run all validation commands listed below to confirm zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `initializeWorkflow()` function in `workflowLifecycle.ts` already supports `options.issueType` and will skip classification when it's provided. No changes are needed there.
- `adwPatch.tsx`, `adwBuild.tsx`, `adwTest.tsx`, `adwDocument.tsx`, and `adwPrReview.tsx` are standalone scripts that don't go through the trigger→orchestrator flow, or have their own classification logic (e.g., `adwPatch.tsx` infers type from the branch name, `adwBuild.tsx` infers from branch). They don't need changes for this chore.
- The `--issue-type` flag is optional in all orchestrators. When omitted (e.g., manual invocation), classification still runs as before. This ensures backward compatibility.
- The error fallback in `trigger_webhook.ts`'s issue_comment handler spawns without classification results, which is acceptable as a safety net. The orchestrator will classify the issue in that case.
