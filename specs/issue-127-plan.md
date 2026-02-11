# Chore: Require explicit human directive to trigger ADW workflows from comments

## Chore Description
The ADW comment classification system currently uses a deny-list approach: it checks for `ADW_COMMENT_PATTERN` or `ADW_SIGNATURE_PATTERN` to identify system comments, and treats everything else as a human/actionable comment. This fails for third-party bot comments (e.g., Vercel deployment comments with `[vc]:` prefix) that don't match either ADW pattern, causing them to be misclassified as human comments and erroneously triggering ADW workflows.

The fix is to invert the logic from a deny-list to an allow-list approach. Instead of asking "is this NOT a system comment?" (which requires knowing every possible system comment format), we ask "does this comment contain an explicit human directive?" by requiring the presence of a `## Take action` heading in the comment body. This is more robust because:

1. No need to maintain patterns for every possible bot/system comment format
2. Humans explicitly opt-in to triggering workflows
3. Future bot integrations won't accidentally trigger workflows

## Relevant Files
Use these files to resolve the chore:

- `adws/github/workflowCommentsBase.ts` — Defines `isAdwComment()`, `ADW_COMMENT_PATTERN`, `ADW_SIGNATURE_PATTERN`, and related utilities. This is the core file where the new `isActionableComment()` function will be added and `isAdwComment()` usage will be updated.
- `adws/triggers/trigger_webhook.ts` — Uses `isAdwComment()` to filter issue comments in the webhook handler (lines 194-198). Must be updated to use the new allow-list check.
- `adws/triggers/trigger_cron.ts` — Uses `isAdwComment()` in `isQualifyingIssue()` (line 46). Must be updated to use the new allow-list check.
- `adws/github/index.ts` — Re-exports functions from the github module. Must export the new `isActionableComment` function.
- `adws/__tests__/commentFiltering.test.ts` — Tests for `isAdwComment()`. Must be updated to test the new `isActionableComment()` function and verify it rejects bot comments.
- `adws/__tests__/triggerCommentHandling.test.ts` — Tests for qualifying-issue and webhook filtering logic. Must be updated to use the new allow-list approach and add test cases for third-party bot comments.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `isActionableComment()` and `ACTIONABLE_COMMENT_PATTERN` to `workflowCommentsBase.ts`

- Add a new exported constant `ACTIONABLE_COMMENT_PATTERN` that matches the heading `## Take action` (case-insensitive, at the start of a line):
  ```typescript
  export const ACTIONABLE_COMMENT_PATTERN = /^## Take action$/mi;
  ```
- Add a new exported function `isActionableComment(commentBody: string): boolean` that returns `true` only if the comment body contains the `## Take action` heading:
  ```typescript
  export function isActionableComment(commentBody: string): boolean {
    return ACTIONABLE_COMMENT_PATTERN.test(commentBody);
  }
  ```
- Keep `isAdwComment()` intact — it is still used by other parts of the system (e.g., `isAdwRunningForIssue`, `detectRecoveryState`) that need to identify ADW workflow comments specifically. Do NOT remove or modify it.

### Step 2: Update `adws/github/index.ts` to export new symbols

- Add `isActionableComment` and `ACTIONABLE_COMMENT_PATTERN` to the re-exports from `./workflowComments` (which re-exports from `workflowCommentsBase`).

### Step 3: Update `adws/github/workflowComments.ts` to re-export new symbols

- Check `adws/github/workflowComments.ts` and ensure it re-exports `isActionableComment` and `ACTIONABLE_COMMENT_PATTERN` from `workflowCommentsBase.ts` so the barrel export in `index.ts` works.

### Step 4: Update webhook trigger (`trigger_webhook.ts`) to use allow-list approach

- In the `issue_comment` handler (around line 192-200), replace the current deny-list logic:
  ```typescript
  // BEFORE (deny-list):
  if (isAdwComment(commentBody)) {
    log(`Ignored ADW system comment...`);
    return;
  }
  log(`Processing human comment...`);
  ```
  with an allow-list approach:
  ```typescript
  // AFTER (allow-list):
  if (!isActionableComment(commentBody)) {
    log(`Ignored comment on issue #${issueNumber}: missing "## Take action" directive`);
    jsonResponse(res, 200, { status: 'ignored' });
    return;
  }
  log(`Actionable comment on issue #${issueNumber}: contains "## Take action" directive`);
  ```
- Update the import at the top of the file to import `isActionableComment` instead of `isAdwComment` (remove `isAdwComment` from the import only if it's no longer used in this file).

### Step 5: Update cron trigger (`trigger_cron.ts`) to use allow-list approach

- In the `isQualifyingIssue()` function (lines 38-58), replace the current deny-list logic:
  ```typescript
  // BEFORE:
  if (isAdwComment(latestComment.body)) {
    log(`...does not qualify`);
    return false;
  }
  if (/adw/i.test(latestComment.body)) {
    log(`...qualifies via recovery`);
    return true;
  }
  log(`...qualifies`);
  return true;
  ```
  with an allow-list approach:
  ```typescript
  // AFTER:
  if (isActionableComment(latestComment.body)) {
    log(`Issue #${issue.number}: latest comment contains "## Take action" directive, qualifies`);
    return true;
  }
  log(`Issue #${issue.number}: latest comment does not contain "## Take action" directive (${truncateText(latestComment.body, 100)}), does not qualify`);
  return false;
  ```
- Update the import at the top of the file to import `isActionableComment` instead of `isAdwComment` (keep `isAdwComment` if still used elsewhere in the file; check `isAdwRunningForIssue` — it's imported but used for a different purpose, so keep it).
- Remove the `/adw/i` recovery regex — this is subsumed by the explicit `## Take action` directive. If users want to re-trigger, they add `## Take action` to their comment.

### Step 6: Update `commentFiltering.test.ts` tests

- Keep existing `isAdwComment` tests intact (the function still exists and is used elsewhere).
- Add a new `describe('isActionableComment')` block with the following test cases:
  - Returns `true` for a comment with `## Take action` heading
  - Returns `true` for a comment with `## Take action` heading followed by body text
  - Returns `true` for a comment with text before and after `## Take action` heading
  - Returns `false` for a plain human comment without the directive
  - Returns `false` for an ADW system comment
  - Returns `false` for a Vercel bot comment (e.g., `[vc]: #hash...`)
  - Returns `false` for an empty string
  - Returns `false` for a comment with "Take action" but not as an `##` heading (e.g., inline text)
  - Returns `true` for case-insensitive match (e.g., `## take action`, `## TAKE ACTION`)

### Step 7: Update `triggerCommentHandling.test.ts` tests

- Update the replicated `isQualifyingIssue` function in the test file to match the new allow-list logic:
  - If no comments → `true` (unchanged — issues with no comments still qualify)
  - If latest comment has `## Take action` → `true`
  - If latest comment does NOT have `## Take action` → `false`
- Update all existing test cases to reflect the new logic:
  - "qualifies issue with no comments" → still passes (no change)
  - "does not qualify issue where latest comment is ADW comment" → still does not qualify (no `## Take action`)
  - "qualifies issue where latest comment is human comment" → update the human comment body to include `## Take action`; add a separate test where human comment lacks the directive and does NOT qualify
  - "recovery via 'adw' mention" → remove or replace with a test showing `## Take action` is needed for re-trigger
  - "qualifies issue where latest comment has emoji not in heading format" → update expectation: does NOT qualify without `## Take action`
- Add new test cases:
  - "does not qualify when latest comment is a Vercel bot comment" with body `[vc]: #hash...`
  - "does not qualify when latest comment is a generic bot comment" with some non-ADW bot format
  - "qualifies when latest comment contains ## Take action even with other text"
- Update webhook filtering tests:
  - "identifies human comment as actionable" → update to require `## Take action`
  - "identifies comment without directive as non-actionable"
  - "identifies Vercel bot comment as non-actionable"

### Step 8: Run Validation Commands to confirm zero regressions

- Execute the validation commands listed below to confirm the chore is complete with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- `isAdwComment()` must NOT be removed or modified. It is still used by `isAdwRunningForIssue()`, `detectRecoveryState()`, and other internal workflow state-tracking logic that needs to distinguish ADW workflow comments from all other comments.
- The `## Take action` directive is case-insensitive to be user-friendly. The regex uses the `i` flag and `m` flag (multiline, so `^` matches start of any line).
- Issues with zero comments still qualify in the cron trigger — this handles the "new issue opened" case where the webhook triggers on issue creation, not comment.
- The "adw recovery" mechanism (`/adw/i` regex) in `trigger_cron.ts` is removed. Users who want to re-trigger a workflow on an existing issue should add a comment containing `## Take action`.
- This change affects only the ADW trigger comment classification. It does not affect the ADW workflow comment posting format or the ADW recovery state detection.
