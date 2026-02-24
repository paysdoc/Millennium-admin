# PR-Review: Add logging when attempting classification strategies

## PR-Review Description
The reviewer (paysdoc) requested adding logging when attempting the different classification strategies in the issue classifier. Currently, `issueClassifier.ts` logs the *result* of classification (success/error) but does not log when each strategy is being *attempted* or when the system *transitions* from one strategy to another. The two-step classification flow (try `/classify_adw` first, fall back to `/classify_issue`) should produce clear log output showing which strategy is being attempted and why fallback occurs, making it easy to trace the classification decision path.

## Summary of Original Implementation Plan
The original plan (`specs/issue-130-plan.md`) introduced a two-step classification system: a new `/classify_adw` command to detect explicit ADW workflow keywords in issue text, falling back to the existing `/classify_issue` command for AI-based heuristic classification. It added new types (`AdwSlashCommand`, `AdwClassificationResult`, `adwCommandToIssueTypeMap`) to `dataTypes.ts`, created the `classify_adw.md` command file, updated `issueClassifier.ts` with `parseAdwClassificationOutput` and `classifyWithAdwCommand` functions, and added comprehensive unit tests in `issueClassifier.test.ts`.

## Relevant Files
Use these files to resolve the review:

- `adws/triggers/issueClassifier.ts` - The core file that needs logging additions. Contains `classifyWithAdwCommand`, `classifyWithIssueCommand`, `classifyIssueForTrigger`, and `classifyGitHubIssue` functions that implement the two-step classification flow.
- `adws/__tests__/issueClassifier.test.ts` - Unit tests for the classifier. Tests mock `log` as `vi.fn()`. New log call assertions should be added to verify the strategy-attempt logs are emitted correctly.
- `adws/core/utils.ts` - Defines the `log(message, level)` function with `'info'`, `'error'`, and `'success'` levels. No changes needed, but referenced for the logging API.
- `guidelines/coding_guidelines.md` - Coding guidelines to follow.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add strategy-attempt logging to `classifyIssueForTrigger`
- At line 179 (before the `// Step 1: Try ADW-specific classification` comment), add an info log:
  ```typescript
  log(`Attempting ADW classification (/classify_adw) for issue #${issueNumber}...`);
  ```
- After `if (adwResult) return adwResult;` (line 185), add a fallback transition log:
  ```typescript
  log(`No ADW command found for issue #${issueNumber}, falling back to /classify_issue`);
  ```
- Before the `// Step 2: Fall back to /classify_issue` return statement (line 188), add an info log:
  ```typescript
  log(`Attempting heuristic classification (/classify_issue) for issue #${issueNumber}...`);
  ```

### Step 2: Add strategy-attempt logging to `classifyGitHubIssue`
- At line 219 (before the `// Step 1: Try ADW-specific classification` comment), add an info log:
  ```typescript
  log(`Attempting ADW classification (/classify_adw) for issue #${issue.number}...`);
  ```
- After `if (adwResult) return adwResult;` (line 225), add a fallback transition log:
  ```typescript
  log(`No ADW command found for issue #${issue.number}, falling back to /classify_issue`);
  ```
- Before the `// Step 2: Fall back to /classify_issue` return statement (line 228), add an info log:
  ```typescript
  log(`Attempting heuristic classification (/classify_issue) for issue #${issue.number}...`);
  ```

### Step 3: Add logging to `classifyWithAdwCommand` for non-success paths
- After `if (!result.success) return null;` (line 103), add a log before the return:
  ```typescript
  if (!result.success) {
    log(`ADW classifier agent failed for issue #${issueNumber}`, 'error');
    return null;
  }
  ```
- After `if (!parsed?.adw_slash_command) return null;` (line 106), add a log before the return:
  ```typescript
  if (!parsed?.adw_slash_command) {
    log(`ADW classifier returned no valid command for issue #${issueNumber}`);
    return null;
  }
  ```
- In the catch block (line 117-119), add an error log:
  ```typescript
  catch (error) {
    log(`ADW classification error for issue #${issueNumber}: ${error}`, 'error');
    return null;
  }
  ```

### Step 4: Update unit tests to verify strategy-attempt log calls
- In `issueClassifier.test.ts`, import `log` from the mocked `../core` module so we can assert on it:
  ```typescript
  import { log } from '../core';
  ```
- In the `classifyIssueForTrigger` describe block, add assertions that verify the info-level strategy logs are called:
  - In the "uses ADW classification" test: verify `log` was called with a message containing "Attempting ADW classification"
  - In the "falls back to /classify_issue" test: verify `log` was called with a message containing "falling back to /classify_issue" and "Attempting heuristic classification"
- In the `classifyGitHubIssue` describe block, add similar assertions:
  - In the "uses ADW classification" test: verify `log` was called with a message containing "Attempting ADW classification"
  - In the "falls back to /classify_issue" test: verify `log` was called with a message containing "falling back to /classify_issue" and "Attempting heuristic classification"
- In the `classifyWithAdwCommand` describe block:
  - In the "returns null when agent call fails" test: verify `log` was called with a message containing "ADW classifier agent failed"
  - In the "returns null when agent returns empty JSON" test: verify `log` was called with a message containing "no valid command"

### Step 5: Run validation commands

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- All new log calls use the existing `log()` function from `adws/core/utils.ts` with the default `'info'` level (except error paths which use `'error'`).
- The logging pattern follows the convention used in `claudeAgent.ts` and `workflowPhases.ts` where info-level logs describe what's about to happen.
- The `log` function is already mocked as `vi.fn()` in the test file, so new log calls won't cause test failures. We add explicit assertions on key log calls to ensure the strategy-attempt logging works correctly.
- No new dependencies or types are needed for this change.
