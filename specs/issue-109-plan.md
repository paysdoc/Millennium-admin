# Feature: Two-Phase Issue Classification with ADW Keyword Extraction

## Feature Description
Update the ADW issue classification system to use a two-phase classification approach. The first phase uses a new `/classify_adw` command that performs fast, deterministic keyword extraction to identify ADW-specific workflow commands in issue text. If the first phase returns an empty result (no ADW keywords found), the system falls back to the existing `/classify_issue` LLM-based classification. This improves classification accuracy for ADW-related issues and reduces LLM costs by short-circuiting when ADW keywords are present.

## User Story
As an ADW system operator
I want the issue classifier to first check for ADW-specific keywords before falling back to LLM classification
So that ADW workflow issues are classified faster, more accurately, and at lower cost

## Problem Statement
The current issue classification system uses a single-step LLM-based approach (`/classify_issue` via Claude haiku) for all issues. This means every issue—including those with clear ADW workflow keywords like `/adw_plan_build_test`—must go through LLM inference. ADW workflow issues contain deterministic keywords that can be pattern-matched without LLM involvement, making the current approach unnecessarily slow and costly for these cases.

## Solution Statement
Implement a two-phase classification flow:
1. **Phase 1 (ADW Extraction):** Run the `/classify_adw` command, which extracts ADW slash commands and ADW IDs from issue text using keyword matching. If a valid ADW command is found, map it to the corresponding `IssueClassSlashCommand` (e.g., `/adw_plan_build_test` maps to `/feature`).
2. **Phase 2 (LLM Fallback):** If `/classify_adw` returns an empty object `{}` (no ADW keywords found), fall back to the existing `/classify_issue` LLM-based classification.

This approach is backward-compatible—the `IssueClassificationResult` interface remains unchanged, so all downstream consumers (`workflowPhases.ts`, `trigger_webhook.ts`, `trigger_cron.ts`) continue to work without modification.

## Relevant Files
Use these files to implement the feature:

- **`adws/triggers/issueClassifier.ts`** — The main classification module with `classifyIssueForTrigger()`, `classifyGitHubIssue()`, and `getWorkflowScript()`. Both classifier functions need to be updated with the two-phase flow.
- **`adws/core/dataTypes.ts`** — Defines `SlashCommand` type union. Needs `/classify_adw` added.
- **`adws/agents/claudeAgent.ts`** — Contains `runClaudeAgentWithCommand()` used to invoke slash commands. No changes needed, but important for understanding how `/classify_adw` will be invoked.
- **`adws/core/index.ts`** — Barrel export for core module. No changes needed.
- **`.claude/commands/classify_issue.md`** — Existing classification command. Reference for understanding the command format and frontmatter structure.
- **`adws/workflowPhases.ts`** — Consumer of `classifyGitHubIssue()`. No changes needed (interface unchanged).
- **`adws/triggers/trigger_cron.ts`** — Consumer of `classifyIssueForTrigger()` and `getWorkflowScript()`. No changes needed.
- **`adws/triggers/trigger_webhook.ts`** — Consumer of `classifyIssueForTrigger()`. No changes needed.
- **`adws/__tests__/workflowPhases.test.ts`** — Existing test file. Reference for mocking patterns and test conventions.
- **`guidelines/coding_guidelines.md`** — Coding guidelines to follow (150-line file limit, functional style, TypeScript strict mode, etc.).

### New Files
- **`.claude/commands/classify_adw.md`** — New Claude skill command for ADW workflow keyword extraction. Returns JSON with `adw_slash_command` and optional `adw_id`, or empty `{}` if no ADW keywords found.
- **`adws/triggers/classificationHelpers.ts`** — Helper module containing the `AdwClassificationResult` interface, `adwCommandMap` constant, `mapAdwCommandToIssueType()` function, and `parseAdwClassificationOutput()` function. Extracted to keep `issueClassifier.ts` under the 150-line coding guideline.
- **`adws/__tests__/issueClassifier.test.ts`** — Comprehensive unit tests for the classification system: helpers, two-phase flow, fallback behavior, error handling, and `getWorkflowScript()`.

## Implementation Plan
### Phase 1: Foundation
- Create the `/classify_adw` command file with proper frontmatter header, matching the format of existing commands like `classify_issue.md`.
- Add `/classify_adw` to the `SlashCommand` type union in `dataTypes.ts`.
- Create the `classificationHelpers.ts` module with types and pure helper functions for mapping ADW commands to issue types and parsing ADW classification output.

### Phase 2: Core Implementation
- Refactor `issueClassifier.ts` to implement the two-phase classification flow:
  - Extract a shared `classifyWithTwoPhaseFlow()` helper that both `classifyIssueForTrigger()` and `classifyGitHubIssue()` delegate to (DRY principle).
  - Phase 1: Call `/classify_adw` via `runClaudeAgentWithCommand()` with haiku model. Parse the JSON response. If a valid ADW command is found, map it to `IssueClassSlashCommand` and return immediately.
  - Phase 2: If ADW classification returns empty/fails, fall back to `/classify_issue` (existing behavior).
- Ensure `issueClassifier.ts` stays under 150 lines by leveraging the extracted helpers module.

### Phase 3: Integration
- No downstream changes required — the `IssueClassificationResult` interface is unchanged.
- All existing consumers (`workflowPhases.ts`, `trigger_cron.ts`, `trigger_webhook.ts`) continue to work without modification.
- Write comprehensive unit tests covering all paths: ADW fast path, LLM fallback, error handling, edge cases.

## Step by Step Tasks

### Step 1: Create the `/classify_adw` command file
- Create `.claude/commands/classify_adw.md` with frontmatter (`name: classify_adw`, `description: Extract ADW workflow information from issue text`).
- Include the instruction prompt that identifies ADW slash commands (`/adw_plan`, `/adw_build`, `/adw_test`, `/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_plan_build_test_review`, `/adw_sdlc`) and ADW IDs.
- Specify the JSON response format: `{ "adw_slash_command": "/adw_plan", "adw_id": "abc12345" }` or `{}` if nothing found.
- Use `$ARGUMENTS` placeholder for the text to analyze.

### Step 2: Add `/classify_adw` to the `SlashCommand` type
- In `adws/core/dataTypes.ts`, add `'/classify_adw'` to the `SlashCommand` type union, placing it next to `'/classify_issue'` in the ADW workflow commands section.

### Step 3: Create the classification helpers module
- Create `adws/triggers/classificationHelpers.ts` with the following exports:
  - `AdwClassificationResult` interface: `{ adw_slash_command?: string; adw_id?: string }`.
  - `adwCommandMap` constant: `Record<string, IssueClassSlashCommand>` mapping all 12 ADW commands to their corresponding issue types:
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
  - `mapAdwCommandToIssueType(adwCommand: string): IssueClassSlashCommand | null` — Looks up the ADW command in `adwCommandMap`, returns null if not found.
  - `parseAdwClassificationOutput(output: string): AdwClassificationResult` — Parses the JSON output from `/classify_adw`. Handles: valid JSON, empty `{}`, malformed JSON, JSON embedded in surrounding text. Returns empty object on parse failure.
- Keep this file under 50 lines; these are pure functions with no side effects.

### Step 4: Refactor `issueClassifier.ts` with two-phase classification flow
- Import `mapAdwCommandToIssueType` and `parseAdwClassificationOutput` from `./classificationHelpers`.
- Add a private `classifyWithTwoPhaseFlow()` function that:
  1. Runs `/classify_adw` via `runClaudeAgentWithCommand()` with haiku model.
  2. Parses the result with `parseAdwClassificationOutput()`.
  3. If `adw_slash_command` is present, maps it with `mapAdwCommandToIssueType()`.
  4. If a valid mapping is found, logs success and returns `{ issueType, success: true }`.
  5. Otherwise, falls through to run `/classify_issue` with the existing logic.
  6. On any error in Phase 1, gracefully falls back to Phase 2.
- Update `classifyIssueForTrigger()` to delegate to `classifyWithTwoPhaseFlow()` instead of directly calling `/classify_issue`.
- Update `classifyGitHubIssue()` to delegate to `classifyWithTwoPhaseFlow()` instead of directly calling `/classify_issue`.
- Keep `getWorkflowScript()` unchanged.
- Ensure the file stays under 150 lines by leveraging helpers from `classificationHelpers.ts`.

### Step 5: Create comprehensive unit tests
- Create `adws/__tests__/issueClassifier.test.ts` with the following test groups:
  - **`mapAdwCommandToIssueType` tests:**
    - All 12 ADW commands map correctly to their expected issue types.
    - Unknown commands return null.
    - Empty string returns null.
  - **`parseAdwClassificationOutput` tests:**
    - Valid JSON with `adw_slash_command` and `adw_id` parses correctly.
    - Valid JSON with only `adw_slash_command` parses correctly.
    - Empty object `{}` returns empty result.
    - Malformed/invalid JSON returns empty result.
    - JSON embedded in surrounding text (e.g., ```json ... ```) extracts correctly.
    - Empty string returns empty result.
  - **`classifyIssueForTrigger` tests:**
    - ADW fast path: `/classify_adw` returns a valid ADW command, no fallback to `/classify_issue`.
    - LLM fallback: `/classify_adw` returns empty `{}`, falls back to `/classify_issue`.
    - Error handling: `/classify_adw` fails, gracefully falls back to `/classify_issue`.
    - Default fallback: both phases fail, returns `/feature` as default.
  - **`classifyGitHubIssue` tests:**
    - Same test patterns as `classifyIssueForTrigger` but with pre-fetched issue input.
  - **`getWorkflowScript` tests:**
    - `/feature` and `/chore` map to `adws/adwPlanBuildTest.tsx`.
    - `/bug` and `/pr_review` map to `adws/adwPlanBuild.tsx`.
- Use `vitest` with `vi.mock()` for mocking `../agents/claudeAgent` and `../github/githubApi`.
- Follow the mocking patterns established in `workflowPhases.test.ts`.

### Step 6: Run validation commands
- Run `npm run lint` to verify no linting errors.
- Run `npm run build` to verify the project builds successfully.
- Run `npm test` to verify all tests pass (existing + new) with zero regressions.

## Testing Strategy
### Unit Tests
- Test all pure helper functions in `classificationHelpers.ts` (`mapAdwCommandToIssueType`, `parseAdwClassificationOutput`) with exhaustive input coverage.
- Test the two-phase flow in both `classifyIssueForTrigger()` and `classifyGitHubIssue()` by mocking `runClaudeAgentWithCommand()` to return various outputs.
- Test `getWorkflowScript()` for all issue type inputs.

### Integration Tests
- The existing `workflowPhases.test.ts` tests (43 tests) serve as integration tests that validate the classification result is consumed correctly by the workflow system. These must continue to pass.

### Edge Cases
- `/classify_adw` returns valid JSON but with an unknown ADW command (should fall back to `/classify_issue`).
- `/classify_adw` returns JSON wrapped in markdown code fences (should still parse correctly).
- `/classify_adw` returns a partial JSON response or truncated output.
- `/classify_adw` agent process crashes (should gracefully fall back to Phase 2).
- Empty issue body (both phases should handle gracefully).
- Issue text containing ADW-like keywords but not valid ADW commands.

## Acceptance Criteria
- A new `.claude/commands/classify_adw.md` command file exists with proper frontmatter and ADW extraction instructions.
- `/classify_adw` is added to the `SlashCommand` type union in `adws/core/dataTypes.ts`.
- `adws/triggers/classificationHelpers.ts` exists with `AdwClassificationResult`, `adwCommandMap`, `mapAdwCommandToIssueType()`, and `parseAdwClassificationOutput()`.
- `adws/triggers/issueClassifier.ts` implements the two-phase flow: `/classify_adw` first, then `/classify_issue` fallback.
- `issueClassifier.ts` remains under 150 lines per the coding guidelines.
- `classificationHelpers.ts` remains under 50 lines.
- The `IssueClassificationResult` interface is unchanged (backward compatibility).
- All downstream consumers (`workflowPhases.ts`, `trigger_cron.ts`, `trigger_webhook.ts`) work without modification.
- `adws/__tests__/issueClassifier.test.ts` exists with 25+ tests covering helpers, two-phase flow, fallback, errors, and `getWorkflowScript()`.
- `npm run lint` passes with zero errors.
- `npm run build` succeeds.
- `npm test` passes with zero failures (all existing tests + new tests).

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `/classify_adw` command content is sourced from the GitHub issue #107 attachment at `https://github.com/user-attachments/files/25213520/classify_adw.md`. The exact content should be used with the addition of a frontmatter header (`---\nname: classify_adw\ndescription: Extract ADW workflow information from issue text\n---`).
- The ADW command-to-issue-type mapping should be comprehensive and cover all 12 ADW commands listed in the `classify_adw.md` instructions.
- This feature does NOT affect the UI — no E2E tests are needed.
- No new dependencies are required (`uv add` is not needed).
- The two-phase approach prioritizes speed and cost: Phase 1 (keyword extraction) is fast and deterministic; Phase 2 (LLM classification) is only invoked when needed.
