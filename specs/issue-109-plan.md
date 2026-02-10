# Feature: Two-Tier Issue Classification with ADW Command Extraction

## Feature Description
Add a two-tier classification system to the ADW issue classifier. The first tier (`/classify_adw`) performs fast, keyword-based extraction of explicit ADW workflow commands (e.g., `/adw_plan_build_test`) and ADW IDs from issue text. Only if the first tier returns an empty result (`{}`), the second tier falls back to the existing AI-based `/classify_issue` command that analyzes issue content to determine the issue type. This makes classification faster and more deterministic when issues contain explicit ADW directives, while preserving full AI-based classification for general issues.

## User Story
As a project maintainer
I want the ADW classifier to first look for explicit ADW commands in issue text before falling back to AI-based classification
So that issues with explicit workflow directives are classified instantly and deterministically, reducing latency and API cost

## Problem Statement
Currently, both classifier functions (`classifyIssueForTrigger` and `classifyGitHubIssue`) always invoke the AI-based `/classify_issue` command to determine issue type. This works well for general issues but is wasteful when the issue body already contains an explicit ADW command (like `/adw_plan_build_test`). These explicit commands should be detected first via fast keyword extraction, avoiding the need for a full AI classification call.

## Solution Statement
1. Create a new Claude command `.claude/commands/classify_adw.md` that extracts ADW workflow commands and ADW IDs from issue text using keyword matching, returning JSON like `{ "adw_slash_command": "/adw_plan_build_test", "adw_id": "abc12345" }` or `{}` if nothing is found.
2. Add new types for ADW slash commands and an extended classification result interface.
3. Update both classifier functions in `issueClassifier.ts` to first try `/classify_adw`. If it returns a valid ADW command, map it to the closest `IssueClassSlashCommand` and the corresponding workflow script. If it returns `{}`, fall back to `/classify_issue`.
4. Update `getWorkflowScript()` to accept an optional ADW command for direct workflow script routing.
5. Update triggers to pass ADW ID through to spawned workflows when available.

## Relevant Files
Use these files to implement the feature:

- `adws/triggers/issueClassifier.ts` — The main classifier module. Contains `classifyIssueForTrigger()`, `classifyGitHubIssue()`, and `getWorkflowScript()`. All three functions need updates for the two-tier classification.
- `adws/core/dataTypes.ts` — Type definitions. Needs new ADW command types, updated `SlashCommand` union, and extended `IssueClassificationResult` interface.
- `adws/core/index.ts` — Core barrel exports. Needs to export new types.
- `adws/agents/claudeAgent.ts` — The `runClaudeAgentWithCommand()` function used to invoke Claude commands. Read-only reference for understanding how commands are executed.
- `adws/triggers/trigger_webhook.ts` — Webhook trigger that calls `classifyIssueForTrigger()` and `getWorkflowScript()`. Needs minor updates to pass ADW ID to spawned workflows.
- `adws/triggers/trigger_cron.ts` — Cron trigger that calls `classifyIssueForTrigger()` and `getWorkflowScript()`. Needs minor updates to pass ADW ID to spawned workflows.
- `.claude/commands/classify_issue.md` — Existing classification command. Read-only reference for understanding the current classification prompt format.
- `adws/__tests__/workflowPhases.test.ts` — Existing tests that mock the classifier. May need updates if the import path or function signature changes.
- `guidelines/coding_guidelines.md` — Coding guidelines to follow. Read-only reference.

### New Files
- `.claude/commands/classify_adw.md` — New Claude command for ADW keyword-based classification.
- `adws/__tests__/issueClassifier.test.ts` — New unit tests for the updated classifier functions.

## Implementation Plan
### Phase 1: Foundation
Create the new Claude command and add the required type definitions:
1. Create `.claude/commands/classify_adw.md` with the ADW command extraction prompt (from the attached file in issue #107).
2. Add `AdwSlashCommand` type for all valid ADW commands (e.g., `/adw_plan`, `/adw_build`, `/adw_plan_build_test`, etc.).
3. Extend the `IssueClassificationResult` interface to include optional `adwCommand` and `adwId` fields.
4. Add `/classify_adw` to the `SlashCommand` union type.
5. Add an `adwCommandToWorkflowScript` mapping from ADW commands to workflow script paths.

### Phase 2: Core Implementation
Update the classifier functions to implement two-tier classification:
1. Add a helper function `parseAdwClassification(output: string)` to parse the JSON response from `/classify_adw`.
2. Add a helper function `mapAdwCommandToIssueType(adwCommand: AdwSlashCommand)` to map ADW commands to `IssueClassSlashCommand` for backward compatibility.
3. Update `classifyIssueForTrigger()` to first try `/classify_adw`, then fall back to `/classify_issue`.
4. Update `classifyGitHubIssue()` with the same two-tier approach.
5. Update `getWorkflowScript()` to accept an optional `adwCommand` parameter for direct workflow script routing.

### Phase 3: Integration
Update trigger scripts to leverage the new classification fields:
1. Update `trigger_webhook.ts` to pass `adwId` to spawned workflow scripts when available.
2. Update `trigger_cron.ts` similarly.
3. Ensure the `initializeWorkflow` function in `workflowPhases.ts` correctly handles the pre-classified issue type when provided.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create `.claude/commands/classify_adw.md`
- Create the file `.claude/commands/classify_adw.md` with the following content (from the attachment in issue #107):
  - Frontmatter with `name: classify_adw` and `description: Extract ADW workflow commands and IDs from issue text`.
  - Instructions to look for ADW workflow commands (`/adw_plan`, `/adw_build`, `/adw_test`, `/adw_review`, `/adw_document`, `/adw_patch`, `/adw_plan_build`, `/adw_plan_build_test`, `/adw_plan_build_review`, `/adw_plan_build_document`, `/adw_plan_build_test_review`, `/adw_sdlc`).
  - Instructions to look for ADW IDs (8-character alphanumeric strings after `adw_id:` or `ADW ID:` patterns).
  - JSON response format: `{ "adw_slash_command": "/adw_plan", "adw_id": "abc12345" }` or `{}` if nothing found.
  - The `$ARGUMENTS` placeholder for the issue text.

### Step 2: Add ADW types to `adws/core/dataTypes.ts`
- Add a new type `AdwSlashCommand` as a union of all valid ADW commands:
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
- Add `/classify_adw` to the existing `SlashCommand` union type.
- Add a constant mapping `adwCommandToWorkflowScript` from `AdwSlashCommand` to workflow script paths:
  ```typescript
  export const adwCommandToWorkflowScript: Record<AdwSlashCommand, string> = {
    '/adw_plan': 'adws/adwPlan.tsx',
    '/adw_build': 'adws/adwBuild.tsx',
    '/adw_test': 'adws/adwTest.tsx',
    '/adw_review': 'adws/adwPrReview.tsx',
    '/adw_document': 'adws/adwPlanBuild.tsx',
    '/adw_patch': 'adws/adwPlanBuild.tsx',
    '/adw_plan_build': 'adws/adwPlanBuild.tsx',
    '/adw_plan_build_test': 'adws/adwPlanBuildTest.tsx',
    '/adw_plan_build_review': 'adws/adwPlanBuild.tsx',
    '/adw_plan_build_document': 'adws/adwPlanBuild.tsx',
    '/adw_plan_build_test_review': 'adws/adwPlanBuildTest.tsx',
    '/adw_sdlc': 'adws/adwPlanBuildTest.tsx',
  };
  ```
- Add a constant mapping `adwCommandToIssueType` from `AdwSlashCommand` to `IssueClassSlashCommand`:
  ```typescript
  export const adwCommandToIssueType: Record<AdwSlashCommand, IssueClassSlashCommand> = {
    '/adw_plan': '/feature',
    '/adw_build': '/feature',
    '/adw_test': '/feature',
    '/adw_review': '/pr_review',
    '/adw_document': '/chore',
    '/adw_patch': '/bug',
    '/adw_plan_build': '/feature',
    '/adw_plan_build_test': '/feature',
    '/adw_plan_build_review': '/feature',
    '/adw_plan_build_document': '/feature',
    '/adw_plan_build_test_review': '/feature',
    '/adw_sdlc': '/feature',
  };
  ```

### Step 3: Export new types from `adws/core/index.ts`
- Add `AdwSlashCommand` to the type exports from `./dataTypes`.
- Add `adwCommandToWorkflowScript` and `adwCommandToIssueType` to the value exports from `./dataTypes`.

### Step 4: Update `adws/triggers/issueClassifier.ts` with two-tier classification
- Add imports for `AdwSlashCommand`, `adwCommandToWorkflowScript`, and `adwCommandToIssueType` from `../core`.
- Add a new exported interface `AdwClassificationResult`:
  ```typescript
  export interface AdwClassificationResult {
    adwSlashCommand: AdwSlashCommand | null;
    adwId: string | null;
  }
  ```
- Add a new helper function `parseAdwClassification(output: string): AdwClassificationResult`:
  - Attempt to parse the output as JSON.
  - Extract `adw_slash_command` and `adw_id` fields from the parsed object.
  - Validate that `adw_slash_command` is one of the known `AdwSlashCommand` values.
  - Return `{ adwSlashCommand: null, adwId: null }` if parsing fails or the command is not valid.
- Extend `IssueClassificationResult` to add optional fields:
  ```typescript
  export interface IssueClassificationResult {
    issueType: IssueClassSlashCommand;
    success: boolean;
    adwCommand?: AdwSlashCommand;
    adwId?: string;
  }
  ```
- Update `classifyIssueForTrigger(issueNumber)`:
  1. Fetch the issue (existing code).
  2. Run `/classify_adw` with the issue context using haiku model.
  3. Parse the result with `parseAdwClassification()`.
  4. If a valid ADW command is found, map it to an issue type using `adwCommandToIssueType`, and return with `adwCommand` and `adwId` set.
  5. If no ADW command found (empty object), fall back to running `/classify_issue` (existing behavior).
- Update `classifyGitHubIssue(issue)` with the same two-tier approach:
  1. Run `/classify_adw` with the issue context using haiku model.
  2. Parse the result.
  3. If ADW command found, return mapped issue type with `adwCommand` and `adwId`.
  4. If empty, fall back to `/classify_issue`.
- Update `getWorkflowScript()` to accept an optional `adwCommand` parameter:
  ```typescript
  export function getWorkflowScript(
    issueType: IssueClassSlashCommand,
    adwCommand?: AdwSlashCommand
  ): string {
    if (adwCommand) {
      return adwCommandToWorkflowScript[adwCommand];
    }
    // existing switch statement
  }
  ```

### Step 5: Update `adws/triggers/trigger_webhook.ts`
- Update the issue classification call sites to pass through ADW classification info:
  - In the `issue_comment` handler: when calling `classifyIssueForTrigger`, pass `classification.adwCommand` to `getWorkflowScript`, and pass `classification.adwId` as an extra argument to the spawned workflow if present.
  - In the `issues` event handler: same pattern.
- When spawning the workflow, if `classification.adwId` is present, pass it as the second argument to the workflow script (e.g., `spawnDetached('npx', ['tsx', workflowScript, String(issueNumber), adwId])`).

### Step 6: Update `adws/triggers/trigger_cron.ts`
- Apply the same changes as in the webhook trigger:
  - In `checkAndTrigger()`, when calling `classifyIssueForTrigger`, pass `classification.adwCommand` to `getWorkflowScript`.
  - Pass `classification.adwId` to the spawned workflow when available.

### Step 7: Create unit tests in `adws/__tests__/issueClassifier.test.ts`
- Mock `runClaudeAgentWithCommand` from `../agents/claudeAgent`.
- Mock `fetchGitHubIssue` from `../github/githubApi`.
- Test `parseAdwClassification`:
  - Valid JSON with `adw_slash_command` and `adw_id` → returns both.
  - Valid JSON with `adw_slash_command` only → returns command, null id.
  - Valid JSON with `adw_id` only → returns null command, id.
  - Empty JSON `{}` → returns both null.
  - Invalid JSON string → returns both null.
  - JSON with invalid command → returns null command.
- Test `classifyIssueForTrigger`:
  - When `/classify_adw` returns a valid ADW command → uses ADW mapping, does NOT call `/classify_issue`.
  - When `/classify_adw` returns empty `{}` → falls back to `/classify_issue`.
  - When `/classify_adw` fails (agent error) → falls back to `/classify_issue`.
  - Verify `adwCommand` and `adwId` are set in the result when ADW classification succeeds.
- Test `classifyGitHubIssue`:
  - Same test cases as `classifyIssueForTrigger` but with pre-fetched issue input.
- Test `getWorkflowScript`:
  - With `adwCommand` parameter → returns correct script from `adwCommandToWorkflowScript`.
  - Without `adwCommand` → existing behavior unchanged.
  - Each `AdwSlashCommand` maps to the correct workflow script.
  - Each `IssueClassSlashCommand` maps to the correct workflow script (regression check).

### Step 8: Run validation commands
- Run `npm run lint` to check for code quality issues.
- Run `npm run build` to verify no build errors.
- Run `npm test` to validate the feature works with zero regressions.

## Testing Strategy
### Unit Tests
- **`parseAdwClassification`**: Test with various JSON inputs (valid, invalid, partial, empty, malformed) to ensure robust parsing.
- **`classifyIssueForTrigger`**: Mock the Claude agent to test both tiers of classification. Verify that `/classify_adw` is always called first, and `/classify_issue` is only called when ADW classification returns empty.
- **`classifyGitHubIssue`**: Same mock-based tests as `classifyIssueForTrigger` but with pre-fetched issue objects.
- **`getWorkflowScript`**: Test all ADW command → workflow script mappings and all issue type → workflow script mappings.
- **Type mapping constants**: Verify `adwCommandToWorkflowScript` and `adwCommandToIssueType` cover all `AdwSlashCommand` values.

### Integration Tests
- Verify the full classification chain: issue text with ADW command → `/classify_adw` → parse → map → workflow script selection.
- Verify the fallback chain: issue text without ADW command → `/classify_adw` returns `{}` → `/classify_issue` → issue type → workflow script selection.

### Edge Cases
- Issue text containing multiple ADW commands — the first one found should be used.
- Issue text containing ADW-like text that is not a valid command (e.g., `/adw_unknown`) — should fall back to `/classify_issue`.
- `/classify_adw` agent returns malformed JSON — should gracefully fall back to `/classify_issue`.
- `/classify_adw` agent times out or errors — should gracefully fall back to `/classify_issue`.
- Issue text with ADW command in a code block or quote — `/classify_adw` may still extract it; this is acceptable.
- ADW ID without an ADW command — the result should still be empty (no `adwSlashCommand`), falling back to `/classify_issue`.

## Acceptance Criteria
- A new Claude command `.claude/commands/classify_adw.md` exists and extracts ADW commands and IDs from issue text.
- Both `classifyIssueForTrigger` and `classifyGitHubIssue` first try `/classify_adw` before falling back to `/classify_issue`.
- When `/classify_adw` returns a valid ADW command, the system uses it for direct workflow script routing without calling `/classify_issue`.
- When `/classify_adw` returns `{}`, the system falls back to `/classify_issue` (existing behavior).
- `getWorkflowScript` correctly maps ADW commands to workflow scripts when provided.
- All ADW commands defined in `classify_adw.md` are represented in the `AdwSlashCommand` type and mapping constants.
- The `IssueClassificationResult` interface includes optional `adwCommand` and `adwId` fields for downstream use.
- Triggers pass `adwId` to spawned workflows when available.
- All new and existing unit tests pass.
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` content is taken directly from the attachment in issue #107. It defines the exact ADW commands to look for and the JSON response format.
- ADW commands that don't have a dedicated workflow script (e.g., `/adw_document`, `/adw_patch`, `/adw_plan_build_review`, `/adw_plan_build_document`) are mapped to the closest available script (`adwPlanBuild.tsx` or `adwPlanBuildTest.tsx`). As new workflow scripts are added in the future, these mappings can be updated.
- The `adwCommandToIssueType` mapping defaults most ADW commands to `/feature` because ADW-directed workflows are typically feature work. `/adw_review` maps to `/pr_review`, `/adw_document` to `/chore`, and `/adw_patch` to `/bug` for more accurate branch naming.
- The two-tier classification preserves backward compatibility: existing issues without ADW commands will continue to be classified by `/classify_issue` with no change in behavior.
- Both `/classify_adw` and `/classify_issue` use the `haiku` model for fast, cost-effective classification.
- The `adwId` extracted by `/classify_adw` enables workflow resumption when an issue references a previous ADW session. The triggers pass it to spawned workflows as the second CLI argument, which the workflow scripts already support (e.g., `npx tsx adws/adwPlanBuildTest.tsx <issue-number> [adw-id]`).
