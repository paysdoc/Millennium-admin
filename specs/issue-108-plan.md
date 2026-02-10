# Feature: Update Issue Classification with Two-Phase ADW-Aware Classifier

## Feature Description
Add a new Claude skill command `classify_adw.md` that extracts ADW workflow commands and ADW IDs from GitHub issue text using keyword-based extraction. Update the issue classifier to use a two-phase classification approach: first try `/classify_adw` for fast, deterministic keyword extraction, then fall back to the existing `/classify_issue` LLM-based classification only when `/classify_adw` returns an empty result. This enables more accurate and cost-effective classification for issues that contain explicit ADW workflow commands.

## User Story
As an ADW system operator
I want issues containing ADW workflow commands (like `/adw_plan_build_test`) to be classified via deterministic keyword extraction before falling back to LLM-based classification
So that classification is faster, cheaper, and more reliable for ADW-tagged issues while maintaining full backward compatibility

## Problem Statement
Currently, all issue classification goes through the `/classify_issue` command which uses an LLM (haiku) to interpret issue content and determine the type. When issues contain explicit ADW workflow commands (e.g., `/adw_plan`, `/adw_build`, `/adw_sdlc`), the LLM-based classification is unnecessary overhead and introduces non-determinism. The system lacks a mechanism to detect and extract these ADW-specific commands and IDs from issue text, which could enable faster, deterministic workflow routing.

## Solution Statement
Introduce a two-phase classification approach in both `classifyIssueForTrigger()` and `classifyGitHubIssue()`:
1. **Phase 1 - ADW Extraction**: Run `/classify_adw` to check for explicit ADW workflow commands and IDs in the issue text. This uses keyword-based extraction and returns a JSON result (`{"adw_slash_command": "/adw_plan", "adw_id": "abc12345"}` or `{}`).
2. **Phase 2 - Fallback Classification**: If `/classify_adw` returns an empty object `{}` or fails, fall back to the existing `/classify_issue` LLM-based classification.

A mapping function converts ADW commands (e.g., `/adw_plan_build_test`) to issue classification types (e.g., `/feature`). The function signatures and return types remain unchanged, ensuring full backward compatibility for all consumers.

## Relevant Files
Use these files to implement the feature:

- `.claude/commands/classify_issue.md` — Existing classification command; used as the Phase 2 fallback when `/classify_adw` returns empty. No changes needed, but important for understanding the existing pattern.
- `adws/triggers/issueClassifier.ts` — Main classifier module containing `classifyIssueForTrigger()`, `classifyGitHubIssue()`, and `getWorkflowScript()`. Both classification functions need updating to implement the two-phase flow. New helper functions will be added here.
- `adws/agents/claudeAgent.ts` — Provides `runClaudeAgentWithCommand()` used to invoke slash commands. No changes needed, but important for understanding how commands are invoked.
- `adws/core/dataTypes.ts` — Defines `IssueClassSlashCommand`, `SlashCommand`, and related types. Needs `/classify_adw` added to the `SlashCommand` union type.
- `adws/core/index.ts` — Re-exports core types. No changes needed (types are already exported).
- `adws/triggers/trigger_webhook.ts` — Calls `classifyIssueForTrigger()`. Indirect consumer, no changes needed. Validates backward compatibility.
- `adws/triggers/trigger_cron.ts` — Calls `classifyIssueForTrigger()`. Indirect consumer, no changes needed. Validates backward compatibility.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests that mock `classifyGitHubIssue`. Must continue to pass without modification.

### New Files
- `.claude/commands/classify_adw.md` — New Claude skill command for ADW workflow keyword extraction. Content provided as attachment on issue #107.
- `adws/__tests__/issueClassifier.test.ts` — New unit tests for the updated classifier logic covering mapping, parsing, two-phase flow, fallback behavior, and error handling.

## Implementation Plan
### Phase 1: Foundation
Add the `classify_adw.md` command file to `.claude/commands/` with the exact content from the GitHub issue #107 attachment. Update the `SlashCommand` type in `adws/core/dataTypes.ts` to include `/classify_adw`. These foundational changes enable the new command to be invoked by the agent runner.

### Phase 2: Core Implementation
Update `adws/triggers/issueClassifier.ts` to implement the two-phase classification:
1. Add an `AdwClassificationResult` interface for the JSON response from `/classify_adw`.
2. Add a `mapAdwCommandToIssueType()` pure function mapping ADW commands to `IssueClassSlashCommand` values.
3. Add a `parseAdwClassificationOutput()` helper to safely parse the JSON output.
4. Extract the shared two-phase flow into a `classifyWithTwoPhaseFlow()` helper to keep both public functions DRY (file must stay under 150 lines per coding guidelines).
5. Update `classifyIssueForTrigger()` and `classifyGitHubIssue()` to use the shared helper.

### Phase 3: Integration
Create comprehensive unit tests in `adws/__tests__/issueClassifier.test.ts`. Verify that existing tests (especially `workflowPhases.test.ts`) continue to pass without modification, confirming backward compatibility. Validate with lint, build, and full test suite.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add the `classify_adw.md` command file
- Create `.claude/commands/classify_adw.md` with the ADW Workflow Extraction prompt content from the issue #107 attachment.
- The file extracts ADW workflow commands (`/adw_plan`, `/adw_build`, `/adw_test`, `/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_plan_build_test_review`, `/adw_sdlc`) and ADW IDs from issue text.
- Returns JSON: `{"adw_slash_command": "/adw_plan", "adw_id": "abc12345"}` or `{}` if nothing found.
- Uses `$ARGUMENTS` as the placeholder for the issue text to analyze, matching the pattern in `classify_issue.md`.
- The file should include the frontmatter header with `name: classify_adw` and `description: Extract ADW workflow commands and IDs from GitHub issue text`.

### Step 2: Update `SlashCommand` type to include `/classify_adw`
- In `adws/core/dataTypes.ts`, add `'/classify_adw'` to the `SlashCommand` union type under the "ADW workflow commands" section (after `'/classify_issue'`).
- This is a single-line addition. No other changes needed in this file.

### Step 3: Add ADW classification types and helper functions to `issueClassifier.ts`
- In `adws/triggers/issueClassifier.ts`, add:
  - **`AdwClassificationResult` interface**: `{ adw_slash_command?: string; adw_id?: string }` representing the JSON output from `/classify_adw`.
  - **`mapAdwCommandToIssueType(adwCommand: string): IssueClassSlashCommand`** — Pure function mapping ADW commands to issue types:
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
    - Default fallback → `/feature`
  - **`parseAdwClassificationOutput(output: string): AdwClassificationResult | null`** — Safely parses JSON output, returns `null` on parse failure or non-object results.

### Step 4: Add shared two-phase classification helper
- In `adws/triggers/issueClassifier.ts`, add:
  - **`classifyWithTwoPhaseFlow(issueContext: string, issueIdentifier: string): Promise<IssueClassificationResult>`** — Shared helper implementing the two-phase flow:
    1. Call `runClaudeAgentWithCommand('/classify_adw', issueContext, ...)` with haiku model.
    2. Parse the response using `parseAdwClassificationOutput()`.
    3. If the result has `adw_slash_command`, map it via `mapAdwCommandToIssueType()` and return `{ issueType, success: true }`.
    4. If the result is empty or parsing failed, fall back to `runClaudeAgentWithCommand('/classify_issue', issueContext, ...)` with haiku model (existing logic).
    5. Parse the `/classify_issue` result as before (find matching slash command in output).
    6. Return the classification result.
  - The `issueIdentifier` parameter is used for unique log file naming (e.g., issue number or `trigger-classifier-42`).

### Step 5: Update `classifyIssueForTrigger()` and `classifyGitHubIssue()` to use two-phase flow
- Refactor `classifyIssueForTrigger()` to:
  1. Fetch the issue (existing).
  2. Build `issueContext` (existing).
  3. Call `classifyWithTwoPhaseFlow(issueContext, `trigger-${issueNumber}`)`.
  4. Return the result.
- Refactor `classifyGitHubIssue()` to:
  1. Build `issueContext` from the pre-fetched issue (existing).
  2. Call `classifyWithTwoPhaseFlow(issueContext, `${issue.number}`)`.
  3. Return the result.
- The `getWorkflowScript()` function remains unchanged.
- Ensure the file stays under 150 lines by keeping helpers concise and leveraging the shared flow.

### Step 6: Create unit tests for the classifier
- Create `adws/__tests__/issueClassifier.test.ts` with comprehensive tests:
  - **`mapAdwCommandToIssueType()` tests**: Verify each ADW command maps to the correct `IssueClassSlashCommand` (all 12 commands plus default fallback for unknown commands).
  - **`parseAdwClassificationOutput()` tests**: Valid JSON with `adw_slash_command`, valid JSON with both fields, empty object `{}`, malformed JSON, JSON with only `adw_id`, non-object JSON (e.g., array, string).
  - **`classifyIssueForTrigger()` two-phase flow tests**:
    - Returns ADW-based classification when `/classify_adw` returns non-empty result.
    - Falls back to `/classify_issue` when `/classify_adw` returns `{}`.
    - Falls back to `/classify_issue` when `/classify_adw` agent call fails.
    - Returns default `/feature` when both phases fail.
  - **`classifyGitHubIssue()` two-phase flow tests**: Mirror the above tests with pre-fetched issue input.
  - **`getWorkflowScript()` tests**: Verify correct script mapping for each issue type (existing behavior).
  - Use `vitest` with `vi.mock()` for mocking `runClaudeAgentWithCommand` and `fetchGitHubIssue`, following patterns from `adws/__tests__/workflowPhases.test.ts`.

### Step 7: Verify existing tests still pass
- Run `npm test` to confirm all existing tests (especially `workflowPhases.test.ts`) pass without modification.
- The function signatures and return types are unchanged, so mocks in existing tests should continue to work.

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the feature works with zero regressions.

## Testing Strategy
### Unit Tests
- Test `mapAdwCommandToIssueType()` with every valid ADW command and verify the correct `IssueClassSlashCommand` is returned. Test with unknown commands to verify default fallback.
- Test `parseAdwClassificationOutput()` with valid JSON (`{"adw_slash_command": "/adw_plan"}`), both fields present, empty JSON (`{}`), invalid JSON, JSON with only `adw_id`, and non-object JSON values.
- Test `classifyIssueForTrigger()` and `classifyGitHubIssue()` with mocked `runClaudeAgentWithCommand` to verify:
  - Two-phase flow: `/classify_adw` is called first.
  - Fast path: when `/classify_adw` returns a valid ADW command, `/classify_issue` is NOT called.
  - Fallback: `/classify_issue` is called only when `/classify_adw` returns empty or fails.
  - Error recovery: graceful fallback when `/classify_adw` throws or returns an error.
  - Default: returns `/feature` with `success: false` when both phases fail.

### Integration Tests
- The existing `workflowPhases.test.ts` tests serve as integration tests since they mock `classifyGitHubIssue` at the module boundary and verify the full workflow orchestration. These must continue passing unchanged.

### Edge Cases
- `/classify_adw` returns `{}` (empty object) — must fall back to `/classify_issue`.
- `/classify_adw` returns malformed JSON — must fall back to `/classify_issue`.
- `/classify_adw` returns JSON with only `adw_id` but no `adw_slash_command` — must fall back to `/classify_issue` since issue type cannot be determined.
- `/classify_adw` agent call fails entirely (network error, timeout) — must fall back to `/classify_issue`.
- `/classify_adw` returns an unrecognized ADW command — use default mapping to `/feature`.
- Both `/classify_adw` and `/classify_issue` fail — return default `/feature` with `success: false` (existing behavior preserved).
- `/classify_adw` returns JSON wrapped in markdown code fences — parser should handle stripping fences before parsing.

## Acceptance Criteria
- `.claude/commands/classify_adw.md` exists with the correct ADW extraction prompt content matching the issue #107 attachment.
- `/classify_adw` is listed in the `SlashCommand` type in `adws/core/dataTypes.ts`.
- `classifyIssueForTrigger()` calls `/classify_adw` before `/classify_issue`.
- `classifyGitHubIssue()` calls `/classify_adw` before `/classify_issue`.
- When `/classify_adw` returns a valid ADW command, the classifier maps it to the correct `IssueClassSlashCommand` and returns without calling `/classify_issue`.
- When `/classify_adw` returns `{}`, the classifier falls back to `/classify_issue`.
- When `/classify_adw` fails, the classifier gracefully falls back to `/classify_issue`.
- All existing tests pass without modification (backward-compatible return types and function signatures).
- New unit tests in `adws/__tests__/issueClassifier.test.ts` cover the two-phase classification flow, mapping function, parsing, and error handling.
- `issueClassifier.ts` stays under 150 lines per coding guidelines (use shared helper to keep DRY).
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` prompt is designed for keyword extraction, not LLM reasoning — haiku is the ideal model for both classification phases since it's fast and cost-effective.
- The `IssueClassificationResult` interface remains unchanged, ensuring full backward compatibility for all consumers (`workflowPhases.ts`, `trigger_webhook.ts`, `trigger_cron.ts`).
- The `adw_id` field extracted by `/classify_adw` is not currently used by the classifier but is included in the result for potential future use (e.g., resuming workflows by ADW ID).
- Extract shared classification logic (the two-phase flow) into a `classifyWithTwoPhaseFlow()` helper to keep `classifyIssueForTrigger()` and `classifyGitHubIssue()` DRY and the file under the 150-line guideline.
- Use `Record<string, IssueClassSlashCommand>` for the ADW command mapping to keep it type-safe and declarative.
- The `parseAdwClassificationOutput()` helper should handle markdown code fences in the output (e.g., ````json ... ````) since LLMs sometimes wrap JSON responses in code blocks.
