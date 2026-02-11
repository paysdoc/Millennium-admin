# Chore: Improve ADW Comment Identification and Trigger Logging

## Chore Description
Too many issue comments trigger new ADW workflows. The root cause is twofold:

1. **Cron trigger's `isQualifyingIssue` has a logic flaw:** Every standard ADW comment contains `ADW ID:` in its body, which matches the `/adw/i` regex on line 42 of `trigger_cron.ts`. This means the recovery check fires for *every* ADW comment, causing the function to return `true` even when the latest comment is an ADW system comment. The ADW comment filter on line 43 is never reached because the recovery check on line 42 short-circuits first.

2. **ADW comments lack a clear, machine-readable identifier** that distinguishes them from human comments at a glance. The current detection relies solely on the `## :emoji: Title` heading pattern, which is fragile and not immediately obvious to human readers. Comments posted by the workflow should contain an explicit marker (e.g., a footer or HTML comment) that both code and humans can easily identify.

3. **Insufficient logging** in the comment filtering logic makes it hard to debug why workflows are triggered unexpectedly.

## Relevant Files
Use these files to resolve the chore:

- `adws/triggers/trigger_cron.ts` — Contains `isQualifyingIssue` with the flawed recovery check logic that causes spurious workflow triggers. Needs the `/adw/i` regex fix and enhanced logging.
- `adws/triggers/trigger_webhook.ts` — Contains the webhook handler for `issue_comment` events. Needs enhanced logging around the `isAdwComment` check to trace comment filtering decisions.
- `adws/github/workflowCommentsBase.ts` — Contains `isAdwComment()` and the `ADW_COMMENT_PATTERN` regex. Needs to also check for the new machine-readable signature marker.
- `adws/github/workflowCommentsIssue.ts` — Contains all issue workflow comment formatters. Each formatter must append the new ADW signature footer to every comment.
- `adws/github/workflowCommentsPR.ts` — Contains all PR review workflow comment formatters. Each formatter must append the new ADW signature footer to every comment.
- `adws/__tests__/triggerCommentHandling.test.ts` — Existing tests for `isQualifyingIssue` and webhook comment filtering. Must be updated for the new signature and fixed logic.
- `adws/__tests__/commentFiltering.test.ts` — Existing tests for `isAdwComment` and `isAdwRunningForIssue`. Must be updated for the new signature detection.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add the ADW Signature Constant to `workflowCommentsBase.ts`

- Add a new exported constant `ADW_SIGNATURE` that contains a clearly human-readable and machine-parseable footer string. The signature should:
  - Be visually distinct as a footer line (using markdown horizontal rule separator)
  - Contain clear text that tells humans this was posted by the ADW workflow automation
  - Include an HTML comment with a machine-readable marker for reliable regex detection
  - Example format:
    ```
    \n\n---\n_Posted by ADW (AI Developer Workflow) automation_ <!-- adw-bot -->
    ```
- Add a new exported constant `ADW_SIGNATURE_PATTERN` regex that matches the HTML comment marker: `/<!-- adw-bot -->/`
- Update `isAdwComment()` to check for **either** the existing `ADW_COMMENT_PATTERN` (heading pattern) **or** the new `ADW_SIGNATURE_PATTERN`. This ensures backwards compatibility with existing comments while also detecting the new signature.

### Step 2: Append the ADW Signature to All Issue Workflow Comments in `workflowCommentsIssue.ts`

- Update every `format*Comment` function to append `ADW_SIGNATURE` at the end of the returned string.
- Import `ADW_SIGNATURE` from `workflowCommentsBase.ts`.
- The affected functions are:
  - `formatStartingComment`
  - `formatClassifiedComment`
  - `formatBranchCreatedComment`
  - `formatPlanBuildingComment`
  - `formatPlanCreatedComment`
  - `formatPlanFileCreatedComment`
  - `formatPlanCommittingComment`
  - `formatImplementingComment`
  - `formatBuildProgressComment`
  - `formatImplementedComment`
  - `formatImplementationCommittingComment`
  - `formatPrCreatingComment`
  - `formatPrCreatedComment`
  - `formatCompletedComment`
  - `formatErrorComment`
  - `formatResumingComment`
- Also update the `default` case in `formatWorkflowComment`.

### Step 3: Append the ADW Signature to All PR Review Workflow Comments in `workflowCommentsPR.ts`

- Update every case in `formatPRReviewWorkflowComment` to append `ADW_SIGNATURE` at the end of the returned string.
- Import `ADW_SIGNATURE` from `workflowCommentsBase.ts`.
- Also update the `default` case.

### Step 4: Fix the `isQualifyingIssue` Logic in `trigger_cron.ts`

- The current logic is:
  ```typescript
  if (issue.comments.length === 0) return true;
  const latestComment = issue.comments[issue.comments.length - 1];
  if (/adw/i.test(latestComment.body)) return true;  // BUG: matches all ADW comments
  if (!isAdwComment(latestComment.body)) return true;
  return false;
  ```
- The `/adw/i` recovery check must be moved **after** the `isAdwComment` check and should only apply to human comments that explicitly mention "adw" as a recovery trigger. Fix to:
  ```typescript
  if (issue.comments.length === 0) return true;
  const latestComment = issue.comments[issue.comments.length - 1];
  if (isAdwComment(latestComment.body)) return false;  // ADW system comment → not qualifying
  if (/adw/i.test(latestComment.body)) return true;    // Human comment mentioning "adw" → recovery
  return true;                                          // Human comment → qualifying
  ```
- This fixes the core bug: ADW system comments no longer bypass the filter because of the `/adw/i` match on their `ADW ID:` field.

### Step 5: Add Enhanced Logging to `trigger_cron.ts`

- In `isQualifyingIssue`, add `log()` calls that trace the decision path:
  - Log when an issue has no comments (qualifies).
  - Log when the latest comment is detected as an ADW system comment (does not qualify), including the comment body truncated to 100 chars.
  - Log when the latest comment is a human comment mentioning "adw" (qualifies via recovery).
  - Log when the latest comment is a regular human comment (qualifies).
- In `checkAndTrigger`, add a log for the total number of open issues fetched and the number of qualifying issues found.

### Step 6: Add Enhanced Logging to `trigger_webhook.ts`

- In the `issue_comment` handler, add more descriptive logging:
  - Log the comment body (truncated to 100 chars) when checking `isAdwComment`.
  - Log explicitly why a comment was ignored (ADW system comment) or processed (human comment).
- Import `truncateText` from `../github/workflowCommentsBase` for consistent truncation.

### Step 7: Export the New Constants from Barrel Files

- In `adws/github/workflowComments.ts`, add `ADW_SIGNATURE` and `ADW_SIGNATURE_PATTERN` to the exports from `workflowCommentsBase`.
- In `adws/github/index.ts`, add `ADW_SIGNATURE` and `ADW_SIGNATURE_PATTERN` to the re-exports from `./workflowComments`.

### Step 8: Update Tests in `triggerCommentHandling.test.ts`

- Update the replicated `isQualifyingIssue` logic to match the fixed implementation from Step 4.
- Update existing test cases that depend on the old logic:
  - The test "does not qualify issue where latest comment is ADW comment without adw text" should still pass (ADW comment → false).
  - The test "qualifies issue where latest comment is ADW comment with adw text (recovery)" must now expect `false` because the fix makes `isAdwComment` take precedence over the `/adw/i` check. ADW system comments should never trigger a new workflow.
  - The test "issue with completed ADW comment only does not qualify" must now expect `false` for the same reason.
- Add new test cases:
  - ADW comment with new signature marker does not qualify.
  - Human comment mentioning "adw" without the signature qualifies (recovery).
  - Human comment not mentioning "adw" qualifies.

### Step 9: Update Tests in `commentFiltering.test.ts`

- Add test cases for `isAdwComment` that verify detection of the new `ADW_SIGNATURE_PATTERN`:
  - Comment with only the new signature footer (no heading) returns `true`.
  - Comment with both heading and signature returns `true`.
  - Comment with the `<!-- adw-bot -->` marker embedded in text returns `true`.
  - Human comment without signature or heading returns `false`.

### Step 10: Run Validation Commands

- Run all validation commands to verify the chore is complete with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `ADW_SIGNATURE` must be appended to every workflow comment to ensure both old and new comments are detectable. Backwards compatibility is maintained by keeping the existing `ADW_COMMENT_PATTERN` check alongside the new `ADW_SIGNATURE_PATTERN` check.
- The `isQualifyingIssue` fix is the most critical change — it resolves the root cause of spurious workflow triggers. The order of checks matters: `isAdwComment` must be evaluated before the `/adw/i` recovery regex.
- The HTML comment `<!-- adw-bot -->` is invisible when rendered on GitHub but is reliably parseable by code. The surrounding human-readable text `_Posted by ADW (AI Developer Workflow) automation_` makes the comment's origin obvious to anyone reading the issue.
