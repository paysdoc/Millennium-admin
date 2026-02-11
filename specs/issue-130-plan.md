# Feature: Add classify_adw Command with Two-Step Classification

## Feature Description
Add a new `/classify_adw` Claude command that extracts explicit ADW workflow commands and IDs from GitHub issue text. Update the issue classifier to use this command as the primary classification step, falling back to the existing `/classify_issue` command only when no ADW-specific keywords are found. This enables users to explicitly specify which ADW workflow to run by including ADW commands (e.g., `/adw_plan_build_test`) in their issue descriptions or comments.

## User Story
As a developer creating GitHub issues
I want to include explicit ADW workflow commands in my issue text
So that the system routes my issue to the exact workflow I need without relying on AI classification heuristics

## Problem Statement
The current classification system relies solely on the `/classify_issue` command, which uses AI heuristics to categorize issues as `/feature`, `/bug`, `/chore`, or `/pr_review`. This can misclassify issues when the intent is ambiguous. There is no way for users to explicitly control which ADW workflow is triggered for their issue.

## Solution Statement
Introduce a two-step classification approach: first try `/classify_adw` to detect explicit ADW workflow keywords in the issue text, and only fall back to `/classify_issue` when no ADW keywords are found. The ADW commands are mapped to existing `IssueClassSlashCommand` types to maintain full backward compatibility with the existing workflow routing system.

## Relevant Files
Use these files to implement the feature:

- `.claude/commands/classify_issue.md` - Existing classification command; reference for the command file pattern (YAML frontmatter + instructions + `$ARGUMENTS`)
- `adws/triggers/issueClassifier.ts` - Core classification logic; both `classifyIssueForTrigger` and `classifyGitHubIssue` need the two-step classification update
- `adws/core/dataTypes.ts` - Type definitions; needs `/classify_adw` added to `SlashCommand` union and a new ADW command type
- `adws/__tests__/workflowPhases.test.ts` - Existing tests that mock `classifyGitHubIssue`; may need mock updates
- `adws/triggers/trigger_webhook.ts` - Consumes `classifyIssueForTrigger`; no changes needed (unchanged interface)
- `adws/triggers/trigger_cron.ts` - Consumes `classifyIssueForTrigger`; no changes needed (unchanged interface)
- `adws/workflowPhases.ts` - Consumes `classifyGitHubIssue`; no changes needed (unchanged interface)
- `adws/agents/claudeAgent.ts` - `runClaudeAgentWithCommand` function used by the classifier; no changes needed
- `guidelines/coding_guidelines.md` - Coding guidelines to follow

### New Files
- `.claude/commands/classify_adw.md` - New ADW workflow extraction command
- `adws/__tests__/issueClassifier.test.ts` - New dedicated unit tests for the classifier module

## Implementation Plan
### Phase 1: Foundation
Add the new `/classify_adw` command file and update type definitions to recognize the new command and ADW-specific types.

### Phase 2: Core Implementation
Update `issueClassifier.ts` with the two-step classification logic: try `/classify_adw` first, parse the JSON response, map ADW commands to `IssueClassSlashCommand`, and fall back to `/classify_issue` when the result is empty.

### Phase 3: Integration
Ensure the updated classifier integrates seamlessly with existing consumers (`trigger_webhook.ts`, `trigger_cron.ts`, `workflowPhases.ts`) without breaking the existing interface. Add comprehensive unit tests covering both the ADW classification path and the fallback path.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `classify_adw.md` command file
- Create `.claude/commands/classify_adw.md` with the following exact content (downloaded from the GitHub issue attachment):
```md
---
name: classify_adw
description: Classify a GitHub Issue by extracting ADW workflow commands and IDs
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

### Step 2: Update type definitions in `dataTypes.ts`
- Add `/classify_adw` to the `SlashCommand` union type (alongside existing `/classify_issue`)
- Add a new `AdwSlashCommand` type for valid ADW workflow commands:
  ```typescript
  export type AdwSlashCommand =
    | '/adw_plan'
    | '/adw_build'
    | '/adw_test'
    | '/adw_review'
    | '/adw_document'
    | '/adw_patch'
    | '/adw_plan_build'
    | '/adw_plan_build_test'
    | '/adw_plan_build_review'
    | '/adw_plan_build_document'
    | '/adw_plan_build_test_review'
    | '/adw_sdlc';
  ```
- Add a `adwCommandToIssueTypeMap` mapping ADW commands to `IssueClassSlashCommand`:
  ```typescript
  export const adwCommandToIssueTypeMap: Record<AdwSlashCommand, IssueClassSlashCommand> = {
    '/adw_plan': '/chore',
    '/adw_build': '/feature',
    '/adw_test': '/feature',
    '/adw_review': '/pr_review',
    '/adw_document': '/chore',
    '/adw_patch': '/bug',
    '/adw_plan_build': '/bug',
    '/adw_plan_build_test': '/feature',
    '/adw_plan_build_review': '/pr_review',
    '/adw_plan_build_document': '/chore',
    '/adw_plan_build_test_review': '/feature',
    '/adw_sdlc': '/feature',
  };
  ```
  Rationale: Commands that include a "test" phase map to `/feature` (triggers `adwPlanBuildTest.tsx`). Commands without test map to `/bug` (triggers `adwPlanBuild.tsx`). Planning/documentation-only map to `/chore`. Review-focused map to `/pr_review`.
- Add an `AdwClassificationResult` interface:
  ```typescript
  export interface AdwClassificationResult {
    adw_slash_command?: AdwSlashCommand;
    adw_id?: string;
  }
  ```
- Export the new types and map from `core/index.ts`

### Step 3: Update `issueClassifier.ts` with two-step classification
- Add a `parseAdwClassificationOutput` pure function that:
  - Takes the raw string output from the `/classify_adw` agent
  - Extracts JSON from the output (handling potential surrounding text)
  - Parses the JSON into an `AdwClassificationResult`
  - Returns `null` if the output is `{}` or unparseable
- Add a `classifyWithAdwCommand` async function that:
  - Takes the issue context string, issue number, and output file path
  - Calls `runClaudeAgentWithCommand('/classify_adw', issueContext, ...)` with `'haiku'` model
  - Parses the result using `parseAdwClassificationOutput`
  - If a valid ADW command is found, maps it to an `IssueClassSlashCommand` using `adwCommandToIssueTypeMap`
  - Returns `IssueClassificationResult | null` (null means fall back to `/classify_issue`)
- Update `classifyIssueForTrigger`:
  - First call `classifyWithAdwCommand` with the issue context
  - If it returns a non-null result, return that result immediately
  - If it returns null, proceed with the existing `/classify_issue` flow (unchanged)
- Update `classifyGitHubIssue`:
  - Same pattern: try ADW classification first, fall back to `/classify_issue`
- Extend `IssueClassificationResult` to include optional `adwCommand` and `adwId` fields:
  ```typescript
  export interface IssueClassificationResult {
    issueType: IssueClassSlashCommand;
    success: boolean;
    adwCommand?: AdwSlashCommand;
    adwId?: string;
  }
  ```

### Step 4: Create unit tests for issueClassifier
- Create `adws/__tests__/issueClassifier.test.ts` with tests for:
  - `parseAdwClassificationOutput`:
    - Returns parsed result for valid JSON with `adw_slash_command`
    - Returns parsed result for JSON with both `adw_slash_command` and `adw_id`
    - Returns null for empty JSON `{}`
    - Returns null for invalid/malformed output
    - Returns null for JSON with unknown ADW command
    - Handles JSON embedded in surrounding text (e.g., agent may include explanation text)
  - `classifyWithAdwCommand`:
    - Returns classification result when ADW command is found
    - Returns null when agent returns empty JSON
    - Returns null when agent call fails
    - Maps each ADW command to the correct `IssueClassSlashCommand`
  - `classifyIssueForTrigger` (integration-style with mocks):
    - Uses ADW classification when `/classify_adw` finds a command
    - Falls back to `/classify_issue` when `/classify_adw` returns empty
    - Defaults to `/feature` when both classifiers fail
  - `classifyGitHubIssue` (integration-style with mocks):
    - Same three scenarios as above
  - `getWorkflowScript`:
    - Existing tests for the mapping (unchanged behavior)

### Step 5: Update existing `workflowPhases.test.ts` mock
- Update the mock for `classifyGitHubIssue` in `workflowPhases.test.ts` to include the new optional fields in the mock return value (backward compatible, no behavioral change needed)

### Step 6: Run validation commands

## Testing Strategy
### Unit Tests
- Pure function tests for `parseAdwClassificationOutput` covering all JSON parsing edge cases
- Tests for `classifyWithAdwCommand` with mocked `runClaudeAgentWithCommand`
- Tests for the two-step flow in both `classifyIssueForTrigger` and `classifyGitHubIssue`
- Tests for the ADW command to issue type mapping completeness

### Integration Tests
- Mock-based integration tests verifying the full classification flow from trigger entry points
- Verify that existing `workflowPhases.test.ts` tests pass unchanged

### Edge Cases
- `/classify_adw` returns JSON embedded in explanation text (e.g., "Here is the result: {...}")
- `/classify_adw` returns valid JSON but with an unrecognized ADW command
- `/classify_adw` agent call times out or fails
- Issue text contains multiple ADW commands (should use the first valid one)
- Issue text contains ADW ID but no command
- Both `/classify_adw` and `/classify_issue` fail (should default to `/feature`)

## Acceptance Criteria
- `.claude/commands/classify_adw.md` exists with the correct content from the GitHub attachment
- `/classify_adw` is listed in the `SlashCommand` type in `dataTypes.ts`
- `classifyIssueForTrigger` tries `/classify_adw` first and falls back to `/classify_issue`
- `classifyGitHubIssue` tries `/classify_adw` first and falls back to `/classify_issue`
- When `/classify_adw` returns `{}`, the system falls back to `/classify_issue` transparently
- When `/classify_adw` returns a valid ADW command, it maps correctly to an `IssueClassSlashCommand`
- All existing tests pass without modification (backward compatible)
- New unit tests cover the ADW classification path, fallback path, and edge cases
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `guidelines/coding_guidelines.md`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw` command uses the `haiku` model (same as `classify_issue`) for fast, cost-effective classification.
- The ADW command-to-issue-type mapping preserves existing workflow routing: commands with test phases map to `/feature` (→ `adwPlanBuildTest.tsx`), commands without test map to `/bug` (→ `adwPlanBuild.tsx`).
- The `IssueClassificationResult` is extended with optional `adwCommand` and `adwId` fields. These are not used by consumers yet but provide a foundation for future enhancements (e.g., `getWorkflowScript` could use `adwCommand` directly for more granular routing).
- The `parseAdwClassificationOutput` function should be a pure, exported function to facilitate unit testing.
- No new libraries are needed; all changes use existing dependencies.
