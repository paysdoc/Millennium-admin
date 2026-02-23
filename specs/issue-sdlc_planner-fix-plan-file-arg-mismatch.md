# Bug: Plan file argument mismatch between planAgent and slash commands

## Metadata
issueNumber: `201`
adwId: `adw-unknown`
issueJson: `{"body": "The plan file being written has a different name than the file that subsequent commands try to find. The file names need to be harmonized"}`

## Bug Description
When `runPlanAgent` invokes a slash command (`/bug`, `/feature`, `/chore`), it passes the arguments in the wrong order. The slash command templates expect `$1` to be the `issueNumber` (a plain integer like `201`), `$2` to be the `adwId`, and `$3` to be the `issueJson`. However, `runPlanAgent` passes the full multiline issue context string as `$1` instead of the issue number.

This causes the Claude model to receive a huge markdown blob where it expects a simple integer. The model inconsistently extracts the issue number from the text, producing plan files with incorrect names (empty issueNumber, `issueNumber=0`, garbled adwId). Subsequent commands like `findPlanFile`, `buildPhase`, `prReviewPhase`, and `documentPhase` all use `getPlanFilePath` which searches for `issue-{issueNumber}-adw-*-sdlc_planner-*.md` with the correct integer, so they fail to find the misnamed file.

**Expected behavior:** Plan file is named `issue-201-adw-abc123-sdlc_planner-description.md` and all downstream phases find it correctly.

**Actual behavior:** Plan file gets misnamed (e.g., `issue--adw--sdlc_planner-...`, `issue-0-adw-...-sdlc_planner-...`) and downstream phases cannot locate it, causing build failures or fallback to empty plan content.

## Problem Statement
`runPlanAgent` in `adws/agents/planAgent.ts` passes `issueContext` (a multiline markdown string) as the first positional argument to the slash command, but the command templates (`bug.md`, `feature.md`, `chore.md`) expect `$1` to be the `issueNumber` integer. This positional arg mismatch causes unreliable plan file naming.

## Solution Statement
Fix the argument order in `runPlanAgent` to pass `String(issue.number)` as `$1` (matching what the command templates expect). Enrich `issueJson` to include issue comments so that context is not lost when the `issueContext` is no longer passed as `$1`. Update the existing `planAgent.test.ts` to verify the corrected argument order.

## Steps to Reproduce
1. Run `npx tsx adws/adwPlanBuild.tsx <issueNumber>` for any GitHub issue
2. Observe the plan file created in `specs/` — its name may have empty or incorrect `issueNumber` and `adwId` segments
3. The build phase then calls `getPlanFilePath(issueNumber, worktreePath)` which searches for `issue-{issueNumber}-adw-*-sdlc_planner-*.md`
4. The regex doesn't match the misnamed file, causing `Cannot read plan file` errors

Evidence from existing specs directory:
- `issue--adw--sdlc_planner-fix-worktree-creation-unquoted-branch.md` — empty issueNumber and adwId
- `issue-0-adw-update-bug-chore-and-60g8oc-sdlc_planner-fix-e2e-test-name-mismatch.md` — issueNumber defaulted to 0, adwId garbled
- `issue-175-adw-adw-unknown-sdlc_planner-update-slash-commands-defaults.md` — doubled `adw-adw-unknown`

## Root Cause Analysis
In `adws/agents/planAgent.ts`, the `runPlanAgent` function builds the args array as:

```typescript
const args = [issueContext, adwId || 'adw-unknown', issueJson];
```

Where `issueContext` is the full formatted markdown output of `formatIssueContextAsArgs(issue)` — a multiline string containing the issue title, body, comments, etc.

But the slash command templates define their variables as:
```
issueNumber: $1, default 0 if not provided
adwId: $2, default to `adw-unknown` if not provided
issueJson: $3, default to empty JSON object if not provided
```

So `$1` receives the huge context string instead of a plain integer. The Claude model attempts to interpret this as `issueNumber` and produces unreliable filenames. Meanwhile, `issueJson` (which is `$3`) already contains `number`, `title`, `body`, `state`, `author`, `labels`, and `createdAt` — but is missing `comments`, which are only available in the `issueContext` string.

## Relevant Files
Use these files to fix the bug:

- `adws/agents/planAgent.ts` — Contains `runPlanAgent` where the args are built in the wrong order. This is the primary file to fix. Also contains `findPlanFile`, `getPlanFilePath`, and `formatIssueContextAsArgs`.
- `adws/__tests__/planAgent.test.ts` — Contains tests for `getPlanFilePath`, `planFileExists`, `readPlanFile`, `formatIssueContextAsArgs`, and `runPlanAgent`. Must be updated to verify the corrected argument order.
- `guidelines/coding_guidelines.md` — Coding standards to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix the args array in `runPlanAgent`

In `adws/agents/planAgent.ts`, modify the `runPlanAgent` function to:

- Change the args array from `[issueContext, adwId || 'adw-unknown', issueJson]` to `[String(issue.number), adwId || 'adw-unknown', issueJson]`
- Enrich the `issueJson` object to include the `comments` field (filtered human comments from the issue) so that the context previously provided only via `issueContext` is not lost
- The `issueJson` should include a new `comments` field containing the filtered human comments (same filtering logic used in `formatIssueContextAsArgs`) and an `actionableComment` field for the latest actionable content

The updated code in `runPlanAgent` should look like:

```typescript
const humanComments = issue.comments.filter(c => !isAdwComment(c.body));

const latestActionableContent = [...issue.comments]
  .reverse()
  .reduce<string | null>((found, c) => found ?? extractActionableContent(c.body), null);

const issueJson = JSON.stringify({
  number: issue.number,
  title: issue.title,
  body: issue.body,
  state: issue.state,
  author: issue.author.login,
  labels: issue.labels.map(l => l.name),
  createdAt: issue.createdAt,
  comments: humanComments.map(c => ({
    author: c.author.login,
    createdAt: c.createdAt,
    body: c.body,
  })),
  actionableComment: latestActionableContent,
});
const args = [String(issue.number), adwId || 'adw-unknown', issueJson];
```

### Step 2: Update tests in `planAgent.test.ts`

- Update existing `runPlanAgent` tests to verify the args array is `[String(issue.number), adwId, issueJson]`
- Add a test that verifies `issueJson` includes the `comments` and `actionableComment` fields
- Ensure the mock issue objects include comments for proper test coverage

### Step 3: Run validation commands

Run the validation commands listed below to ensure the fix works correctly with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `formatIssueContextAsArgs` function is still exported and used by the `runPrReviewPlanAgent` function, so it should NOT be removed.
- The fix is intentionally minimal: only the args array construction in `runPlanAgent` changes. No changes to slash command templates, `findPlanFile`, `getPlanFilePath`, or any downstream phase files are needed.
- Existing misnamed spec files in the repo are historical artifacts and do not need to be renamed.
