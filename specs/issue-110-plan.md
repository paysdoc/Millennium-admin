# Feature: Two-Phase Issue Classification with ADW Command Detection

## Feature Description
Add a new `/classify_adw` Claude command that performs keyword-based extraction of explicit ADW workflow commands from issue text, and update the issue classifier to use a two-phase approach: try `/classify_adw` first (fast, deterministic keyword extraction), then fall back to the existing `/classify_issue` LLM-based classification only when no ADW command is detected. This gives issue authors direct control over which workflow runs by embedding ADW commands in the issue text, while preserving the intelligent fallback for issues without explicit commands.

## User Story
As a developer creating GitHub issues
I want to embed explicit ADW workflow commands (e.g., `/adw_plan_build_test`) in my issue text
So that the ADW system deterministically selects the correct workflow without relying on LLM interpretation

## Problem Statement
The current issue classification relies solely on an LLM (Haiku) to infer the issue type (`/chore`, `/bug`, `/feature`, `/pr_review`) from the issue text. This approach has two limitations:
1. It requires an LLM API call for every classification, adding latency and cost.
2. It cannot distinguish between different workflow compositions (plan-only, plan+build, plan+build+test, full SDLC) since it only classifies into 4 categories.

Issue authors may want to explicitly specify which ADW workflow to run (e.g., `/adw_plan` for planning only, `/adw_plan_build_test` for the full cycle). The current system has no way to detect or honor these explicit instructions.

## Solution Statement
Implement a two-phase classification approach:
1. **Phase 1 (Keyword-based):** Run the new `/classify_adw` command with the issue text. This command uses an LLM to extract ADW-specific keywords (like `/adw_plan_build`) from the issue text and returns a JSON result. If a valid ADW command is found, map it to the appropriate `IssueClassSlashCommand` and workflow script.
2. **Phase 2 (LLM fallback):** If `/classify_adw` returns an empty object (`{}`), fall back to the existing `/classify_issue` command for traditional LLM-based classification.

This requires:
- A new `.claude/commands/classify_adw.md` prompt template
- New types and mappings for ADW commands in `dataTypes.ts`
- A helper module for parsing ADW classification output and mapping commands
- Updated `issueClassifier.ts` with two-phase logic
- Comprehensive unit tests

## Relevant Files
Use these files to implement the feature:

- `adws/core/dataTypes.ts` - Add `AdwSlashCommand` type and mapping constants for ADW commands to issue types and workflow scripts
- `adws/core/index.ts` - Export new types and constants from dataTypes
- `adws/triggers/issueClassifier.ts` - Update `classifyIssueForTrigger()` and `classifyGitHubIssue()` with two-phase classification logic
- `.claude/commands/classify_issue.md` - Existing classification command (unchanged, used as fallback reference)

### New Files
- `.claude/commands/classify_adw.md` - New Claude command prompt template for extracting ADW workflow commands from issue text
- `adws/triggers/classificationHelpers.ts` - Helper module containing `AdwClassificationResult` interface, `parseAdwClassificationOutput()`, `mapAdwCommandToIssueType()`, and `mapAdwCommandToWorkflowScript()` functions
- `adws/__tests__/issueClassifier.test.ts` - Unit tests for the two-phase classification logic and helper functions

## Implementation Plan
### Phase 1: Foundation
Add the new `/classify_adw` Claude command template and extend the type system with ADW command types and mappings. Create the helper module that encapsulates the parsing and mapping logic for ADW classification results.

### Phase 2: Core Implementation
Refactor `issueClassifier.ts` to implement the two-phase classification flow: try `/classify_adw` first, then fall back to `/classify_issue`. Extract shared logic into the helpers module to keep files under the 150-line guideline.

### Phase 3: Integration
Ensure the new classification flow integrates seamlessly with all consumers: `trigger_webhook.ts`, `trigger_cron.ts`, and `workflowPhases.ts`. These files already call `classifyIssueForTrigger()` and `classifyGitHubIssue()`, so the interface remains unchanged. Write comprehensive tests covering both phases, edge cases, and error handling.

## Step by Step Tasks

### Step 1: Create the `/classify_adw` command template
- Create `.claude/commands/classify_adw.md` with the ADW workflow extraction prompt
- The template instructs the LLM to look for ADW commands in the issue text (e.g., `/adw_plan`, `/adw_plan_build_test`, `/adw_sdlc`)
- It also extracts optional ADW IDs (8-character alphanumeric strings)
- Returns a JSON response: `{ "adw_slash_command": "/adw_plan_build", "adw_id": "abc12345" }` or `{}` if nothing found
- Uses `$ARGUMENTS` placeholder for the issue text input

The file contents should be:
```markdown
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

{
  "adw_slash_command": "/adw_plan",
  "adw_id": "abc12345"
}

Fields:
- `adw_slash_command`: The ADW command found (include the slash)
- `adw_id`: The 8-character ADW ID if found

If only one field is found, include only that field.
If nothing is found, return: `{}`

## Text to Analyze

$ARGUMENTS
```

### Step 2: Add ADW types and mappings to `dataTypes.ts`
- Add `AdwSlashCommand` type union with all valid ADW commands: `'/adw_plan'`, `'/adw_build'`, `'/adw_test'`, `'/adw_review'`, `'/adw_document'`, `'/adw_patch'`, `'/adw_plan_build'`, `'/adw_plan_build_test'`, `'/adw_plan_build_review'`, `'/adw_plan_build_document'`, `'/adw_plan_build_test_review'`, `'/adw_sdlc'`
- Add `adwCommandToIssueTypeMap` constant: `Record<AdwSlashCommand, IssueClassSlashCommand>` mapping each ADW command to its closest issue type (e.g., `/adw_plan` → `/feature`, `/adw_patch` → `/bug`, `/adw_review` → `/pr_review`, etc.)
- Add `adwCommandToWorkflowScriptMap` constant: `Record<AdwSlashCommand, string>` mapping each ADW command to the workflow script to spawn (e.g., `/adw_plan_build` → `'adws/adwPlanBuild.tsx'`, `/adw_plan_build_test` → `'adws/adwPlanBuildTest.tsx'`)
- Add `'/classify_adw'` to the `SlashCommand` union type
- Mappings should be:
  - `/adw_plan` → issue type `/feature`, workflow `adws/adwPlanBuildTest.tsx`
  - `/adw_build` → issue type `/feature`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_test` → issue type `/feature`, workflow `adws/adwPlanBuildTest.tsx`
  - `/adw_review` → issue type `/pr_review`, workflow `adws/adwPrReview.tsx`
  - `/adw_document` → issue type `/chore`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_patch` → issue type `/bug`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_plan_build` → issue type `/feature`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_plan_build_test` → issue type `/feature`, workflow `adws/adwPlanBuildTest.tsx`
  - `/adw_plan_build_review` → issue type `/feature`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_plan_build_document` → issue type `/feature`, workflow `adws/adwPlanBuild.tsx`
  - `/adw_plan_build_test_review` → issue type `/feature`, workflow `adws/adwPlanBuildTest.tsx`
  - `/adw_sdlc` → issue type `/feature`, workflow `adws/adwPlanBuildTest.tsx`

### Step 3: Export new types from `core/index.ts`
- Export `AdwSlashCommand` type from `./dataTypes`
- Export `adwCommandToIssueTypeMap` and `adwCommandToWorkflowScriptMap` constants from `./dataTypes`

### Step 4: Create `classificationHelpers.ts` helper module
- Create `adws/triggers/classificationHelpers.ts`
- Define `AdwClassificationResult` interface: `{ adw_slash_command?: string; adw_id?: string }`
- Implement `parseAdwClassificationOutput(output: string): AdwClassificationResult` function:
  - Trim the output
  - Try to parse as JSON
  - Validate that `adw_slash_command`, if present, is a valid `AdwSlashCommand`
  - Return the parsed result or empty object `{}` on failure
- Implement `mapAdwCommandToIssueType(command: AdwSlashCommand): IssueClassSlashCommand` function:
  - Look up the command in `adwCommandToIssueTypeMap`
  - Return the mapped issue type
- Implement `mapAdwCommandToWorkflowScript(command: AdwSlashCommand): string` function:
  - Look up the command in `adwCommandToWorkflowScriptMap`
  - Return the mapped workflow script path
- Implement `isNonEmptyAdwResult(result: AdwClassificationResult): boolean` function:
  - Return `true` if `adw_slash_command` is present and non-empty

### Step 5: Refactor `issueClassifier.ts` with two-phase classification
- Import helpers from `./classificationHelpers`
- Import `AdwSlashCommand` type from `../core`
- Update `classifyIssueForTrigger()`:
  1. Fetch issue details (existing)
  2. **Phase 1**: Run `/classify_adw` with the issue context using Haiku model
  3. Parse the result with `parseAdwClassificationOutput()`
  4. If a valid ADW command is found (`isNonEmptyAdwResult()`), map it to an `IssueClassSlashCommand` using `mapAdwCommandToIssueType()` and return success
  5. **Phase 2 (fallback)**: Run `/classify_issue` with the issue context (existing logic)
  6. Parse and return as before
- Update `classifyGitHubIssue()` with the same two-phase approach:
  1. Build issue context (existing)
  2. **Phase 1**: Run `/classify_adw`, parse, check for valid ADW command
  3. **Phase 2 (fallback)**: Run `/classify_issue` (existing logic)
- Update `getWorkflowScript()`:
  - Keep existing behavior as-is (this function already works correctly)
  - The ADW command → workflow script mapping is handled by `mapAdwCommandToWorkflowScript()` in the helpers, which consumers can call directly when they have an ADW command
- Ensure file stays under 150 lines by leveraging the helpers module

### Step 6: Create comprehensive unit tests
- Create `adws/__tests__/issueClassifier.test.ts`
- Mock `runClaudeAgentWithCommand` from `../agents/claudeAgent`
- Mock `fetchGitHubIssue` from `../github/githubApi`

**Test groups for `classificationHelpers`:**
- `parseAdwClassificationOutput()`:
  - Valid JSON with `adw_slash_command` and `adw_id` returns correct result
  - Valid JSON with only `adw_slash_command` returns result without `adw_id`
  - Empty JSON `{}` returns empty object
  - Invalid JSON returns empty object
  - JSON with invalid `adw_slash_command` value returns empty object
  - Handles whitespace/newlines around JSON
- `mapAdwCommandToIssueType()`:
  - `/adw_plan` maps to `/feature`
  - `/adw_patch` maps to `/bug`
  - `/adw_review` maps to `/pr_review`
  - `/adw_document` maps to `/chore`
  - `/adw_plan_build` maps to `/feature`
  - `/adw_plan_build_test` maps to `/feature`
  - `/adw_sdlc` maps to `/feature`
- `mapAdwCommandToWorkflowScript()`:
  - `/adw_plan_build` maps to `adws/adwPlanBuild.tsx`
  - `/adw_plan_build_test` maps to `adws/adwPlanBuildTest.tsx`
  - `/adw_sdlc` maps to `adws/adwPlanBuildTest.tsx`
- `isNonEmptyAdwResult()`:
  - Returns `true` for result with `adw_slash_command`
  - Returns `false` for empty object
  - Returns `false` for result with empty string `adw_slash_command`

**Test groups for `classifyIssueForTrigger()`:**
- Returns correct type when `/classify_adw` finds an ADW command (Phase 1 success)
- Falls back to `/classify_issue` when `/classify_adw` returns `{}` (Phase 2 fallback)
- Falls back to `/classify_issue` when `/classify_adw` fails (error handling)
- Returns `/feature` default when both phases fail

**Test groups for `classifyGitHubIssue()`:**
- Returns correct type when `/classify_adw` finds an ADW command (Phase 1 success)
- Falls back to `/classify_issue` when `/classify_adw` returns `{}` (Phase 2 fallback)
- Returns `/feature` default when both phases fail
- Correctly includes issue labels in context

**Test groups for `getWorkflowScript()`:**
- `/feature` maps to `adws/adwPlanBuildTest.tsx`
- `/chore` maps to `adws/adwPlanBuildTest.tsx`
- `/bug` maps to `adws/adwPlanBuild.tsx`
- `/pr_review` maps to `adws/adwPlanBuild.tsx`

### Step 7: Run validation commands
- Run `npm run lint` to check for linting errors
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all tests pass with zero regressions

## Testing Strategy
### Unit Tests
- Test `parseAdwClassificationOutput()` with valid JSON, empty JSON, invalid JSON, and edge cases
- Test `mapAdwCommandToIssueType()` for all 12 ADW commands
- Test `mapAdwCommandToWorkflowScript()` for all 12 ADW commands
- Test `isNonEmptyAdwResult()` with positive and negative cases
- Test `classifyIssueForTrigger()` two-phase flow with mocked Claude agent calls
- Test `classifyGitHubIssue()` two-phase flow with mocked Claude agent calls
- Test `getWorkflowScript()` for all 4 issue types

### Integration Tests
- Verify the two-phase flow integrates correctly with the existing workflow initialization in `workflowPhases.ts`
- Verify that `trigger_webhook.ts` and `trigger_cron.ts` continue to work without changes (they call `classifyIssueForTrigger()` and `getWorkflowScript()` which maintain the same interface)

### Edge Cases
- `/classify_adw` returns malformed JSON (not valid JSON at all)
- `/classify_adw` returns JSON with unknown command string
- `/classify_adw` agent process fails entirely (non-zero exit code)
- `/classify_adw` returns JSON with empty string values
- Both `/classify_adw` and `/classify_issue` fail simultaneously
- Issue text contains multiple ADW commands (first valid one should be used by the LLM)
- Issue text contains ADW command-like strings that aren't exact matches

## Acceptance Criteria
- `.claude/commands/classify_adw.md` exists with the correct prompt template
- `AdwSlashCommand` type is defined in `dataTypes.ts` with all 12 valid ADW commands
- `adwCommandToIssueTypeMap` correctly maps all ADW commands to `IssueClassSlashCommand` values
- `adwCommandToWorkflowScriptMap` correctly maps all ADW commands to workflow script paths
- `classificationHelpers.ts` exports `parseAdwClassificationOutput`, `mapAdwCommandToIssueType`, `mapAdwCommandToWorkflowScript`, and `isNonEmptyAdwResult`
- `classifyIssueForTrigger()` tries `/classify_adw` first, falls back to `/classify_issue` on empty result
- `classifyGitHubIssue()` tries `/classify_adw` first, falls back to `/classify_issue` on empty result
- All existing tests continue to pass (zero regressions)
- New unit tests cover both phases of classification, all helper functions, and edge cases
- All files remain under 150 lines per the coding guidelines
- `npm run lint` passes with no errors
- `npm run build` succeeds
- `npm test` passes with all tests green

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` prompt template is taken directly from the attachment in GitHub Issue #107.
- Extracting helpers into `classificationHelpers.ts` keeps `issueClassifier.ts` under the 150-line limit per coding guidelines.
- The existing `SlashCommand` union type must include `'/classify_adw'` so it can be used with `runClaudeAgentWithCommand()`.
- The two-phase approach adds one additional LLM call per classification in the worst case (when no ADW command is found). In the best case, it resolves classification in a single call.
- No new external libraries are needed. All changes use existing project dependencies.
- The `trigger_webhook.ts`, `trigger_cron.ts`, and `workflowPhases.ts` files do not need modification since they consume `classifyIssueForTrigger()`, `classifyGitHubIssue()`, and `getWorkflowScript()` which maintain the same interface.
