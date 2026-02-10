# Feature: Update Issue Classification with ADW-Aware Pre-Classifier

## Feature Description
Add a new Claude skill command `classify_adw.md` that extracts ADW workflow commands and ADW IDs from GitHub issue text. Update the issue classifier agent to use `/classify_adw` as a pre-classification step: if `/classify_adw` returns a non-empty JSON object (containing an `adw_slash_command` and/or `adw_id`), the issue is classified based on that result. Only if `/classify_adw` returns an empty object `{}` should the existing `/classify_issue` command be used as a fallback.

## User Story
As an ADW system operator
I want issues containing ADW-specific commands (like `/adw_plan_build_test`) to be classified via keyword extraction before falling back to LLM-based classification
So that ADW workflow commands embedded in issues are detected quickly, cheaply, and deterministically without relying on LLM interpretation

## Problem Statement
Currently, all issue classification goes through the `/classify_issue` command which uses an LLM (haiku) to determine issue type. When issues contain explicit ADW workflow commands (e.g., `/adw_plan`, `/adw_build`, `/adw_sdlc`), the LLM-based classification is unnecessary overhead. The system lacks a mechanism to detect and extract these ADW-specific commands and IDs from issue text, which could enable more targeted workflow routing.

## Solution Statement
Introduce a two-phase classification approach:
1. **Phase 1 - ADW Extraction**: Run `/classify_adw` to check for explicit ADW workflow commands and IDs in the issue text. This uses keyword-based extraction and returns a JSON result.
2. **Phase 2 - Fallback Classification**: If `/classify_adw` returns an empty object `{}`, fall back to the existing `/classify_issue` LLM-based classification.

This preserves backward compatibility while adding a fast-path for ADW-tagged issues.

## Relevant Files
Use these files to implement the feature:

- `.claude/commands/classify_issue.md` — Existing classification command; used as fallback when `/classify_adw` returns empty.
- `adws/triggers/issueClassifier.ts` — Contains `classifyIssueForTrigger()` and `classifyGitHubIssue()`; both need updating to call `/classify_adw` first.
- `adws/agents/claudeAgent.ts` — Provides `runClaudeAgentWithCommand()` used to invoke slash commands; no changes needed but important for understanding the invocation pattern.
- `adws/core/dataTypes.ts` — Defines `IssueClassSlashCommand`, `SlashCommand`, and related types; needs updating to add `/classify_adw` to `SlashCommand` and add ADW-specific types.
- `adws/core/index.ts` — Re-exports core types; needs updating if new types are added.
- `adws/workflowPhases.ts` — Calls `classifyGitHubIssue()` during workflow orchestration; indirect consumer of the updated classifier.
- `adws/triggers/trigger_webhook.ts` — Calls `classifyIssueForTrigger()`; indirect consumer of the updated classifier.
- `adws/triggers/trigger_cron.ts` — Calls `classifyIssueForTrigger()`; indirect consumer of the updated classifier.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests that mock `classifyGitHubIssue`; needs updating for new behavior.

### New Files
- `.claude/commands/classify_adw.md` — New Claude skill command for ADW workflow keyword extraction.
- `adws/__tests__/issueClassifier.test.ts` — New unit tests for the updated classifier logic.

## Implementation Plan
### Phase 1: Foundation
Add the `classify_adw.md` command file to `.claude/commands/`. Update `SlashCommand` type in `adws/core/dataTypes.ts` to include `/classify_adw`. Define a new interface for the ADW classification result (`AdwClassificationResult`) containing optional `adw_slash_command` and `adw_id` fields.

### Phase 2: Core Implementation
Update `classifyIssueForTrigger()` and `classifyGitHubIssue()` in `adws/triggers/issueClassifier.ts` to:
1. First call `/classify_adw` with the issue context.
2. Parse the JSON response.
3. If the result is a non-empty object (has `adw_slash_command` or `adw_id`), map the ADW command to the appropriate `IssueClassSlashCommand` and return immediately.
4. If the result is empty `{}`, fall back to the existing `/classify_issue` classification.

Create a helper function `mapAdwCommandToIssueType()` that maps ADW slash commands to `IssueClassSlashCommand` values:
- `/adw_plan` → `/feature`
- `/adw_build` → `/feature`
- `/adw_test` → `/feature`
- `/adw_review` → `/pr_review`
- `/adw_document` → `/chore`
- `/adw_patch` → `/bug`
- `/adw_plan_build` → `/feature`
- `/adw_plan_build_test` → `/feature`
- `/adw_plan_build_review` → `/pr_review`
- `/adw_plan_build_document` → `/chore`
- `/adw_plan_build_test_review` → `/feature`
- `/adw_sdlc` → `/feature`
- Default fallback: `/feature`

### Phase 3: Integration
Ensure the updated classifier functions are backward-compatible. The function signatures and return types remain unchanged (`IssueClassificationResult`). Update existing tests to account for the new two-phase flow. Add new tests covering ADW classification scenarios.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add the `classify_adw.md` command file
- Create `.claude/commands/classify_adw.md` with the exact contents from the GitHub issue attachment (the ADW Workflow Extraction prompt).
- The file should use `$ARGUMENTS` as the placeholder for issue text, following the same pattern as `classify_issue.md`.

### Step 2: Update `SlashCommand` type to include `/classify_adw`
- In `adws/core/dataTypes.ts`, add `'/classify_adw'` to the `SlashCommand` union type under the "ADW workflow commands" section.

### Step 3: Add ADW classification result interface and mapping function
- In `adws/triggers/issueClassifier.ts`, add:
  - An `AdwClassificationResult` interface with optional `adw_slash_command: string` and `adw_id: string` fields.
  - A `mapAdwCommandToIssueType()` pure function that maps ADW slash commands to `IssueClassSlashCommand`.
  - A `parseAdwClassificationOutput()` helper that parses the JSON output from `/classify_adw` and returns `AdwClassificationResult | null`.

### Step 4: Update `classifyIssueForTrigger()` to use two-phase classification
- In `adws/triggers/issueClassifier.ts`, update `classifyIssueForTrigger()`:
  1. After fetching the issue, first call `runClaudeAgentWithCommand('/classify_adw', issueContext, ...)` with haiku model.
  2. Parse the response as JSON. If the result contains `adw_slash_command`, map it to `IssueClassSlashCommand` and return.
  3. If the result is empty `{}` or parsing fails, fall back to the existing `/classify_issue` call.

### Step 5: Update `classifyGitHubIssue()` to use two-phase classification
- In `adws/triggers/issueClassifier.ts`, update `classifyGitHubIssue()` with the same two-phase approach:
  1. First attempt `/classify_adw` with haiku model.
  2. If ADW command found, map and return.
  3. Otherwise fall back to `/classify_issue`.

### Step 6: Create unit tests for the updated classifier
- Create `adws/__tests__/issueClassifier.test.ts` with tests covering:
  - `mapAdwCommandToIssueType()` maps all ADW commands correctly.
  - `parseAdwClassificationOutput()` parses valid JSON, handles empty `{}`, handles malformed output.
  - `classifyIssueForTrigger()` returns ADW-based classification when `/classify_adw` returns a non-empty result.
  - `classifyIssueForTrigger()` falls back to `/classify_issue` when `/classify_adw` returns `{}`.
  - `classifyGitHubIssue()` returns ADW-based classification when `/classify_adw` returns a non-empty result.
  - `classifyGitHubIssue()` falls back to `/classify_issue` when `/classify_adw` returns `{}`.
  - Error handling: if `/classify_adw` fails, the system gracefully falls back to `/classify_issue`.

### Step 7: Update existing workflow tests
- In `adws/__tests__/workflowPhases.test.ts`, verify the mock for `classifyGitHubIssue` still works correctly since the function signature and return type are unchanged.

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the feature works with zero regressions.

## Testing Strategy
### Unit Tests
- Test `mapAdwCommandToIssueType()` with every valid ADW command and verify the correct `IssueClassSlashCommand` is returned.
- Test `parseAdwClassificationOutput()` with valid JSON (`{"adw_slash_command": "/adw_plan"}`), empty JSON (`{}`), invalid JSON, and JSON with only `adw_id`.
- Test `classifyIssueForTrigger()` and `classifyGitHubIssue()` with mocked `runClaudeAgentWithCommand` to verify:
  - Two-phase flow: `/classify_adw` is called first.
  - Fallback: `/classify_issue` is called only when `/classify_adw` returns empty.
  - Error recovery: graceful fallback when `/classify_adw` throws or returns an error.

### Integration Tests
- The existing `workflowPhases.test.ts` tests serve as integration tests since they mock `classifyGitHubIssue` at the module boundary and verify the full workflow orchestration.

### Edge Cases
- `/classify_adw` returns `{}` (empty object) — must fall back to `/classify_issue`.
- `/classify_adw` returns malformed JSON — must fall back to `/classify_issue`.
- `/classify_adw` returns JSON with only `adw_id` but no `adw_slash_command` — must fall back to `/classify_issue` since we cannot determine issue type.
- `/classify_adw` agent call fails entirely (network error, timeout) — must fall back to `/classify_issue`.
- `/classify_adw` returns an unrecognized ADW command — use default mapping to `/feature`.
- Both `/classify_adw` and `/classify_issue` fail — return default `/feature` with `success: false` (existing behavior).

## Acceptance Criteria
- `.claude/commands/classify_adw.md` exists with the correct ADW extraction prompt content.
- `/classify_adw` is listed in the `SlashCommand` type in `adws/core/dataTypes.ts`.
- `classifyIssueForTrigger()` calls `/classify_adw` before `/classify_issue`.
- `classifyGitHubIssue()` calls `/classify_adw` before `/classify_issue`.
- When `/classify_adw` returns a valid ADW command, the classifier maps it to the correct `IssueClassSlashCommand` and returns without calling `/classify_issue`.
- When `/classify_adw` returns `{}`, the classifier falls back to `/classify_issue`.
- When `/classify_adw` fails, the classifier gracefully falls back to `/classify_issue`.
- All existing tests pass without modification (backward-compatible return types).
- New unit tests cover the two-phase classification flow, mapping function, and error handling.
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` prompt is designed for keyword extraction, not LLM reasoning — this makes haiku an ideal model for both steps.
- The `IssueClassificationResult` interface remains unchanged, ensuring full backward compatibility for all consumers (`workflowPhases.ts`, `trigger_webhook.ts`, `trigger_cron.ts`).
- The `adw_id` field extracted by `/classify_adw` is not currently used by the classifier but is included in the result for potential future use (e.g., resuming workflows by ADW ID). Consider storing it in the classification result metadata.
- Extract shared classification logic (the two-phase flow) into a helper function to keep `classifyIssueForTrigger` and `classifyGitHubIssue` DRY and under the 150-line file size guideline.
