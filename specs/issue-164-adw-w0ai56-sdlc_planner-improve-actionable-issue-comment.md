# Chore: Improve Actionable Issue Comment

## Metadata
issueNumber: `164`
adwId: `w0ai56`
issueJson: `## GitHub Issue #164
**Title:** improve actionable issue comment
**State:** OPEN
**Author:** paysdoc
**Labels:** none
**Created:** 2026-02-18T07:55:37Z

### Description
Include and take action on the contents of an actionable issue comment

### Comments
No comments.`

## Chore Description
When a user posts an actionable comment on a GitHub issue (a comment containing `## Take action`), the ADW system currently detects it as a boolean trigger signal but discards the comment's content. The content below the `## Take action` heading (e.g., "Please also update the tests" or "Actually, can you also handle edge case X?") is never explicitly surfaced to the planning or build agents. Instead, it gets buried in the full unfiltered list of ALL issue comments (including dozens of ADW bot status comments), with no special emphasis or differentiation.

This chore improves the system to:
1. **Extract** the actionable content from `## Take action` comments (the text below the heading).
2. **Filter out** ADW bot comments from the comments passed to the plan agent, reducing noise.
3. **Surface** the actionable comment content prominently in a dedicated `### Actionable Comment` section in the plan agent's input, so the AI agent explicitly sees and acts on it.
4. **Update tests** to verify the new extraction and filtering logic.

## Relevant Files
Use these files to resolve the chore:

- `adws/github/workflowCommentsBase.ts` — Contains `isActionableComment()` which currently only returns a boolean. Needs a new `extractActionableContent()` function to extract the text content below the `## Take action` heading.
- `adws/agents/planAgent.ts` — Contains `formatIssueContextAsArgs()` which currently includes ALL comments unfiltered. Needs to: (a) filter out ADW bot comments, (b) add a dedicated `### Actionable Comment` section when an actionable comment is present.
- `adws/__tests__/commentFiltering.test.ts` — Existing tests for `isActionableComment()`. Needs new tests for `extractActionableContent()`.
- `adws/__tests__/planAgent.test.ts` — Existing tests for plan file operations. Needs new tests for the updated `formatIssueContextAsArgs()` function (comment filtering and actionable comment surfacing).
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `extractActionableContent()` to `workflowCommentsBase.ts`

- Add a new exported function `extractActionableContent(commentBody: string): string | null` in `adws/github/workflowCommentsBase.ts`.
- The function should:
  - Return `null` if the comment does not contain the `## Take action` heading (use `ACTIONABLE_COMMENT_PATTERN`).
  - Extract and return the text content that follows the `## Take action` heading (everything after the heading line).
  - Trim leading/trailing whitespace from the extracted content.
  - Return `null` if the extracted content is empty after trimming.
- Ensure the function is also exported from `adws/github/workflowComments.ts` (barrel re-export file) — check if it uses wildcard re-exports or explicit named exports.

### Step 2: Update `formatIssueContextAsArgs()` in `planAgent.ts`

- In `adws/agents/planAgent.ts`, update the `formatIssueContextAsArgs()` function to:
  1. Import `isAdwComment` from `../github/workflowCommentsBase` and `extractActionableContent` from `../github/workflowCommentsBase`.
  2. Filter out ADW bot comments from `issue.comments` using `isAdwComment()` — only include human (non-bot) comments in the `### Comments` section.
  3. Find the latest actionable comment by iterating the comments in reverse and calling `extractActionableContent()` on each.
  4. If an actionable comment is found, add a `### Actionable Comment` section **before** the `### Comments` section in the formatted output. This section should contain the extracted actionable content, making it prominently visible to the plan agent.
  5. Keep the `### Comments` section with the filtered (non-ADW-bot) comments as before, for general context.

### Step 3: Add tests for `extractActionableContent()` in `commentFiltering.test.ts`

- Add a new `describe('extractActionableContent', ...)` block in `adws/__tests__/commentFiltering.test.ts`.
- Import `extractActionableContent` from `../github/workflowCommentsBase`.
- Test cases:
  - Returns the content after `## Take action` heading when content is present.
  - Returns `null` for a comment without `## Take action`.
  - Returns `null` for a comment with only `## Take action` and no body text after it.
  - Returns trimmed content (no leading/trailing whitespace).
  - Handles content with text before the `## Take action` heading — only returns the text after it.
  - Handles multiline content after `## Take action`.
  - Is case-insensitive for the heading (e.g., `## take action`).
  - Returns `null` for empty string input.

### Step 4: Add tests for updated `formatIssueContextAsArgs()` in `planAgent.test.ts`

- In `adws/__tests__/planAgent.test.ts`, add a new `describe('formatIssueContextAsArgs', ...)` block.
- Since `formatIssueContextAsArgs` is not currently exported, we need to either:
  - **Option A (preferred):** Export it from `planAgent.ts` for testability (add `export` keyword to the function declaration).
  - **Option B:** Test it indirectly through `runPlanAgent` (more complex, requires mocking claudeAgent).
- Use Option A: add `export` to `formatIssueContextAsArgs()`.
- Test cases:
  - Filters out ADW bot comments (comments matching `isAdwComment()`) from the `### Comments` section.
  - Includes non-ADW human comments in the `### Comments` section.
  - Adds `### Actionable Comment` section when an actionable comment is present.
  - Does not add `### Actionable Comment` section when no actionable comment exists.
  - Uses the latest actionable comment when multiple actionable comments exist.
  - Shows "No comments." when all comments are ADW bot comments and no actionable comment exists.
- Create mock `GitHubIssue` objects with various comment configurations for each test case.

### Step 5: Run Validation Commands

- Run `npm run lint`, `npm run build`, and `npm test` to ensure all changes pass without errors or regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `formatIssueContextAsArgs()` function is currently private (not exported). It needs to be exported to enable direct unit testing (Step 4).
- The `### Actionable Comment` section is placed before `### Comments` to give it visual prominence in the plan agent's input, ensuring the AI agent prioritizes it.
- ADW bot comments are identified using the existing `isAdwComment()` function, which checks for both the ADW heading pattern (`## :emoji: Title`) and the `<!-- adw-bot -->` signature marker.
- Only the latest actionable comment is surfaced in the `### Actionable Comment` section, since multiple `## Take action` comments may exist if the user has re-triggered the workflow multiple times.
