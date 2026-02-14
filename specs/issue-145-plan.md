# Bug: Process issue comments when no agent process is running

## Bug Description
When an actionable issue comment (containing `## Take action`) is received while an ADW workflow appears to be "running" (based on GitHub issue comments), the comment is deferred. However, if the agent process was killed unexpectedly (crash, OOM, manual termination), no terminal stage comment (`completed` or `error`) is posted to the issue. This causes `isAdwRunningForIssue()` to return `true` indefinitely, meaning deferred comments are never processed and the issue is stuck.

**Expected behavior:** When an actionable comment is received and the last workflow stage is non-terminal, the system should verify that the agent process is actually still running at the OS level. If no agent process is found, the state should be treated as "abended" and the comment should trigger a new workflow immediately.

**Actual behavior:** `isAdwRunningForIssue()` only checks GitHub comment stages and returns `true` if the latest stage is non-terminal — regardless of whether any OS process is alive. Killed processes leave the issue permanently stuck.

## Problem Statement
The `isAdwRunningForIssue()` function in `workflowCommentsBase.ts` relies solely on GitHub issue comments to determine if a workflow is active. It has no mechanism to detect that the underlying OS process has terminated unexpectedly. Both the webhook trigger (`trigger_webhook.ts`) and cron trigger (`trigger_cron.ts`) use this function to decide whether to defer or process actionable comments, creating a permanent deadlock when processes die without posting terminal comments.

## Solution Statement
Enhance `isAdwRunningForIssue()` to perform an OS-level process check when the latest workflow stage is non-terminal. The system will:

1. Extract the ADW ID from the latest non-terminal workflow stage comment.
2. Look up the orchestrator's `state.json` from the agent state directory (`agents/{adwId}/`) to find the process PID.
3. Check if that PID is still alive using `process.kill(pid, 0)` (signal 0 checks existence without killing).
4. If no process is running, return `false` (workflow is NOT running), allowing the comment to be processed.

To support this, orchestrators will record their PID in state when they start. This requires:
- Adding a `pid` field to the orchestrator state written during `initializeWorkflow()` in `workflowPhases.ts`.
- Adding a helper function `isProcessAlive(pid)` and a function `isAgentProcessRunning(adwId)` in the state module.
- Updating `isAdwRunningForIssue()` to call `isAgentProcessRunning()` when the comment-based check says "running".

## Steps to Reproduce
1. Create a GitHub issue.
2. Let the ADW workflow start (posts `:rocket: ADW Workflow Started` comment).
3. Kill the agent process externally (e.g., `kill <pid>` or process crash).
4. The last comment on the issue is a non-terminal stage (e.g., `starting`, `implementing`).
5. Post an actionable comment (`## Take action`) on the issue.
6. Observe that the webhook/cron trigger defers the comment because `isAdwRunningForIssue()` returns `true`.
7. The comment is never processed — the issue is permanently stuck.

## Root Cause Analysis
The `isAdwRunningForIssue()` function in `workflowCommentsBase.ts` (line 108-122) determines workflow state exclusively from GitHub issue comment stages. It parses all comments for workflow stage markers, sorts by creation time, and checks if the most recent stage is terminal (`completed` or `error`). If not, it returns `true`.

When an agent process terminates abnormally (crash, OOM, `kill`), the orchestrator's error handling code (`handleWorkflowError` in `workflowPhases.ts`) never executes, so no `error` stage comment is posted. The last comment remains a non-terminal stage, and `isAdwRunningForIssue()` reports the workflow as still running — a false positive.

Both triggers rely on this function:
- **Webhook trigger** (`trigger_webhook.ts`, line 203): calls `isAdwRunningForIssue()` and defers if `true`.
- **Cron trigger** (`trigger_cron.ts`, line 65): calls `isAdwRunningForIssue()` and skips with `continue` if `true`.

Neither trigger has a fallback mechanism to detect dead processes.

## Relevant Files
Use these files to fix the bug:

- `adws/core/agentState.ts` — Agent state manager; needs a new `isAgentProcessRunning()` function that checks if the PID stored in state is alive, and `findOrchestratorStatePath()` to locate the orchestrator state for a given ADW ID.
- `adws/core/dataTypes.ts` — Data types; the `AgentState` interface needs a `pid` field.
- `adws/core/index.ts` — Core module exports; needs to export the new functions.
- `adws/github/workflowCommentsBase.ts` — Contains `isAdwRunningForIssue()`; needs to call `isAgentProcessRunning()` when comment-based state is non-terminal.
- `adws/workflowPhases.ts` — `initializeWorkflow()` and `initializePRReviewWorkflow()` write initial orchestrator state; need to record `process.pid`.
- `adws/__tests__/commentFiltering.test.ts` — Existing tests for `isAdwRunningForIssue()`; needs new test cases for the process-alive check.
- `adws/__tests__/agentState.test.ts` — Existing tests for `AgentStateManager`; needs tests for the new process-checking functions.

### New Files
- `adws/__tests__/processAlive.test.ts` — Focused tests for `isProcessAlive()`, `findOrchestratorStatePath()`, and `isAgentProcessRunning()`.

## Step by Step Tasks

### Step 1: Add `pid` field to `AgentState` interface
- In `adws/core/dataTypes.ts`, add an optional `pid?: number` field to the `AgentState` interface.
- This field will store the OS process ID of the orchestrator process.

### Step 2: Add process-checking functions to `AgentStateManager`
- In `adws/core/agentState.ts`, add a static method `isProcessAlive(pid: number): boolean` that uses `process.kill(pid, 0)` wrapped in a try-catch to check if a process with the given PID exists.
- Add a static method `findOrchestratorStatePath(adwId: string): string | null` that scans the `agents/{adwId}/` directory for a subdirectory whose `state.json` contains an orchestrator agent name (one ending in `-orchestrator`) and returns its state path, or `null` if not found.
- Add a static method `isAgentProcessRunning(adwId: string): boolean` that:
  1. Calls `findOrchestratorStatePath(adwId)` to locate the orchestrator state.
  2. Reads the state and extracts the `pid` field.
  3. If no state or no PID is found, returns `false` (cannot confirm process is running).
  4. Calls `isProcessAlive(pid)` and returns the result.
- Export the new functions from `adws/core/agentState.ts` (as both class methods and convenience functions).

### Step 3: Export new functions from core module
- In `adws/core/index.ts`, add exports for `isProcessAlive`, `findOrchestratorStatePath`, and `isAgentProcessRunning` from `./agentState`.

### Step 4: Update `isAdwRunningForIssue()` to check OS process
- In `adws/github/workflowCommentsBase.ts`:
  - Import `AgentStateManager` from `../core`.
  - Import `extractAdwIdFromComment` (already available in the same file).
  - When the comment-based check determines the workflow is "running" (latest stage is non-terminal), extract the ADW ID from the most recent non-terminal stage comment.
  - Call `AgentStateManager.isAgentProcessRunning(adwId)` to verify the process is alive.
  - If the process is NOT alive, return `false` (workflow is NOT running — the process died).
  - If the process IS alive, return `true` (workflow is genuinely running).
  - If no ADW ID can be extracted, fall back to the original behavior (return `true`).

### Step 5: Record PID in orchestrator state during initialization
- In `adws/workflowPhases.ts`, in the `initializeWorkflow()` function, add `pid: process.pid` to the `initialState` object written via `AgentStateManager.writeState()` (around line 175-181).
- Similarly, in `initializePRReviewWorkflow()`, add `pid: process.pid` to the `initialState` object (around line 707-715).

### Step 6: Add unit tests for process-checking functions
- Create `adws/__tests__/processAlive.test.ts` with tests for:
  - `isProcessAlive()`: returns `true` for `process.pid` (current process), returns `false` for a known-dead PID (e.g., a very large number like `999999999`).
  - `findOrchestratorStatePath()`: returns the correct path when orchestrator state exists, returns `null` when ADW ID directory does not exist, returns `null` when no orchestrator state is found.
  - `isAgentProcessRunning()`: returns `true` when state has a PID matching a running process, returns `false` when state has a PID for a dead process, returns `false` when no state exists.

### Step 7: Update existing `isAdwRunningForIssue` tests
- In `adws/__tests__/commentFiltering.test.ts`, add tests:
  - Mock `AgentStateManager.isAgentProcessRunning` to return `false` when called.
  - Test that `isAdwRunningForIssue()` returns `false` when the latest stage is non-terminal BUT the agent process is dead (mock returns `false`).
  - Test that `isAdwRunningForIssue()` returns `true` when the latest stage is non-terminal AND the agent process is alive (mock returns `true`).
  - Test that `isAdwRunningForIssue()` returns `false` when no ADW ID can be extracted from comments (falls back to `true` since we can't verify — actually, update: if we cannot extract an ADW ID, we cannot check the process, so we should conservatively return `true` to avoid duplicate workflows. Add a test for this case).

### Step 8: Run validation commands
- Run `npm run lint`, `npm run build`, and `npm test` to verify zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions
- `npx vitest run adws/__tests__/processAlive.test.ts` - Run the new process-alive tests specifically
- `npx vitest run adws/__tests__/commentFiltering.test.ts` - Run the updated isAdwRunningForIssue tests
- `npx vitest run adws/__tests__/agentState.test.ts` - Run agent state tests for regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `process.kill(pid, 0)` approach is cross-platform (works on macOS, Linux) and does not actually send a signal — it only checks process existence. This is preferable to parsing `ps -ef` output.
- The `pid` field is optional in `AgentState` for backwards compatibility. Old state files without a PID will cause `isAgentProcessRunning()` to return `false`, which will allow stuck workflows to be recovered — this is the desired behavior since old workflows without PIDs are likely dead.
- No new libraries are required.
- The fix is minimal and surgical: it adds a single process-level verification step to the existing `isAdwRunningForIssue()` flow, with state recording in the two initialization functions.
