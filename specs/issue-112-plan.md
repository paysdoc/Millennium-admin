# Feature: Two-Phase Issue Classification with ADW Command Detection

## Feature Description
Updates the issue classification system to use a two-phase approach for determining which workflow to run. The first phase uses a new `/classify_adw` command that performs fast, deterministic keyword extraction to detect ADW-specific workflow commands (e.g., `/adw_plan`, `/adw_build`, `/adw_sdlc`) from issue text. Only when the first phase returns no result does the system fall back to the existing `/classify_issue` LLM-based classification. This improves classification speed, reduces LLM costs for issues that contain explicit ADW commands, and adds support for a richer set of ADW workflow commands.

## User Story
As a developer using the ADW system
I want the issue classifier to first try fast keyword extraction before falling back to LLM-based classification
So that issues with explicit ADW commands are classified faster and more accurately, reducing costs and latency

## Problem Statement
The current issue classification system always uses the `/classify_issue` LLM-based approach (via haiku) for every issue, even when the issue text contains explicit ADW workflow commands like `/adw_plan` or `/adw_build`. This is unnecessarily slow and costly. Additionally, the system only supports four issue type slash commands (`/chore`, `/bug`, `/feature`, `/pr_review`) and does not recognize ADW-specific workflow commands that could directly map to the correct workflow script.

## Solution Statement
Implement a two-phase classification flow:
1. **Phase 1 — ADW keyword extraction** (`/classify_adw`): A new Claude command that searches issue text for ADW-specific commands and IDs using structured keyword matching. Returns a JSON object `{ "command": "/adw_xxx", "adw_id": "..." }` or `{}` if no ADW command is found.
2. **Phase 2 — LLM fallback** (`/classify_issue`): The existing LLM-based classifier, only invoked when Phase 1 returns an empty result.

Add a mapping from ADW commands to issue types and workflow scripts so that detected ADW commands are routed directly to the correct workflow. Extract helper functions into a dedicated module to keep `issueClassifier.ts` under the 150-line coding guideline.

## Relevant Files
Use these files to implement the feature:

- `adws/triggers/issueClassifier.ts` — The main classification module. Must be refactored to implement the two-phase classification flow with a shared helper function. Both `classifyIssueForTrigger()` and `classifyGitHubIssue()` need the two-phase approach.
- `adws/core/dataTypes.ts` — Contains `IssueClassSlashCommand`, `SlashCommand`, `commitPrefixMap`, and `branchPrefixMap`. Needs new `AdwSlashCommand` type union and mapping constants (`adwCommandToIssueTypeMap`, `adwCommandToWorkflowScriptMap`).
- `adws/core/index.ts` — Barrel exports for core module. Must export the new `AdwSlashCommand` type and mapping constants.
- `.claude/commands/classify_issue.md` — Existing classification command for reference. The new `classify_adw.md` follows a similar structure.
- `adws/agents/claudeAgent.ts` — The `runClaudeAgentWithCommand()` function used to invoke classification commands. No changes needed, but important for understanding how commands are invoked.
- `adws/triggers/trigger_webhook.ts` — Consumer of `classifyIssueForTrigger()` and `getWorkflowScript()`. No changes needed (interface preserved).
- `adws/triggers/trigger_cron.ts` — Consumer of `classifyIssueForTrigger()` and `getWorkflowScript()`. No changes needed (interface preserved).
- `adws/workflowPhases.ts` — Consumer of `classifyGitHubIssue()`. No changes needed (interface preserved).
- `guidelines/coding_guidelines.md` — Coding guidelines that must be followed (150-line file limit, functional patterns, TypeScript strict practices).

### New Files
- `.claude/commands/classify_adw.md` — New Claude command for ADW workflow extraction. Searches issue text for ADW slash commands and ADW IDs, returns structured JSON.
- `adws/triggers/classificationHelpers.ts` — New helper module containing `AdwClassificationResult` interface, `parseAdwClassificationOutput()`, `mapAdwCommandToIssueType()`, `mapAdwCommandToWorkflowScript()`, and `isNonEmptyAdwResult()`.
- `adws/__tests__/issueClassifier.test.ts` — Comprehensive unit tests for the classification system covering both phases, all helper functions, and edge cases.

## Implementation Plan
### Phase 1: Foundation
- Add the new `classify_adw.md` command file with frontmatter and ADW workflow extraction instructions
- Extend `dataTypes.ts` with the `AdwSlashCommand` type union covering all 12 ADW commands, plus `adwCommandToIssueTypeMap` and `adwCommandToWorkflowScriptMap` mapping constants
- Update `core/index.ts` barrel exports for the new types and constants
- Add `/classify_adw` to the `SlashCommand` union type

### Phase 2: Core Implementation
- Create `classificationHelpers.ts` with parsing and mapping functions
- Refactor `issueClassifier.ts` to implement the two-phase classification flow:
  - Add a shared `classifyWithTwoPhaseFlow()` helper to DRY up the logic
  - Update `classifyIssueForTrigger()` to use the two-phase flow
  - Update `classifyGitHubIssue()` to use the two-phase flow
  - Update `getWorkflowScript()` to optionally accept an ADW command for direct routing

### Phase 3: Integration
- No downstream consumer changes needed — `IssueClassificationResult` interface shape is preserved
- `trigger_webhook.ts`, `trigger_cron.ts`, and `workflowPhases.ts` continue to work unchanged
- Write comprehensive unit tests covering all new code paths

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create `.claude/commands/classify_adw.md`
- Create the new Claude command file with proper frontmatter (`name: classify_adw`, `description: Extract ADW workflow commands from issue text`)
- The command should instruct the LLM to:
  - Search the input text for ADW slash commands: `/adw_plan`, `/adw_build`, `/adw_test`, `/adw_sdlc`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_pr_review`, `/adw_bug`, `/adw_chore`, `/adw_feature`
  - Search for ADW IDs (pattern: `adw-` followed by alphanumeric characters)
  - Return a JSON object `{ "command": "/adw_xxx", "adw_id": "adw-abc123" }` if found
  - Return `{}` if no ADW command is found in the text
- Use `$ARGUMENTS` placeholder for the input text (consistent with `classify_issue.md`)

### Step 2: Extend types in `adws/core/dataTypes.ts`
- Add `AdwSlashCommand` type union:
  ```typescript
  export type AdwSlashCommand =
    | '/adw_plan'
    | '/adw_build'
    | '/adw_test'
    | '/adw_sdlc'
    | '/adw_plan_build'
    | '/adw_plan_build_test'
    | '/adw_plan_build_review'
    | '/adw_plan_build_document'
    | '/adw_pr_review'
    | '/adw_bug'
    | '/adw_chore'
    | '/adw_feature';
  ```
- Add `adwCommandToIssueTypeMap` constant mapping each ADW command to its corresponding `IssueClassSlashCommand`:
  - `/adw_plan`, `/adw_build`, `/adw_sdlc`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_feature` → `/feature`
  - `/adw_bug` → `/bug`
  - `/adw_chore` → `/chore`
  - `/adw_pr_review` → `/pr_review`
  - `/adw_test` → `/feature` (test-inclusive workflow)
- Add `adwCommandToWorkflowScriptMap` constant mapping each ADW command to its workflow script path:
  - Commands that need testing (`/adw_plan_build_test`, `/adw_sdlc`, `/adw_feature`, `/adw_chore`) → `adws/adwPlanBuildTest.tsx`
  - Commands without testing (`/adw_plan_build`, `/adw_plan`, `/adw_build`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_bug`) → `adws/adwPlanBuild.tsx`
  - PR review (`/adw_pr_review`) → `adws/adwPrReview.tsx`
  - Test-only (`/adw_test`) → `adws/adwTest.tsx`
- Add `/classify_adw` to the `SlashCommand` type union

### Step 3: Update `adws/core/index.ts` exports
- Export the new `AdwSlashCommand` type
- Export the new `adwCommandToIssueTypeMap` and `adwCommandToWorkflowScriptMap` constants

### Step 4: Create `adws/triggers/classificationHelpers.ts`
- Define `AdwClassificationResult` interface:
  ```typescript
  export interface AdwClassificationResult {
    command: AdwSlashCommand | null;
    adwId: string | null;
  }
  ```
- Implement `parseAdwClassificationOutput(output: string): AdwClassificationResult` — parses the JSON output from `/classify_adw`, handles malformed JSON, extracts command and adwId fields
- Implement `mapAdwCommandToIssueType(command: AdwSlashCommand): IssueClassSlashCommand` — looks up the command in `adwCommandToIssueTypeMap`, defaults to `/feature`
- Implement `mapAdwCommandToWorkflowScript(command: AdwSlashCommand): string` — looks up the command in `adwCommandToWorkflowScriptMap`, defaults to `adws/adwPlanBuildTest.tsx`
- Implement `isNonEmptyAdwResult(result: AdwClassificationResult): boolean` — returns true if a valid command was extracted
- Keep this file under 60 lines following modular design guidelines

### Step 5: Refactor `adws/triggers/issueClassifier.ts`
- Import new helpers from `classificationHelpers.ts` and new types/maps from core
- Add a private `classifyWithTwoPhaseFlow()` function that:
  1. Runs `/classify_adw` via `runClaudeAgentWithCommand()` with haiku model
  2. Parses the result with `parseAdwClassificationOutput()`
  3. If a valid ADW command is found (`isNonEmptyAdwResult()`), maps it to an issue type and returns
  4. If Phase 1 fails or returns empty, falls back to `/classify_issue` via `runClaudeAgentWithCommand()`
  5. Parses the fallback result to find a valid `IssueClassSlashCommand`
  6. Returns the classification result
- Update `classifyIssueForTrigger()` to use `classifyWithTwoPhaseFlow()`
- Update `classifyGitHubIssue()` to use `classifyWithTwoPhaseFlow()`
- Update `getWorkflowScript()` to accept an optional `adwCommand` parameter. When an ADW command is provided, use `mapAdwCommandToWorkflowScript()` for direct routing instead of the switch statement
- Ensure the file stays under 150 lines by leveraging the extracted helpers
- Preserve the `IssueClassificationResult` interface shape for backward compatibility with all consumers

### Step 6: Create `adws/__tests__/issueClassifier.test.ts`
- Write unit tests for `classificationHelpers.ts`:
  - `parseAdwClassificationOutput()`: valid JSON with command, empty JSON `{}`, malformed JSON, JSON embedded in surrounding text, missing fields
  - `mapAdwCommandToIssueType()`: all 12 ADW commands mapped correctly, default fallback
  - `mapAdwCommandToWorkflowScript()`: all 12 ADW commands mapped to correct scripts
  - `isNonEmptyAdwResult()`: true for valid command, false for null command
- Write unit tests for `issueClassifier.ts`:
  - `classifyIssueForTrigger()`: ADW fast path success, LLM fallback when ADW returns empty, error handling with default fallback
  - `classifyGitHubIssue()`: same three cases as above
  - `getWorkflowScript()`: all 4 issue types, with and without ADW command override
- Mock `runClaudeAgentWithCommand`, `fetchGitHubIssue`, and `log` using vitest
- Target 30+ test cases covering edge cases and error scenarios

### Step 7: Run Validation Commands
- Run all validation commands to ensure the feature works correctly with zero regressions.

## Testing Strategy
### Unit Tests
- Test all helper functions in `classificationHelpers.ts` independently (pure functions)
- Test both classifier functions (`classifyIssueForTrigger`, `classifyGitHubIssue`) with mocked agent calls
- Test `getWorkflowScript()` with all issue types and with optional ADW command override
- Test the two-phase flow: fast path (ADW detected), fallback path (ADW empty), error recovery

### Integration Tests
- The existing `workflowPhases.test.ts` tests serve as integration tests — they must continue passing with zero changes since the `IssueClassificationResult` interface is preserved
- The existing `triggerCommentHandling.test.ts` tests validate trigger integration remains stable

### Edge Cases
- `/classify_adw` returns malformed JSON (not valid JSON at all)
- `/classify_adw` returns valid JSON but with an unrecognized command
- `/classify_adw` agent call fails entirely (network error, timeout)
- `/classify_adw` returns `{}` (empty object — trigger fallback)
- `/classify_issue` also fails (double fallback to `/feature`)
- Issue text contains multiple ADW commands (first one should be used)
- Issue text contains ADW ID but no command
- Both phases fail — system defaults to `/feature` safely

## Acceptance Criteria
- A new `.claude/commands/classify_adw.md` command file exists with proper frontmatter and ADW workflow extraction instructions
- `AdwSlashCommand` type and mapping constants are defined in `dataTypes.ts` and exported from `core/index.ts`
- `classificationHelpers.ts` contains pure, tested helper functions for parsing and mapping
- Both `classifyIssueForTrigger()` and `classifyGitHubIssue()` use the two-phase flow
- `getWorkflowScript()` supports optional ADW command for direct routing
- `issueClassifier.ts` is under 150 lines
- `classificationHelpers.ts` is under 60 lines
- All new code has 100% test coverage with 30+ test cases
- All existing tests pass with zero regressions (no changes to consumer code)
- `npm run lint` passes with zero warnings or errors
- `npm run build` compiles successfully
- `npm test` runs all tests with zero failures

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `IssueClassificationResult` interface shape must be preserved for backward compatibility. Consumers (`trigger_webhook.ts`, `trigger_cron.ts`, `workflowPhases.ts`) should require zero changes.
- The `classify_adw.md` command is designed to be fast and deterministic — it relies on keyword extraction rather than semantic understanding, making haiku model ideal.
- The file size guideline (150 lines max) is critical for `issueClassifier.ts`. The extraction of helpers into `classificationHelpers.ts` is specifically designed to keep both files well under the limit.
- The ADW command list (12 commands) is derived from the attachment in issue #107. If new ADW commands are added in the future, only `dataTypes.ts` and `classify_adw.md` need updating.
- The two-phase approach is a cost optimization: Phase 1 is a fast keyword scan, Phase 2 (LLM) is only invoked when needed. Both phases use the haiku model for cost-effectiveness.
