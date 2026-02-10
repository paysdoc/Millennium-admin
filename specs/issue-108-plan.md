# Feature: Update Issue Classification with ADW-Aware Two-Step Classification

## Feature Description
Enhance the issue classification system by adding a new `/classify_adw` command that first checks if an issue contains ADW-specific workflow commands (e.g., `/adw_plan_build`, `/adw_sdlc`). If an ADW command is found, the classification is deterministic and fast. Only when no ADW command is detected (empty `{}` response) does the system fall back to the existing `/classify_issue` LLM-based classification. This two-step approach improves classification accuracy for ADW-triggered issues and reduces unnecessary LLM calls.

## User Story
As an ADW workflow operator
I want issue classification to first detect ADW-specific commands in issue text
So that ADW-triggered issues are classified deterministically without relying on LLM interpretation, with the existing classification as a fallback

## Problem Statement
Currently, every issue is classified using the `/classify_issue` command, which invokes an LLM (haiku) to determine the issue type. ADW-triggered issues often contain specific ADW commands in their body (e.g., `/adw_plan_build_test`), but the LLM classifier doesn't leverage these explicit signals. This leads to unnecessary LLM calls for issues that could be classified deterministically, and occasionally results in misclassification when the LLM misinterprets ADW-specific content.

## Solution Statement
Add a new `.claude/commands/classify_adw.md` command that extracts ADW workflow commands from issue text and returns structured JSON. Update the `issueClassifier.ts` to implement a two-step classification: first try `/classify_adw` to check for explicit ADW commands, and only fall back to `/classify_issue` if no ADW command is found (empty `{}` response). Add `/classify_adw` to the `SlashCommand` type for type safety.

## Relevant Files
Use these files to implement the feature:

- **`adws/triggers/issueClassifier.ts`** — Main classification module. Both `classifyIssueForTrigger()` and `classifyGitHubIssue()` need to be updated to try `/classify_adw` first, then fall back to `/classify_issue`.
- **`adws/core/dataTypes.ts`** — Contains `SlashCommand` type union. Needs `/classify_adw` added to the type.
- **`adws/agents/claudeAgent.ts`** — Provides `runClaudeAgentWithCommand()` used to invoke slash commands. No changes needed, but is a key dependency.
- **`adws/__tests__/workflowPhases.test.ts`** — Existing test file that mocks `classifyGitHubIssue`. May need updates if the mock interface changes.
- **`.claude/commands/classify_issue.md`** — Existing classification command. No changes needed, but referenced as the fallback.

### New Files
- **`.claude/commands/classify_adw.md`** — New ADW-aware classification command that extracts ADW workflow commands from issue text and returns JSON.
- **`adws/__tests__/issueClassifier.test.ts`** — New unit tests for the updated classification logic covering the two-step flow.

## Implementation Plan
### Phase 1: Foundation
- Add the `/classify_adw` command file to `.claude/commands/`.
- Add `/classify_adw` to the `SlashCommand` type in `adws/core/dataTypes.ts`.

### Phase 2: Core Implementation
- Refactor `classifyIssueForTrigger()` in `adws/triggers/issueClassifier.ts` to first call `/classify_adw`, parse the JSON response, and only fall back to `/classify_issue` if the response is empty (`{}`).
- Apply the same two-step logic to `classifyGitHubIssue()`.
- Extract shared parsing logic into a helper function to avoid duplication between the two classification functions.

### Phase 3: Integration
- Ensure the existing workflow phases (`workflowPhases.ts`) continue to call `classifyGitHubIssue()` with the same interface — no changes needed downstream since the return type `IssueClassificationResult` remains the same.
- Write comprehensive unit tests for the two-step classification logic.
- Validate the entire system with lint, build, and test commands.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Create the `/classify_adw` command file
- Create `.claude/commands/classify_adw.md` with the ADW workflow extraction prompt.
- The command should:
  - Look for ADW workflow commands in the text (e.g., `/adw_plan`, `/adw_build`, `/adw_plan_build_test`, `/adw_sdlc`, etc.)
  - Look for ADW IDs (8-character alphanumeric strings)
  - Return a JSON object with `adw_slash_command` and optionally `adw_id` fields
  - Return `{}` if no ADW workflow command is found
- Use the content from the `classify_adw.md` attachment in issue #107 as the template:

```md
---
name: classify_adw
description: Extract ADW workflow commands from issue text for deterministic classification
---

# ADW Workflow Extraction

Extract ADW workflow information from the text below and return a JSON response.

## Instructions

- Look for ADW workflow commands in the text (e.g., `/adw_plan`, `/adw_build`, `/adw_test`, `/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_test_review`, `/adw_sdlc`)
- Look for ADW IDs (8-character alphanumeric strings, often after "adw_id:" or "ADW ID:" or similar)
- Return a JSON object with the extracted information
- If no ADW workflow is found, return empty JSON: `{}`

## Valid ADW Commands

- `/adw_plan` - Planning only
- `/adw_build` - Building only (requires adw_id)
- `/adw_test` - Testing only (requires adw_id)
- `/adw_review` - Review only (requires adw_id)
- `/adw_document` - Documentation only (requires adw_id)
- `/adw_patch` - Direct patch from issue
- `/adw_plan_build` - Plan + Build
- `/adw_plan_build_test` - Plan + Build + Test
- `/adw_plan_build_review` - Plan + Build + Review (skips test)
- `/adw_plan_build_document` - Plan + Build + Document (skips test and review)
- `/adw_plan_build_test_review` - Plan + Build + Test + Review
- `/adw_sdlc` - Complete SDLC: Plan + Build + Test + Review + Document

## Response Format

Respond ONLY with a JSON object in this format:
```json
{
  "adw_slash_command": "/adw_plan",
  "adw_id": "abc12345"
}
```

Fields:
- `adw_slash_command`: The ADW command found (include the slash)
- `adw_id`: The 8-character ADW ID if found

If only one field is found, include only that field.
If nothing is found, return: `{}`

## Text to Analyze

$ARGUMENTS
```

### 2. Add `/classify_adw` to the `SlashCommand` type
- In `adws/core/dataTypes.ts`, add `'/classify_adw'` to the `SlashCommand` type union under the ADW workflow commands section.

### 3. Create a helper function for parsing ADW classification output
- In `adws/triggers/issueClassifier.ts`, create a `parseAdwClassification()` helper function that:
  - Takes the raw string output from the `/classify_adw` agent call.
  - Attempts to parse it as JSON.
  - Returns `null` if the result is empty (`{}`), malformed, or missing the `adw_slash_command` field.
  - Returns the `adw_slash_command` value if found and valid.

### 4. Create a helper function for mapping ADW commands to issue types
- In `adws/triggers/issueClassifier.ts`, create an `mapAdwCommandToIssueType()` helper function that:
  - Takes an ADW command string (e.g., `/adw_plan_build_test`).
  - Maps it to the corresponding `IssueClassSlashCommand` (`/feature`, `/bug`, `/chore`).
  - Default mapping: most ADW commands map to `/feature` since they involve building new functionality.
  - Commands like `/adw_patch` could map to `/bug`.
  - Commands like `/adw_document` could map to `/chore`.

### 5. Update `classifyIssueForTrigger()` to use two-step classification
- Modify `classifyIssueForTrigger()` in `adws/triggers/issueClassifier.ts`:
  - First, run `/classify_adw` with the issue context using `runClaudeAgentWithCommand`.
  - Parse the result with `parseAdwClassification()`.
  - If a valid ADW command is found, map it to an `IssueClassSlashCommand` using `mapAdwCommandToIssueType()` and return success.
  - If `/classify_adw` returns empty or fails, fall back to the existing `/classify_issue` logic.
  - Add appropriate logging for each step.

### 6. Update `classifyGitHubIssue()` to use two-step classification
- Apply the same two-step logic to `classifyGitHubIssue()`:
  - First try `/classify_adw`, then fall back to `/classify_issue`.
  - Use the same helper functions created in steps 3-4.
  - Maintain the same return type and interface.

### 7. Extract shared classification parsing into a helper
- Create a `parseIssueClassification()` helper that encapsulates the shared logic for parsing `/classify_issue` output (extracting valid commands from output text). This is the existing logic currently duplicated in both functions.
- Update both `classifyIssueForTrigger()` and `classifyGitHubIssue()` to use this shared helper for the fallback path.

### 8. Create unit tests for the updated classification logic
- Create `adws/__tests__/issueClassifier.test.ts` with tests covering:
  - `parseAdwClassification()`: valid JSON with command, empty `{}`, malformed JSON, missing fields
  - `mapAdwCommandToIssueType()`: each ADW command maps to the correct issue type
  - `classifyIssueForTrigger()`: ADW command found (skips fallback), ADW returns empty (falls back to `/classify_issue`), both fail (defaults to `/feature`)
  - `classifyGitHubIssue()`: same scenarios as above
  - `parseIssueClassification()`: valid command parsing, no match returns null
- Mock `runClaudeAgentWithCommand` and `fetchGitHubIssue` as done in existing test files.

### 9. Run validation commands
- Run all validation commands to ensure the feature works correctly with zero regressions.

## Testing Strategy
### Unit Tests
- Test `parseAdwClassification()` with valid JSON containing `adw_slash_command`, empty `{}`, malformed JSON, and JSON missing required fields.
- Test `mapAdwCommandToIssueType()` for each valid ADW command mapping to the correct `IssueClassSlashCommand`.
- Test `classifyIssueForTrigger()` with mocked agent calls: ADW match path, fallback path, and error path.
- Test `classifyGitHubIssue()` with same mocked scenarios.
- Test `parseIssueClassification()` for valid and invalid outputs.

### Integration Tests
- Existing `workflowPhases.test.ts` already mocks `classifyGitHubIssue` and should continue to pass since the return type `IssueClassificationResult` is unchanged.

### Edge Cases
- `/classify_adw` returns valid JSON but with an unrecognized ADW command — should fall back to `/classify_issue`.
- `/classify_adw` returns JSON with only `adw_id` but no `adw_slash_command` — should fall back.
- `/classify_adw` agent call times out or errors — should fall back gracefully.
- Issue body is empty or null — should handle without throwing.
- `/classify_adw` returns a JSON object embedded in extra text — parser should extract the JSON.

## Acceptance Criteria
- A new `.claude/commands/classify_adw.md` file exists with the ADW extraction prompt.
- `/classify_adw` is added to the `SlashCommand` type in `dataTypes.ts`.
- `classifyIssueForTrigger()` tries `/classify_adw` first, falls back to `/classify_issue` if empty.
- `classifyGitHubIssue()` tries `/classify_adw` first, falls back to `/classify_issue` if empty.
- Both functions maintain the same `IssueClassificationResult` return type — no downstream changes needed.
- Shared parsing logic is extracted to reduce duplication.
- Unit tests cover the two-step classification flow, helper functions, and edge cases.
- All validation commands pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npx tsc --noEmit -p adws/tsconfig.json` - Type-check the adws TypeScript files
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` content comes from the attachment on GitHub issue #107. The command uses keyword matching rather than LLM interpretation, making it deterministic for ADW-triggered issues.
- The `haiku` model continues to be used for both `/classify_adw` and `/classify_issue` calls since both are simple classification tasks.
- The `IssueClassificationResult` interface remains unchanged, ensuring backward compatibility with all downstream consumers (`workflowPhases.ts`, etc.).
- The `getWorkflowScript()` function requires no changes since it operates on `IssueClassSlashCommand` which is unchanged.
- File size for `issueClassifier.ts` should remain under 150 lines per the coding guidelines. If the two-step logic pushes it over, consider extracting the helper functions into a separate `classificationHelpers.ts` module.
