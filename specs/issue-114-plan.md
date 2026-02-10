# Feature: Two-Phase Issue Classification with ADW Keyword Extraction

## Feature Description
Update the issue classification system to use a two-phase approach: first attempt fast, deterministic keyword extraction via a new `/classify_adw` command that identifies ADW-specific commands and IDs from issue text, then fall back to the existing `/classify_issue` LLM-based classification only when the ADW extraction returns an empty result. This improves classification speed, reduces LLM costs, and enables direct ADW workflow routing when ADW-specific keywords are present in issues.

## User Story
As an ADW system operator
I want the issue classifier to first try keyword-based extraction of ADW commands before falling back to LLM classification
So that issues containing ADW workflow keywords are classified faster, more deterministically, and at lower cost

## Problem Statement
The current issue classification system relies exclusively on an LLM-based classifier (`/classify_issue`) for every issue. This is slower and more expensive than necessary for issues that contain explicit ADW workflow commands (e.g., `/adw_plan`, `/adw_build`). When an issue already specifies which ADW workflow to run, there's no need for LLM inference — a simple keyword extraction suffices.

## Solution Statement
Implement a two-phase classification flow:
1. **Phase 1 (Fast Path):** Run `/classify_adw` command which extracts ADW workflow commands and IDs from issue text using deterministic keyword matching. Returns a JSON object with the extracted command and ADW ID, or an empty object `{}` if none found.
2. **Phase 2 (Fallback):** If Phase 1 returns an empty result (no ADW keywords detected), fall back to the existing `/classify_issue` LLM-based classification.

This approach preserves backward compatibility — the `IssueClassificationResult` interface is unchanged for consumers — while adding a fast path for ADW-tagged issues.

## Relevant Files
Use these files to implement the feature:

- `adws/triggers/issueClassifier.ts` — Core classifier module. Both `classifyIssueForTrigger()` and `classifyGitHubIssue()` need the two-phase flow. `getWorkflowScript()` needs an optional ADW command parameter for direct workflow routing.
- `adws/core/dataTypes.ts` — Type definitions. Needs new `AdwSlashCommand` type, ADW command-to-issue-type mapping constant, and ADW command-to-workflow-script mapping constant. Also needs `/classify_adw` added to `SlashCommand` union.
- `adws/core/index.ts` — Barrel exports. Needs to export new types and constants from `dataTypes.ts`.
- `.claude/commands/classify_issue.md` — Existing classification command (reference, no changes needed).
- `adws/agents/claudeAgent.ts` — Agent runner (reference for `runClaudeAgentWithCommand` signature, no changes needed).
- `adws/triggers/trigger_webhook.ts` — Webhook trigger that calls `classifyIssueForTrigger()` and `getWorkflowScript()`. May need to pass ADW command for direct workflow routing.
- `adws/triggers/trigger_cron.ts` — CRON trigger that calls `classifyIssueForTrigger()` and `getWorkflowScript()`. May need to pass ADW command for direct workflow routing.
- `adws/workflowPhases.ts` — Orchestrator phases that call `classifyGitHubIssue()` (reference for understanding consumers).
- `adws/__tests__/workflowPhases.test.ts` — Reference for existing test patterns and mocking conventions.
- `guidelines/coding_guidelines.md` — Coding standards (150-line file limit, functional style, TypeScript strictness).

### New Files
- `.claude/commands/classify_adw.md` — New Claude command for ADW workflow keyword extraction. Extracts `/adw_*` commands and ADW IDs from issue text and returns structured JSON.
- `adws/triggers/classificationHelpers.ts` — Pure helper module containing ADW classification types, parsing functions, and mapping functions. Extracted to keep `issueClassifier.ts` under the 150-line coding guideline.
- `adws/__tests__/issueClassifier.test.ts` — Comprehensive unit tests for the two-phase classification flow, helper functions, and workflow script routing.

## Implementation Plan
### Phase 1: Foundation
Add the new `/classify_adw` command file and update the type system with ADW-specific types and mapping constants. Create the helper module with pure functions for parsing and mapping ADW classification output. This establishes the foundation without modifying any existing behavior.

### Phase 2: Core Implementation
Refactor `issueClassifier.ts` to implement the two-phase classification flow. Extract a shared `classifyWithTwoPhaseFlow()` helper to keep both `classifyIssueForTrigger()` and `classifyGitHubIssue()` DRY. Update `getWorkflowScript()` to accept an optional ADW command for direct workflow routing. Ensure the `IssueClassificationResult` interface gains optional `adwCommand` and `adwId` fields for passthrough.

### Phase 3: Integration
Update trigger consumers (`trigger_webhook.ts`, `trigger_cron.ts`) to pass ADW command information through to `getWorkflowScript()` when available. Create comprehensive unit tests covering all classification paths, helper functions, and edge cases.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create the `/classify_adw` command file
- Create `.claude/commands/classify_adw.md` with proper frontmatter (`name: classify_adw`, `description: Extract ADW workflow commands and IDs from issue text`)
- The command should instruct the model to:
  - Search for ADW-specific slash commands in the provided text
  - Valid ADW commands: `/adw_plan`, `/adw_build`, `/adw_test`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_pr_review`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_build_test`, `/adw_health_check`, `/adw_build_document`, `/adw_plan_build_test_document`
  - Search for ADW IDs matching the pattern `adw-{timestamp}-{random}` (e.g., `adw-1770735002576-8zp007`)
  - Return a JSON object with `command` (the ADW slash command found) and `adwId` (the ADW ID found), or an empty object `{}` if neither is found
  - If multiple commands are found, return the first one
- The `$ARGUMENTS` placeholder receives the issue text to analyze

### Step 2: Update type system in `dataTypes.ts`
- Add `AdwSlashCommand` type as a union of all 12 valid ADW command strings
- Add `/classify_adw` to the existing `SlashCommand` union type
- Add `adwCommandToIssueTypeMap` constant: a `Record<AdwSlashCommand, IssueClassSlashCommand>` mapping each ADW command to its corresponding issue type:
  - `/adw_plan` -> `/feature`
  - `/adw_build` -> `/feature`
  - `/adw_test` -> `/chore`
  - `/adw_plan_build` -> `/feature`
  - `/adw_plan_build_test` -> `/feature`
  - `/adw_pr_review` -> `/pr_review`
  - `/adw_plan_build_review` -> `/pr_review`
  - `/adw_plan_build_document` -> `/chore`
  - `/adw_build_test` -> `/feature`
  - `/adw_health_check` -> `/chore`
  - `/adw_build_document` -> `/chore`
  - `/adw_plan_build_test_document` -> `/feature`
- Add `adwCommandToWorkflowScriptMap` constant: a `Record<AdwSlashCommand, string>` mapping each ADW command to its workflow script path:
  - Plan-only: `adws/adwPlan.tsx`
  - Build-only: `adws/adwBuild.tsx`
  - Test-only: `adws/adwTest.tsx`
  - PlanBuild: `adws/adwPlanBuild.tsx`
  - PlanBuildTest: `adws/adwPlanBuildTest.tsx`
  - PrReview: `adws/adwPrReview.tsx`
  - etc.

### Step 3: Update barrel exports in `core/index.ts`
- Export the new `AdwSlashCommand` type from `dataTypes.ts`
- Export the new `adwCommandToIssueTypeMap` constant from `dataTypes.ts`
- Export the new `adwCommandToWorkflowScriptMap` constant from `dataTypes.ts`

### Step 4: Create `classificationHelpers.ts` helper module
- Create `adws/triggers/classificationHelpers.ts` (keep under 150 lines)
- Define `AdwClassificationResult` interface with optional `command` (string) and `adwId` (string) fields
- Implement `parseAdwClassificationOutput(output: string): AdwClassificationResult` — parses JSON from the `/classify_adw` agent output, handles malformed JSON gracefully, extracts JSON from surrounding text if needed
- Implement `mapAdwCommandToIssueType(command: string): IssueClassSlashCommand` — maps an ADW command string to its issue type using `adwCommandToIssueTypeMap`, defaults to `/feature` for unknown commands
- Implement `mapAdwCommandToWorkflowScript(command: string): string | null` — maps an ADW command string to its workflow script using `adwCommandToWorkflowScriptMap`, returns null for unknown commands
- Implement `isNonEmptyAdwResult(result: AdwClassificationResult): boolean` — returns true if the result has a non-empty command field
- Import types and constants from `../core`

### Step 5: Refactor `issueClassifier.ts` with two-phase flow
- Add optional `adwCommand` and `adwId` fields to `IssueClassificationResult` interface
- Implement `classifyWithTwoPhaseFlow(issueContext: string, issueIdentifier: string): Promise<IssueClassificationResult>` shared helper:
  1. Run `/classify_adw` via `runClaudeAgentWithCommand` with `haiku` model
  2. Parse the output with `parseAdwClassificationOutput()`
  3. If result is non-empty (has a command), map it to an issue type and return success
  4. If result is empty or parse fails, fall back to running `/classify_issue` via `runClaudeAgentWithCommand` with `haiku` model
  5. Parse the `/classify_issue` output for valid issue type commands
  6. Return the classification result with success/failure status
- Refactor `classifyIssueForTrigger()` to use `classifyWithTwoPhaseFlow()`
- Refactor `classifyGitHubIssue()` to use `classifyWithTwoPhaseFlow()`
- Update `getWorkflowScript()` to accept an optional `adwCommand` parameter:
  - If `adwCommand` is provided, look it up in `adwCommandToWorkflowScriptMap` first
  - Fall back to the existing switch statement on `issueType`
- Keep the file under 150 lines by leveraging the extracted helper module

### Step 6: Update trigger consumers
- In `trigger_webhook.ts`: After classifying, pass `classification.adwCommand` to `getWorkflowScript()` if available
- In `trigger_cron.ts`: After classifying, pass `classification.adwCommand` to `getWorkflowScript()` if available

### Step 7: Create comprehensive unit tests
- Create `adws/__tests__/issueClassifier.test.ts`
- Follow existing test patterns from `workflowPhases.test.ts` (vitest, vi.mock, vi.fn)
- Mock dependencies: `../agents/claudeAgent`, `../github/githubApi`, `../core`
- Test `mapAdwCommandToIssueType()`:
  - All 12 ADW commands map correctly
  - Unknown command defaults to `/feature`
- Test `parseAdwClassificationOutput()`:
  - Valid JSON with command and adwId
  - Empty JSON object `{}`
  - Malformed JSON returns empty result
  - JSON embedded in surrounding text
  - Missing fields
- Test `isNonEmptyAdwResult()`:
  - Non-empty command returns true
  - Empty command returns false
  - Missing command returns false
- Test `classifyIssueForTrigger()`:
  - ADW fast path: `/classify_adw` returns a valid command, skips `/classify_issue`
  - Fallback path: `/classify_adw` returns empty, falls back to `/classify_issue`
  - Error handling: both phases fail, defaults to `/feature`
- Test `classifyGitHubIssue()`:
  - Same three paths as above with pre-fetched issue
- Test `getWorkflowScript()`:
  - All 4 issue types map to correct scripts
  - ADW command parameter routes to correct workflow script
  - Default fallback for unknown types
- Target: 30+ tests covering all paths

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to build the application and verify no build errors
- Run `npm test` to run all tests and validate zero regressions

## Testing Strategy
### Unit Tests
- Test all pure helper functions in `classificationHelpers.ts` (mapping, parsing, validation)
- Test the two-phase classification flow in `issueClassifier.ts` with mocked agent calls
- Test `getWorkflowScript()` with and without ADW command parameter
- Test error handling and fallback behavior at every failure point

### Integration Tests
- The existing `workflowPhases.test.ts` tests cover `classifyGitHubIssue()` usage indirectly — ensure these all still pass
- The trigger files are tested via the overall workflow (no separate integration tests needed)

### Edge Cases
- `/classify_adw` agent returns malformed JSON
- `/classify_adw` agent returns valid JSON but with empty fields
- `/classify_adw` agent fails (process error) — should fall back gracefully
- `/classify_issue` agent also fails — should default to `/feature`
- Issue text contains multiple ADW commands — should use the first one
- Issue text contains ADW ID but no command — should fall back to `/classify_issue`
- Unknown ADW command in the mapping — should default to `/feature`
- Both agents succeed but output doesn't contain expected patterns

## Acceptance Criteria
- The `/classify_adw` command file exists at `.claude/commands/classify_adw.md` with proper frontmatter and instructions
- `AdwSlashCommand` type and mapping constants are defined in `dataTypes.ts` and exported from `core/index.ts`
- `classificationHelpers.ts` contains pure helper functions under 150 lines
- `issueClassifier.ts` implements two-phase classification flow under 150 lines
- Both `classifyIssueForTrigger()` and `classifyGitHubIssue()` try `/classify_adw` first, fall back to `/classify_issue`
- `getWorkflowScript()` supports optional ADW command for direct workflow routing
- `IssueClassificationResult` includes optional `adwCommand` and `adwId` fields
- Trigger consumers (`trigger_webhook.ts`, `trigger_cron.ts`) pass ADW command through when available
- All existing tests pass with zero regressions
- 30+ new unit tests in `issueClassifier.test.ts` covering all classification paths
- `npm run lint`, `npm run build`, and `npm test` all pass cleanly
- All files comply with the 150-line coding guideline

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` attachment from issue #107 defines the ADW Workflow Extraction prompt. The command identifies ADW-specific slash commands (`/adw_plan`, `/adw_build`, etc.) and ADW IDs from issue text, returning a JSON response.
- The `IssueClassificationResult` interface changes are backward-compatible — the new `adwCommand` and `adwId` fields are optional, so existing consumers (e.g., `workflowPhases.ts`) continue working without modification.
- Keep `issueClassifier.ts` under 150 lines by extracting pure helper functions to `classificationHelpers.ts`. The coding guidelines mandate files stay under 150 lines.
- Use `haiku` model for both `/classify_adw` and `/classify_issue` agent calls — fast and cost-effective for classification tasks.
- The two-phase approach is purely additive — if `/classify_adw` is unavailable or fails, the system gracefully falls back to the proven `/classify_issue` path.
- Previous implementation attempts on branches for issues #107, #108, and #109 were not merged to main. This plan implements the feature fresh from the current main branch state.
