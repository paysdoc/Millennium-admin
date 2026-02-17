# Bug: ADW flow ends when plan file cannot be found

## Metadata
issueNumber: `156`
adwId: `adw-adw-flow-ends-when-p-lguusb`
issueJson: `{"title":"ADW flow ends when plan file cannot be found","body":"Sometimes the adw fails because the plan file cannot be found. Find out why and fix the problem.\n\nUse github issue 154 and the comments to solve the bug.\n\nHint, the plan naming has changed but the implementation has not been updated accordingly. Make sure that all adws use the new naming.","number":156,"state":"OPEN","author":"paysdoc"}`

## Bug Description
ADW (AI Developer Workflow) orchestrators fail with `ENOENT: no such file or directory` errors when trying to read plan files. The plan agent creates files using the **new** naming convention (`issue-{N}-adw-{adwId}-sdlc_planner-{descriptiveName}.md`) as instructed by the slash commands (`/bug`, `/feature`, `/chore`), but the code that looks up plan files was hardcoded to expect the **legacy** naming convention (`issue-{N}-plan.md`). This mismatch causes the build phase and other downstream phases to fail.

**Actual behavior:** The workflow errors out with `Cannot read plan file at .../specs/issue-{N}-plan.md: Error: ENOENT: no such file or directory`.

**Expected behavior:** The workflow should find and read the plan file regardless of whether it uses the new or legacy naming convention.

## Problem Statement
The plan file naming convention changed from `issue-{N}-plan.md` to `issue-{N}-adw-{adwId}-sdlc_planner-{descriptiveName}.md` (as defined in `.claude/commands/bug.md`, `.claude/commands/feature.md`, `.claude/commands/chore.md`), but the `getPlanFilePath()` function and some call sites were not updated to search for files matching the new pattern. A partial fix was applied in commit `3023a18` that updates `getPlanFilePath()` to search `specs/` for matching files, but two remaining issues exist:

1. **`planPhase.ts:55`** — calls `getPlanFilePath()` BEFORE the plan agent creates the file, resulting in the legacy fallback path being stored in state and context. After the plan agent runs, the path should be re-resolved.
2. **`adwBuild.tsx:97`** — reads the plan file using the relative path from `getPlanFilePath()` without joining it with the `cwd` parameter, so when running from a different working directory (worktree), the read fails.

## Solution Statement
1. In `planPhase.ts`, re-resolve the plan file path AFTER the plan agent has finished creating it, so the correct (new-convention) path is stored in state and context.
2. In `adwBuild.tsx`, join the `cwd` with the plan path when reading the file content, consistent with how `buildPhase.ts:39` does it.
3. Add unit tests for `findPlanFile()`, `getPlanFilePath()`, and `planFileExists()` to prevent regressions.

## Steps to Reproduce
1. Create a GitHub issue (e.g., issue #154 — "Move issue classifier").
2. Trigger an ADW workflow (e.g., `adwPlanBuildTestReview`).
3. The plan agent runs and creates a file like `specs/issue-154-adw-dh8ryj-sdlc_planner-move-issue-classifier.md`.
4. The build phase calls `getPlanFilePath(154)` which (before the fix) returned `specs/issue-154-plan.md`.
5. The build phase tries to read `specs/issue-154-plan.md` — file not found, workflow crashes.

Evidence from issue #154 comments:
- Plan was created as: `specs/issue-154-adw--sdlc_planner-move-issue-classifier.md`
- Error: `Cannot read plan file at .../specs/issue-154-plan.md: Error: ENOENT: no such file or directory`

## Root Cause Analysis
The slash commands (`.claude/commands/bug.md`, `.claude/commands/feature.md`, `.claude/commands/chore.md`) instruct the plan agent to create plan files with the naming pattern:
```
specs/issue-{issueNumber}-adw-{adwId}-sdlc_planner-{descriptiveName}.md
```

However, the `getPlanFilePath()` function in `adws/agents/planAgent.ts` was hardcoded to return:
```
specs/issue-{issueNumber}-plan.md
```

This was partially fixed in commit `3023a18` by adding a `findPlanFile()` function that searches the `specs/` directory. Two remaining issues:

1. **Timing issue in `planPhase.ts`**: `getPlanFilePath()` is called on line 55 (before the plan agent runs on line 75). At that point, no file exists yet, so `findPlanFile()` returns `null` and the function falls back to the legacy name. The stale path is stored in `ctx.planPath` and state. While downstream phases re-resolve the path, the stored path is misleading and could cause issues if any code relies on it.

2. **Missing path join in `adwBuild.tsx`**: On line 97, `fs.readFileSync(planPath, 'utf-8')` uses the relative path directly. When `cwd` is set (worktree scenario), the process working directory differs from the worktree directory, so the relative path won't find the file. Compare with `buildPhase.ts:39` which correctly does `path.join(worktreePath, getPlanFilePath(...))`.

## Relevant Files
Use these files to fix the bug:

- `adws/agents/planAgent.ts` — Contains `findPlanFile()`, `getPlanFilePath()`, and `planFileExists()` functions. The core logic for plan file lookup. Already partially fixed in commit `3023a18`.
- `adws/phases/planPhase.ts` — Contains `executePlanPhase()`. Calls `getPlanFilePath()` before the plan agent runs (line 55), stores the stale legacy path in context and state. Needs to re-resolve after plan creation.
- `adws/adwBuild.tsx` — Standalone build workflow. Reads plan file on line 97 without joining `cwd` to the path. Needs path join fix.
- `adws/phases/buildPhase.ts` — Contains `executeBuildPhase()`. Already correctly joins `worktreePath` with `getPlanFilePath()` on line 39. Reference implementation.
- `adws/phases/prReviewPhase.ts` — Contains `executePRReviewPlanPhase()`. Already correctly joins `worktreePath` with `getPlanFilePath()` on line 100. Reference implementation.
- `adws/phases/workflowLifecycle.ts` — Contains `executeReviewPhase()`. Uses `getPlanFilePath()` on line 213 but passes the result as `specFile` to `runReviewWithRetry()` without joining worktree path. Needs verification.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests for workflow phases. Mocks `getPlanFilePath` to return legacy name. Should be updated.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.

### New Files
- `adws/__tests__/planAgent.test.ts` — New unit tests for `findPlanFile()`, `getPlanFilePath()`, and `planFileExists()`.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Read relevant files and understand current state
- Read `adws/agents/planAgent.ts` to understand the current `findPlanFile()`, `getPlanFilePath()`, and `planFileExists()` implementations.
- Read `adws/phases/planPhase.ts` to understand how plan path is resolved and stored.
- Read `adws/adwBuild.tsx` to understand the standalone build workflow path handling.
- Read `adws/phases/buildPhase.ts` as reference for correct path joining.
- Read `adws/phases/workflowLifecycle.ts` to verify `executeReviewPhase()` path handling.
- Read `guidelines/coding_guidelines.md` for coding standards.

### Step 2: Fix plan path re-resolution in `planPhase.ts`
- In `adws/phases/planPhase.ts`, after the plan agent completes successfully (after line 86, inside the `if` block), re-resolve the plan file path by calling `getPlanFilePath(issueNumber, worktreePath)` again.
- Update `ctx.planPath` with the re-resolved path.
- Update the state writes on lines 89 and 97 to use the re-resolved path instead of the stale `planPath` variable.
- This ensures the correct (new-convention) path is stored in context and state after the plan agent creates the file.

### Step 3: Fix plan file reading in `adwBuild.tsx`
- In `adws/adwBuild.tsx`, on line 97 where `fs.readFileSync(planPath, 'utf-8')` is called, join the `cwd` with `planPath` when `cwd` is provided.
- Use the same pattern as `buildPhase.ts:39`: `const fullPlanPath = cwd ? path.join(cwd, planPath) : planPath;`
- Update the `readFileSync` call to use `fullPlanPath`.
- Update the error message on line 100 to reference `fullPlanPath`.
- Also update the log message on line 98 to reference `fullPlanPath`.

### Step 4: Verify `workflowLifecycle.ts` review phase path handling
- In `adws/phases/workflowLifecycle.ts`, line 213: `const specFile = getPlanFilePath(issueNumber, worktreePath);`
- Verify that `runReviewWithRetry()` receives the relative spec file path and handles the worktree path correctly internally. If it needs the full path, join with `worktreePath` similarly.
- Read `adws/agents/reviewAgent.ts` to check how `specFile` is used. If it's passed as an argument to the claude agent (which runs in `cwd: worktreePath`), then the relative path is correct. Otherwise, join with `worktreePath`.

### Step 5: Create unit tests for plan file lookup functions
- Create `adws/__tests__/planAgent.test.ts` with tests for:
  - `getPlanFilePath()` — returns new-convention file when it exists, falls back to legacy when only legacy exists, returns legacy fallback when no file exists.
  - `planFileExists()` — returns `true` when new-convention file exists, returns `true` when legacy file exists, returns `false` when no file exists.
  - Test with and without `worktreePath` parameter.
- Mock `fs.readdirSync` and `fs.statSync` to simulate different file scenarios.

### Step 6: Update existing tests to use new naming convention
- In `adws/__tests__/workflowPhases.test.ts`, update the mock return value on line 112 from `'specs/issue-1-plan.md'` to a new-convention name (e.g., `'specs/issue-1-adw-test123-sdlc_planner-test.md'`) to ensure tests reflect the actual naming.
- In `adws/__tests__/tokenLimitRecovery.test.ts`, update the mock return value on line 56 similarly.
- Verify all assertions that reference the old plan file name pattern are updated.

### Step 7: Run validation commands
- Run all validation commands listed below to ensure the bug is fixed with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The partial fix in commit `3023a18` (adding `findPlanFile()` with directory scanning and legacy fallback) is correct and should be preserved. The remaining work is fixing the two edge cases (timing in `planPhase.ts` and path joining in `adwBuild.tsx`) and adding proper test coverage.
- The `patch.md` command uses a different naming convention (`specs/patch/patch-adw-{adwId}-{descriptive-name}.md`) which is handled separately and is not affected by this bug.
- No new libraries are needed.
