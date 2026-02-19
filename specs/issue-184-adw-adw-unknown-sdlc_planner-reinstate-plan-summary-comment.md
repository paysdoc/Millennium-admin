# Bug: Plan summary missing from GitHub issue comment

## Metadata
issueNumber: `184`
adwId: `adw-unknown`
issueJson: `{}`

## Bug Description
The "Plan Summary" section in the `plan_created` GitHub issue comment only shows the plan file path instead of a meaningful summary of the plan. For example, issue #175 shows:

```
<details>
<summary>Plan Summary</summary>
`specs/issue-175-adw-adw-unknown-sdlc_planner-update-slash-commands-defaults.md`
</details>
```

Expected behavior (as seen in issue #149 before the regression):

```
<details>
<summary>Plan Summary</summary>
The plan has been created. Here's a summary:
**Work completed:**
- Researched the entire ADW workflow codebase...
**Key design decisions:**
- Add a single persistTokenCounts() function...
</details>
```

## Problem Statement
The `ctx.planOutput` field, which populates the "Plan Summary" `<details>` block in the GitHub issue comment, is set from `planResult.output`. This value comes from `state.lastResult.result` in the Claude Code JSONL stream output, which is the final text from the plan agent's session. Recent runs produce only the plan file path as the final agent output, resulting in a useless summary.

## Solution Statement
After the plan agent creates the plan file, read the plan file content from disk and use it as `ctx.planOutput`. The existing `truncateText(ctx.planOutput, 2000)` call in `formatPlanCreatedComment` will truncate it to a reasonable length. Fall back to `planResult.output` if the file cannot be read.

## Steps to Reproduce
1. Run an ADW workflow for any GitHub issue (e.g., `npx tsx adws/adwPlanBuild.tsx <issueNumber>`)
2. Observe the `plan_created` comment posted to the GitHub issue
3. The "Plan Summary" `<details>` section only contains the plan file path, not a meaningful summary

**Evidence from actual GitHub issue comments:**
- Issue #175 (broken): Plan Summary = `specs/issue-175-adw-adw-unknown-sdlc_planner-update-slash-commands-defaults.md`
- Issue #178 (broken): Plan Summary = `specs/issue-178-adw--sdlc_planner-find-worktree-by-issue-only.md`
- Issue #149 (working, before regression): Plan Summary = detailed summary with work completed and key design decisions
- Issue #140 (working, before regression): Plan Summary = detailed summary with research performed and plan highlights

## Root Cause Analysis
The `planPhase.ts:104` sets `ctx.planOutput = planResult.output`. The `planResult.output` comes from `state.lastResult.result` in `claudeAgent.ts:145`, which is the `result` field from the Claude Code CLI's JSONL `type: "result"` message. This field contains the final text of the agent's last assistant message.

For recent plan agent runs, the agent's final text output is just the plan file path (the report summary from the slash command). The Claude Code CLI's `result` field captures only this brief final text rather than the detailed summary that was previously generated.

The `formatPlanCreatedComment` function in `workflowCommentsIssue.ts:58-60` uses `ctx.planOutput` to populate the `<details><summary>Plan Summary</summary>` section. With only the file path as input, the summary is useless.

The fix is to read the actual plan file content after creation and use it as the summary source. This is more reliable than depending on the agent's conversational output, because:
1. The plan file always exists after the plan agent runs successfully
2. The plan file has a well-defined structure with meaningful sections (description, problem statement, solution, steps)
3. The first ~2000 characters of the plan file provide an excellent summary

## Relevant Files
Use these files to fix the bug:

- `adws/phases/planPhase.ts` - Contains `executePlanPhase()` where `ctx.planOutput` is set from `planResult.output`. This is where the fix goes: read the plan file content and use it instead.
- `adws/github/workflowCommentsIssue.ts` - Contains `formatPlanCreatedComment()` which uses `ctx.planOutput` in the `<details>` block. No changes needed here; it already truncates via `truncateText(ctx.planOutput, 2000)`.
- `adws/agents/planAgent.ts` - Contains `getPlanFilePath()` and `planFileExists()` functions. A new `readPlanFile()` helper should be added here to follow the existing pattern of plan-file-related utilities.
- `adws/__tests__/workflowPhases.test.ts` - Existing workflow phase tests. A test should be added to verify the plan summary is populated from the plan file content.
- `guidelines/coding_guidelines.md` - Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add `readPlanFile` helper to `adws/agents/planAgent.ts`

- Add a new exported function `readPlanFile(issueNumber: number, worktreePath?: string): string | null` that:
  - Calls the existing `getPlanFilePath(issueNumber, worktreePath)` to get the path
  - Constructs the full path using `worktreePath` if provided: `path.join(worktreePath, planPath)`
  - Reads the file content with `fs.readFileSync(fullPath, 'utf-8')`
  - Returns the content string on success, or `null` on any error (file not found, read error)
  - Does NOT log errors (the caller will handle fallback logic)
- Place the function after the existing `planFileExists()` function to maintain logical grouping

### 2. Update `adws/phases/planPhase.ts` to read plan file content for summary

- Add `readPlanFile` to the import from `'../agents'` (alongside the existing `runPlanAgent`, `getPlanFilePath`, `planFileExists`, `runCommitAgent`)
- In `executePlanPhase()`, after line 90 (`const resolvedPlanPath = getPlanFilePath(issueNumber, worktreePath);`) and before line 104 (`ctx.planOutput = planResult.output;`), add logic to:
  - Call `readPlanFile(issueNumber, worktreePath)` to get the plan file content
  - Set `ctx.planOutput = planFileContent || planResult.output;` — use the plan file content if available, fall back to agent output
  - Log a message if the file couldn't be read: `log('Could not read plan file for summary, using agent output', 'info')`

The resulting code block around the change should look like:

```typescript
// Re-resolve the plan file path now that the plan agent has created the file
const resolvedPlanPath = getPlanFilePath(issueNumber, worktreePath);
ctx.planPath = resolvedPlanPath;

// ... existing state management code ...

// Read the plan file content for the issue comment summary
const planFileContent = readPlanFile(issueNumber, worktreePath);
if (!planFileContent) {
  log('Could not read plan file for summary, using agent output', 'info');
}
ctx.planOutput = planFileContent || planResult.output;
postWorkflowComment(issueNumber, 'plan_created', ctx);
```

### 3. Update the `agents/index.ts` barrel export to include `readPlanFile`

- Verify that `adws/agents/index.ts` re-exports from `planAgent.ts` (it should already export `getPlanFilePath`, `planFileExists`, etc.)
- If `readPlanFile` is not automatically included in the barrel export, add it

### 4. Add unit tests for the new `readPlanFile` function and the updated plan summary flow

- In `adws/__tests__/`, add tests for the `readPlanFile` function:
  - Test that it returns the file content when the plan file exists
  - Test that it returns `null` when the plan file does not exist
  - Test that it returns `null` when the file read throws an error
- Update or add tests in `adws/__tests__/workflowPhases.test.ts` for `executePlanPhase` to verify:
  - When the plan file can be read, `ctx.planOutput` is set to the plan file content (not `planResult.output`)
  - When the plan file cannot be read, `ctx.planOutput` falls back to `planResult.output`

### 5. Run validation commands

- Run the validation commands below to verify the fix is correct with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `truncateText(ctx.planOutput, 2000)` call in `formatPlanCreatedComment` already handles truncation, so there's no need to truncate the plan file content before setting `ctx.planOutput`.
- The plan file content for the first ~2000 characters will include the title, metadata, description, problem statement, and solution statement sections — providing an excellent summary in the GitHub issue comment.
- This fix is resilient: if the plan file somehow can't be read (unlikely since the plan agent just created it), it falls back to the existing behavior of using `planResult.output`.
- No new dependencies are required.
