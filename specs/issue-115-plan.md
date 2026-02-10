# Feature: Two-Tier Issue Classification with Keyword-Based Fast Path

## Feature Description
Update the ADW issue classification system to use a two-tier strategy: first attempt a fast, deterministic keyword-based classification using a new `/classify_adw` command, then fall back to the existing AI-based `/classify_issue` command only when keyword extraction yields no result. This eliminates unnecessary AI calls for issues that already contain ADW workflow metadata (commands, IDs) embedded in their text, reducing latency and cost.

## User Story
As an ADW workflow operator
I want the issue classifier to first try fast keyword extraction before falling back to AI classification
So that issues with embedded ADW metadata are classified instantly without an AI round-trip, saving time and cost

## Problem Statement
The current issue classification system always invokes the `/classify_issue` command via the haiku model, even when the issue body already contains explicit ADW workflow commands (e.g., `/feature`, `/bug`) or ADW session IDs. This results in unnecessary AI API calls, added latency, and wasted cost for issues that could be classified deterministically via simple pattern matching.

## Solution Statement
Introduce a two-tier classification approach:
1. **Tier 1 (Keyword-based):** A new `/classify_adw` command that extracts ADW slash commands and ADW IDs from issue text using deterministic pattern matching. Returns a JSON object with the extracted command and ID.
2. **Tier 2 (AI-based fallback):** If Tier 1 returns no result (empty/no match), fall back to the existing `/classify_issue` AI-based classification.

Additionally, refactor the classification parsing logic into a shared helper module to reduce duplication, and update the trigger scripts to leverage the enriched classification results (including ADW command and session ID).

## Relevant Files
Use these files to implement the feature:

- `adws/triggers/issueClassifier.ts` — The main classification module. Needs refactoring to implement the two-tier strategy: try `/classify_adw` first, fall back to `/classify_issue`. Both `classifyIssueForTrigger` and `classifyGitHubIssue` need updating.
- `adws/core/dataTypes.ts` — Type definitions. Needs `/classify_adw` added to `SlashCommand` type, a new `AdwSlashCommand` type, and new mapping constants (`adwCommandToIssueTypeMap`, `adwCommandToWorkflowScriptMap`).
- `adws/core/index.ts` — Core barrel exports. Needs to export the new types and mapping constants.
- `.claude/commands/classify_issue.md` — Existing AI-based classifier command. Referenced as the Tier 2 fallback. No changes needed.
- `adws/triggers/trigger_webhook.ts` — Webhook trigger. Needs updating to use enriched classification result (optional `adwCommand` and `adwId` fields).
- `adws/triggers/trigger_cron.ts` — CRON trigger. Same updates as webhook trigger.
- `adws/agents/claudeAgent.ts` — Claude agent runner. Used by the classifier. No changes needed.
- `guidelines/coding_guidelines.md` — Coding standards to follow. No changes needed.

### New Files
- `.claude/commands/classify_adw.md` — New keyword-based classifier command that extracts ADW workflow commands and IDs from issue text via deterministic pattern matching. Returns JSON.
- `adws/triggers/classificationHelpers.ts` — New helper module with shared parsing functions: `parseAdwClassificationOutput`, `mapAdwCommandToIssueType`, `mapAdwCommandToWorkflowScript`, `isNonEmptyAdwResult`.
- `adws/__tests__/issueClassifier.test.ts` — New test file with comprehensive unit tests for the classification helpers, two-tier flow, and workflow script routing.

## Implementation Plan
### Phase 1: Foundation
- Define new types and constants in `dataTypes.ts`: `AdwSlashCommand` type (the set of ADW-specific commands like `plan`, `build`, `test`), plus mapping objects that convert ADW commands to `IssueClassSlashCommand` values and workflow script paths.
- Create the `.claude/commands/classify_adw.md` command file with keyword extraction logic that scans issue text for ADW slash commands (`/feature`, `/bug`, `/chore`, `/pr_review`) and 8-character alphanumeric ADW IDs, returning a JSON result.
- Export new types and constants from `adws/core/index.ts`.

### Phase 2: Core Implementation
- Create `adws/triggers/classificationHelpers.ts` with pure helper functions for parsing `/classify_adw` output, mapping ADW commands to issue types and workflow scripts, and validating non-empty results.
- Refactor `adws/triggers/issueClassifier.ts` to implement the two-tier classification flow. Extract a shared `classifyWithTwoPhaseFlow` function that both `classifyIssueForTrigger` and `classifyGitHubIssue` call. Add `adwCommand` and `adwId` fields to `IssueClassificationResult`.

### Phase 3: Integration
- Update `adws/triggers/trigger_webhook.ts` to use the enriched classification result, using `adwCommand` for more direct workflow routing and `adwId` for session resumption context.
- Update `adws/triggers/trigger_cron.ts` with the same changes.
- Write comprehensive unit tests covering all helpers, the two-tier flow, edge cases, and workflow script routing.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add new types and constants to `adws/core/dataTypes.ts`
- Add `/classify_adw` to the `SlashCommand` type union.
- Define a new `AdwSlashCommand` type representing ADW-specific command keywords (e.g., `'plan'`, `'build'`, `'test'`, `'plan_build'`, `'plan_build_test'`).
- Create `adwCommandToIssueTypeMap: Record<string, IssueClassSlashCommand>` that maps ADW command keywords to issue types.
- Create `adwCommandToWorkflowScriptMap: Record<string, string>` that maps ADW command keywords directly to workflow script paths.

### Step 2: Update exports in `adws/core/index.ts`
- Export the new `AdwSlashCommand` type from `./dataTypes`.
- Export the new `adwCommandToIssueTypeMap` and `adwCommandToWorkflowScriptMap` constants from `./dataTypes`.

### Step 3: Create `.claude/commands/classify_adw.md`
- Create the keyword-based classifier command file.
- The command should instruct the agent to extract ADW workflow information from issue text using deterministic pattern matching:
  - Look for ADW slash commands (`/feature`, `/bug`, `/chore`, `/pr_review`) in the issue text.
  - Look for ADW session IDs matching the pattern `adw-<timestamp>-<6char>` (e.g., `adw-1770738729477-z9dpu6`).
  - Return a JSON object: `{ "command": "/feature", "adwId": "adw-..." }` or `{}` if no ADW patterns found.
- The command takes `$ARGUMENTS` as the issue text to analyze.
- Keep the command simple and focused on pattern extraction, not AI reasoning.

### Step 4: Create `adws/triggers/classificationHelpers.ts`
- Create a new module with pure helper functions:
  - `parseAdwClassificationOutput(output: string): { command?: IssueClassSlashCommand; adwId?: string }` — Parses JSON output from the `/classify_adw` command, extracting the command and ADW ID.
  - `mapAdwCommandToIssueType(command: string): IssueClassSlashCommand | null` — Maps a raw ADW command string to a valid `IssueClassSlashCommand`, returning null for invalid commands.
  - `mapAdwCommandToWorkflowScript(command: string): string | null` — Maps a raw ADW command string to a workflow script path.
  - `isNonEmptyAdwResult(result: { command?: string; adwId?: string }): boolean` — Validates that the ADW extraction returned at least a command.
  - `parseClassificationOutput(output: string): IssueClassSlashCommand | null` — Shared parsing function for AI-based classification output (extracts slash command from text). Extracted from the duplicated logic in `issueClassifier.ts`.

### Step 5: Refactor `adws/triggers/issueClassifier.ts` for two-tier classification
- Add `adwCommand` and `adwId` optional fields to the `IssueClassificationResult` interface.
- Import helpers from `classificationHelpers.ts`.
- Create a private `classifyWithTwoPhaseFlow` function that:
  1. Runs `/classify_adw` with haiku model against the issue context.
  2. Parses the result with `parseAdwClassificationOutput`.
  3. If a valid command is extracted (`isNonEmptyAdwResult`), maps it to an `IssueClassSlashCommand` and returns immediately.
  4. If no result, falls back to running `/classify_issue` with haiku model.
  5. Parses the AI result with `parseClassificationOutput`.
  6. Returns the final classification with success status.
- Refactor `classifyIssueForTrigger` to use `classifyWithTwoPhaseFlow`.
- Refactor `classifyGitHubIssue` to use `classifyWithTwoPhaseFlow`.
- Keep `getWorkflowScript` unchanged (it already works with `IssueClassSlashCommand`).

### Step 6: Update `adws/triggers/trigger_webhook.ts`
- Update the issue event handler to use the enriched `classification` result.
- When `classification.adwCommand` is available, log the ADW command for debugging.
- Pass `classification.adwId` (if present) as context for potential session resumption.
- Use `getWorkflowScript(classification.issueType)` for routing (unchanged behavior, but now with the benefit of fast classification).

### Step 7: Update `adws/triggers/trigger_cron.ts`
- Apply the same changes as the webhook trigger.
- When `classification.adwCommand` is available, log the ADW command.
- Pass `classification.adwId` (if present) as context.

### Step 8: Create unit tests in `adws/__tests__/issueClassifier.test.ts`
- Test `parseAdwClassificationOutput`:
  - Valid JSON with command and adwId.
  - Valid JSON with command only.
  - Valid JSON with adwId only.
  - Empty JSON object `{}`.
  - Invalid JSON string.
  - Empty string input.
- Test `mapAdwCommandToIssueType`:
  - All valid commands (`/feature`, `/bug`, `/chore`, `/pr_review`).
  - Invalid command string.
  - Command with extra whitespace.
- Test `mapAdwCommandToWorkflowScript`:
  - All valid commands map to expected scripts.
  - Invalid command returns null.
- Test `isNonEmptyAdwResult`:
  - Result with command returns true.
  - Result with only adwId returns false.
  - Empty object returns false.
- Test `parseClassificationOutput`:
  - Output containing `/feature` returns `/feature`.
  - Output containing `/bug` returns `/bug`.
  - Output containing `/chore` returns `/chore`.
  - Output containing `/pr_review` returns `/pr_review`.
  - Output with no valid command returns null.
  - Output with multiple commands returns the first match.
- Test `getWorkflowScript`:
  - `/feature` and `/chore` map to `adws/adwPlanBuildTest.tsx`.
  - `/bug` and `/pr_review` map to `adws/adwPlanBuild.tsx`.
- Test the two-tier flow (mock `runClaudeAgentWithCommand`):
  - When `/classify_adw` returns a valid command, the second call to `/classify_issue` is never made.
  - When `/classify_adw` returns empty, `/classify_issue` is called as fallback.
  - When both fail, defaults to `/feature`.
  - When `/classify_adw` throws an error, falls back to `/classify_issue`.

### Step 9: Run Validation Commands
- Execute all validation commands to verify correctness with zero regressions.

## Testing Strategy
### Unit Tests
- Test all pure helper functions in `classificationHelpers.ts` with various inputs and edge cases.
- Test the two-tier classification flow by mocking `runClaudeAgentWithCommand` and verifying call order and fallback behavior.
- Test `getWorkflowScript` mapping for all issue types.
- Test `IssueClassificationResult` enriched fields (`adwCommand`, `adwId`).

### Integration Tests
- The existing test suite (`npm test`) covers the broader ADW system. After changes, all existing tests must pass.
- The new tests in `issueClassifier.test.ts` serve as integration tests for the classification subsystem.

### Edge Cases
- Issue text with no ADW metadata (pure human-written issue) — should fall through to AI classification.
- Issue text with malformed JSON from `/classify_adw` — should gracefully fall back.
- Issue text with an ADW ID but no command — should fall back to AI.
- Issue text with multiple ADW commands — should use the first valid one.
- `/classify_adw` agent failure (non-zero exit) — should fall back gracefully.
- Both classification tiers fail — should default to `/feature`.
- Issue text with partial ADW patterns (e.g., just "adw" without full ID) — should not match.

## Acceptance Criteria
- A new `.claude/commands/classify_adw.md` file exists and correctly describes keyword-based extraction logic.
- A new `adws/triggers/classificationHelpers.ts` module exists with all pure helper functions.
- `adws/core/dataTypes.ts` includes `/classify_adw` in `SlashCommand` and exports new mapping types/constants.
- `adws/core/index.ts` exports the new types and constants.
- `adws/triggers/issueClassifier.ts` implements the two-tier classification strategy.
- `IssueClassificationResult` interface includes optional `adwCommand` and `adwId` fields.
- `adws/triggers/trigger_webhook.ts` and `trigger_cron.ts` leverage the enriched classification result.
- `adws/__tests__/issueClassifier.test.ts` provides comprehensive test coverage (parsing, mapping, flow, edge cases).
- All existing tests pass with zero regressions.
- `npm run lint` passes with no errors.
- `npm run build` compiles successfully.
- `npm test` passes all tests.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `haiku` model is used for both tiers because classification is a simple, low-cost task.
- The `/classify_adw` command is designed to be deterministic — it uses pattern matching, not AI reasoning — making it extremely fast and reliable for issues that contain ADW metadata.
- The existing `/classify_issue` command and its behavior remain completely unchanged; it simply becomes the fallback in the two-tier flow.
- The `classificationHelpers.ts` module follows the project's modular design pattern, keeping pure functions separate from side-effecting code.
- The enriched `IssueClassificationResult` with `adwCommand` and `adwId` fields enables future enhancements like automatic session resumption.
- This feature traces back to the original requirement in GitHub issue #107, through the chain of issues #108, #109, #111, #113, and #115.
