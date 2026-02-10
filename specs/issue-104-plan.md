# Bug: Workflow fails with ENOENT when reading plan file from wrong directory

## Bug Description
The `plan-build-test-orchestrator` workflow fails with `ENOENT: no such file or directory` when attempting to read the plan file during the Build phase. The plan file is successfully created by the Plan Agent inside the **worktree** directory (e.g., `/path/to/.worktrees/chore-issue-100-…/specs/issue-100-plan.md`), but the Build phase attempts to read it using a **relative** path (`specs/issue-100-plan.md`) that resolves against `process.cwd()` (the main repository), not the worktree where the file was actually created.

**Expected behavior:** The Build phase reads the plan file from the worktree directory where it was created by the Plan Agent.

**Actual behavior:** The Build phase reads the plan file using a relative path that resolves to the main repo directory, causing an ENOENT error because the file only exists in the worktree.

## Problem Statement
`getPlanFilePath()` returns a relative path (`specs/issue-{N}-plan.md`). The Plan Agent runs with `cwd = worktreePath` and creates the plan file inside the worktree. However, `executeBuildPhase()` calls `fs.readFileSync(planPath, 'utf-8')` with this relative path, which resolves against `process.cwd()` (the main repo root), not the worktree. The same issue affects `planFileExists()` in `executePlanPhase()` and the `fs.readFileSync()` call in `executePRReviewPlanPhase()`.

## Solution Statement
Resolve the plan file path against the `worktreePath` at each call site where the plan file is read from or checked on disk. Specifically:
1. In `executeBuildPhase()`: use `path.join(worktreePath, getPlanFilePath(issueNumber))` when reading the plan file.
2. In `executePlanPhase()`: pass `worktreePath` to `planFileExists()` so it checks inside the worktree.
3. In `executePRReviewPlanPhase()`: use `path.join(worktreePath, getPlanFilePath(issueNumber))` when reading the plan file.
4. Update `planFileExists()` to accept an optional `worktreePath` parameter.

## Steps to Reproduce
1. Run the `plan-build-test-orchestrator` workflow: `npx tsx adws/adwPlanBuildTest.tsx <issue-number>`
2. The workflow creates a worktree (e.g., `.worktrees/chore-issue-100-…/`)
3. The Plan Agent runs inside the worktree and creates `specs/issue-100-plan.md` there
4. The Build phase tries to read `specs/issue-100-plan.md` relative to `process.cwd()` (main repo)
5. **Error:** `ENOENT: no such file or directory, open 'specs/issue-100-plan.md'`

## Root Cause Analysis
The root cause is that `getPlanFilePath()` in `adws/agents/planAgent.ts` returns a **relative** path:
```typescript
export function getPlanFilePath(issueNumber: number): string {
  return `specs/issue-${issueNumber}-plan.md`;
}
```

This relative path is used correctly when passed to the Plan Agent as context (since the agent runs with `cwd = worktreePath`), but it is **incorrectly** used as a `fs.readFileSync()` path in `workflowPhases.ts`, where it resolves relative to `process.cwd()` instead of the worktree.

There are **three** affected call sites in `workflowPhases.ts`:
1. **`executeBuildPhase()`** (line ~312-315): `fs.readFileSync(planPath, 'utf-8')` — the exact line from the error log
2. **`executePlanPhase()`** (line ~247): `planFileExists(issueNumber)` — checks the wrong directory for existing plan
3. **`executePRReviewPlanPhase()`** (line ~654-656): `fs.readFileSync(planPath, 'utf-8')` — same issue for PR review workflows

## Relevant Files
Use these files to fix the bug:

- `adws/agents/planAgent.ts` — Contains `getPlanFilePath()` and `planFileExists()`. The `planFileExists()` function needs a `worktreePath` parameter so it resolves the path correctly.
- `adws/workflowPhases.ts` — Contains the three affected call sites (`executeBuildPhase`, `executePlanPhase`, `executePRReviewPlanPhase`) where plan file paths need to be resolved against the worktree.
- `adws/agents/index.ts` — Re-exports from planAgent. No changes needed since the function signature change is backward-compatible.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests for workflow phases. Tests must be updated to verify plan path resolution against worktree paths.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `planFileExists()` in `adws/agents/planAgent.ts`
- Add an optional `worktreePath` parameter to `planFileExists()`.
- When `worktreePath` is provided, resolve the plan path as `path.join(worktreePath, planPath)`.
- When `worktreePath` is not provided, use the relative path as before (backward compatible).
- Ensure `path` is imported at the top of the file (it is already imported).

The function should become:
```typescript
export function planFileExists(issueNumber: number, worktreePath?: string): boolean {
  const planPath = getPlanFilePath(issueNumber);
  const fullPath = worktreePath ? path.join(worktreePath, planPath) : planPath;
  try {
    const stats = fs.statSync(fullPath);
    return stats.isFile() && stats.size > 0;
  } catch {
    return false;
  }
}
```

### Step 2: Update `executeBuildPhase()` in `adws/workflowPhases.ts`
- On line ~312, change the plan path resolution to use `worktreePath`:
  - From: `const planPath = getPlanFilePath(issueNumber);`
  - To: `const planPath = path.join(worktreePath, getPlanFilePath(issueNumber));`
- The `path` module is already imported in this file (line 1 area — actually it's not imported, `fs` is. Need to add `import * as path from 'path';`).
- The `fs.readFileSync(planPath, 'utf-8')` call on line ~315 will now use the correct absolute path.

### Step 3: Update `executePlanPhase()` in `adws/workflowPhases.ts`
- On line ~247, pass `worktreePath` to `planFileExists()`:
  - From: `!planFileExists(issueNumber)`
  - To: `!planFileExists(issueNumber, worktreePath)`
- This ensures the plan existence check looks in the worktree, not in `process.cwd()`.

### Step 4: Update `executePRReviewPlanPhase()` in `adws/workflowPhases.ts`
- On line ~654, change the plan path resolution to use `worktreePath`:
  - From: `const planPath = getPlanFilePath(issueNumber);`
  - To: `const planPath = path.join(worktreePath, getPlanFilePath(issueNumber));`
- The `fs.readFileSync(planPath, 'utf-8')` call on line ~656 will now use the correct absolute path.

### Step 5: Update tests in `adws/__tests__/workflowPhases.test.ts`
- Update the `executeBuildPhase` test `'reads plan content and runs build agent'` to verify that `fs.readFileSync` is called with the worktree-resolved path (e.g., `path.join('/mock/worktree', '/mock/plan.md')` or however the mock resolves).
- Update the `'throws when plan file is missing'` test similarly.
- Update the `executePRReviewPlanPhase` test `'reads existing plan content from file when available'` to verify the worktree-resolved path.
- Update the `'falls back to PR body when no plan file exists'` test similarly.
- Add a new test for `executePlanPhase` that verifies `planFileExists` is called with the worktree path.
- Verify that the mock for `getPlanFilePath` returns a relative path (e.g., `'specs/issue-1-plan.md'`) to properly test path resolution.

### Step 6: Run Validation Commands
- Run all validation commands to ensure the fix is correct and no regressions are introduced.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `getPlanFilePath()` function signature is NOT changed — it still returns a relative path. The resolution against `worktreePath` happens at the call sites in `workflowPhases.ts`. This keeps `getPlanFilePath()` simple and makes the worktree-awareness explicit at each usage point.
- The `planFileExists()` function gets an optional `worktreePath` parameter for backward compatibility. Callers that don't pass it get the old behavior (resolving against `process.cwd()`).
- The `ctx.planPath` assignment in `executePlanPhase()` (line ~244) should continue to use the relative path returned by `getPlanFilePath()` since it's used for display/context in workflow comments, not for filesystem access.
- The mock for `getPlanFilePath` in the existing test file returns `'/mock/plan.md'` (an absolute path). For the tests to properly validate the fix, the mock should return a **relative** path like `'specs/issue-1-plan.md'` so that `path.join('/mock/worktree', 'specs/issue-1-plan.md')` produces the expected absolute path. Update the mock accordingly.
