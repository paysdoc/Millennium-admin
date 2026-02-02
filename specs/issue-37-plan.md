# Bug: Plan File Naming Mismatch

## Bug Description
During ADW execution for issue #36, the build phase failed because it could not find the plan file. The error occurred because:
- **Expected**: `specs/issue-36-plan.md` (as defined by `getPlanFilePath()` in `adws/agents/planAgent.ts:40`)
- **Actual**: `issue-36.md` (file created by the Claude agent)

The plan agent created the file with an incorrect name (`issue-36.md` instead of `issue-36-plan.md`), causing the build phase to fail with the error:
```
Plan file not found: specs/issue-36-plan.md
Run adwPlan.tsx first to generate the plan.
Failed: Build Phase (exit code: 1)
```

## Problem Statement
The slash commands (`/feature`, `/bug`, `/chore`, `/pr_review`) that generate implementation plans instruct Claude to "Name it appropriately based on the [issue type]" but do not specify the exact naming convention required. This ambiguity allows Claude to choose an arbitrary filename that doesn't match what the build phase expects.

## Solution Statement
Update all planning slash commands to explicitly require the exact plan file naming convention: `specs/issue-{issueNumber}-plan.md` where `{issueNumber}` is the issue number from the GitHub Issue being processed.

## Steps to Reproduce
1. Create a new GitHub issue (e.g., issue #36)
2. Run the ADW plan phase: `npx tsx adws/adwPlan.tsx 36`
3. Observe that the plan agent creates a file with a non-standard name (e.g., `issue-36.md`)
4. Run the ADW build phase: `npx tsx adws/adwBuild.tsx 36`
5. Observe the build phase fails with "Plan file not found: specs/issue-36-plan.md"

## Root Cause Analysis
The root cause is in the slash command templates in `.claude/commands/`:

1. **`feature.md` (line 10)**: Says "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Feature`."
2. **`bug.md` (line 11)**: Says "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Bug`."
3. **`chore.md` (line 11)**: Says "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Chore`."
4. **`pr_review.md`**: Similar ambiguous instructions

Meanwhile, the `getPlanFilePath()` function in `adws/agents/planAgent.ts:40` defines the expected naming convention as:
```typescript
export function getPlanFilePath(issueNumber: number): string {
  return `specs/issue-${issueNumber}-plan.md`;
}
```

The build phase (`adwBuild.tsx:184-189`) uses this function to locate the plan file:
```typescript
const planPath = getPlanFilePath(issueNumber);
if (!planFileExists(issueNumber)) {
  log(`Plan file not found: ${planPath}`, 'error');
  ...
}
```

The mismatch occurs because the slash commands don't enforce the expected naming convention that the build phase relies on.

## Relevant Files
Use these files to fix the bug:

- `.claude/commands/feature.md` - Feature planning command that needs explicit naming convention
- `.claude/commands/bug.md` - Bug planning command that needs explicit naming convention
- `.claude/commands/chore.md` - Chore planning command that needs explicit naming convention
- `.claude/commands/pr_review.md` - PR review planning command that needs explicit naming convention
- `adws/agents/planAgent.ts` - Contains `getPlanFilePath()` function that defines the expected naming convention (reference only, no changes needed)
- `adws/adwBuild.tsx` - Contains the plan file lookup logic (reference only, no changes needed)

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `.claude/commands/feature.md`
- Locate line 10 that says: "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Feature`."
- Replace with: "Create the plan file at `specs/issue-{issueNumber}-plan.md` where `{issueNumber}` is the issue number from the GitHub Issue (e.g., `specs/issue-36-plan.md` for issue #36)."

### Step 2: Update `.claude/commands/bug.md`
- Locate line 11 that says: "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Bug`."
- Replace with: "Create the plan file at `specs/issue-{issueNumber}-plan.md` where `{issueNumber}` is the issue number from the GitHub Issue (e.g., `specs/issue-36-plan.md` for issue #36)."

### Step 3: Update `.claude/commands/chore.md`
- Locate line 11 that says: "Create the plan in the `specs/*.md` file. Name it appropriately based on the `Chore`."
- Replace with: "Create the plan file at `specs/issue-{issueNumber}-plan.md` where `{issueNumber}` is the issue number from the GitHub Issue (e.g., `specs/issue-36-plan.md` for issue #36)."

### Step 4: Update `.claude/commands/pr_review.md`
- Locate line 3 that says: "Create a new plan in specs/*.md to resolve the `PR-Review`"
- Replace with: "Create a new plan at `specs/issue-{issueNumber}-plan.md` (where `{issueNumber}` is the issue number) to resolve the `PR-Review`"
- Locate line 12 that says: "Create a revision plan in the `specs/*.md` file that addresses ALL review comments in the `PR-Review`."
- Replace with: "Create a revision plan at `specs/issue-{issueNumber}-plan.md` (where `{issueNumber}` is the issue number from the GitHub Issue) that addresses ALL review comments in the `PR-Review`."

### Step 5: Verify the fix
- Run the validation commands to ensure the changes don't introduce any regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The naming convention `issue-{issueNumber}-plan.md` is already used consistently in existing plan files (e.g., `issue-10-plan.md`, `issue-12-plan.md`, etc.)
- This fix ensures the slash commands explicitly communicate the expected naming convention to Claude, preventing future naming mismatches
- No changes are needed to the TypeScript code in `planAgent.ts` or `adwBuild.tsx` since the `getPlanFilePath()` function already defines the correct convention
