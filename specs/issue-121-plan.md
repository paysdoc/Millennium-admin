# Feature: Replace Timestamp with Summary in ADW ID

## Feature Description
Currently, ADW (AI Developer Workflow) session identifiers are generated using the format `adw-{timestamp}-{random}` (e.g., `adw-1770819277126-v2n6pm`). The timestamp portion is a Unix millisecond value that is not human-readable. This feature replaces the timestamp with a short, slugified summary of the issue title (max 20 characters), producing IDs like `adw-replace-timestamp-v2n6pm`. This makes ADW IDs immediately meaningful when seen in GitHub comments, branch names, log directories, and state directories.

## User Story
As a developer reviewing ADW workflow output
I want ADW IDs to contain a readable summary instead of a timestamp
So that I can quickly identify which issue an ADW session relates to without cross-referencing

## Problem Statement
ADW IDs like `adw-1770819277126-v2n6pm` contain a Unix timestamp that conveys no meaningful information to a human reader. When these IDs appear in GitHub issue comments, branch names, log directories, and state directories, developers cannot tell at a glance which issue or workflow the ID belongs to.

## Solution Statement
Modify the `generateAdwId()` function to accept an optional `summary` parameter (the issue title or PR title). When provided, the timestamp is replaced with a slugified, truncated (max 20 chars) version of the summary. When no summary is available (e.g., standalone test runner), the function falls back to the existing timestamp-based format for backwards compatibility. Update all callers to pass the issue/PR title, and update the `extractAdwIdFromComment()` regex to match both old and new formats.

## Relevant Files
Use these files to implement the feature:

### Core ADW ID Generation
- `adws/core/utils.ts` — Contains `generateAdwId()` function (line 14) and `slugify()` helper (line 22). Primary modification target.
- `adws/core/index.ts` — Re-exports `generateAdwId` from utils. No changes needed.

### Comment Extraction (Regex Update)
- `adws/github/workflowCommentsBase.ts` — Contains `extractAdwIdFromComment()` (line 74) with regex `adw-\d+-[a-z0-9]+` that must be updated to match the new format.

### Workflow Initialization (Caller Updates)
- `adws/workflowPhases.ts` — Contains `initializeWorkflow()` (line 88) and `initializePRReviewWorkflow()` (line 579). These functions fetch the issue/PR and should generate the ADW ID with the title context.
- `adws/adwPlan.tsx` — Calls `generateAdwId()` at line 97. Needs to pass `null` for auto-generation inside `initializeWorkflow`.
- `adws/adwBuild.tsx` — Calls `generateAdwId()` at line 149. Fetches its own issue, so pass issue title directly.
- `adws/adwPlanBuild.tsx` — Calls `generateAdwId()` at line 59. Needs to pass `null` for auto-generation inside `initializeWorkflow`.
- `adws/adwPlanBuildTest.tsx` — Calls `generateAdwId()` at line 63. Needs to pass `null` for auto-generation inside `initializeWorkflow`.
- `adws/adwPrReview.tsx` — Calls `generateAdwId()` at line 43. Needs to pass `null` for auto-generation inside `initializePRReviewWorkflow`.
- `adws/adwTest.tsx` — Calls `generateAdwId()` at line 62. No issue context available; keep timestamp fallback.

### Tests
- `adws/__tests__/commentFiltering.test.ts` — Contains test data with old-format ADW IDs.
- `adws/__tests__/triggerCommentHandling.test.ts` — Contains test data with old-format ADW IDs.
- `adws/__tests__/adwPrReview.test.ts` — Contains test data with old-format ADW IDs.
- `adws/__tests__/gitAgent.test.ts` — Tests for branch name agent that reference ADW IDs.
- `adws/__tests__/workflowPhases.test.ts` — Tests for workflow initialization.
- `adws/__tests__/branchNameGeneration.test.ts` — Tests for branch name generation.

### New Files
- `adws/__tests__/generateAdwId.test.ts` — New unit tests for the updated `generateAdwId()` function.

## Implementation Plan

### Phase 1: Foundation
Modify the core `generateAdwId()` function in `adws/core/utils.ts` to accept an optional `summary` parameter. When provided, generate a human-readable ID using the slugified summary (max 20 chars) instead of a timestamp. When not provided, fall back to the existing timestamp-based format. Also update the `extractAdwIdFromComment()` regex in `adws/github/workflowCommentsBase.ts` to match both old and new ADW ID formats.

### Phase 2: Core Implementation
Update `initializeWorkflow()` and `initializePRReviewWorkflow()` in `adws/workflowPhases.ts` to accept a nullable `adwId` parameter. When `null`, generate the ADW ID after fetching the issue/PR, using the title as the summary. Then update all orchestrator callers (`adwPlan.tsx`, `adwBuild.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPrReview.tsx`) to pass `null` instead of calling `generateAdwId()` directly (except `adwTest.tsx` which has no issue context).

### Phase 3: Integration
Update all existing tests to work with both old and new ADW ID formats. Add new unit tests for `generateAdwId()` with various summary inputs. Verify that recovery from old-format ADW IDs in GitHub comments still works correctly.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `generateAdwId()` in `adws/core/utils.ts`
- Modify the function signature to accept an optional `summary` parameter: `generateAdwId(summary?: string): string`
- When `summary` is provided and non-empty after slugification:
  - Slugify the summary using the existing `slugify()` function
  - Truncate to 20 characters maximum
  - Remove any trailing hyphen caused by truncation
  - Generate format: `adw-{slugified-summary}-{random}`
- When `summary` is not provided or produces an empty slug:
  - Fall back to existing format: `adw-{timestamp}-{random}`
- The random suffix remains 6 characters of base-36 alphanumeric

### Step 2: Create unit tests for `generateAdwId()` in `adws/__tests__/generateAdwId.test.ts`
- Test that providing a summary produces `adw-{slug}-{random}` format
- Test that the summary portion is max 20 characters
- Test that trailing hyphens from truncation are removed
- Test that special characters are properly slugified
- Test that an empty summary falls back to timestamp format
- Test that no summary parameter falls back to timestamp format
- Test that the random suffix is always 6 alphanumeric characters
- Test uniqueness (two calls with same summary produce different IDs)

### Step 3: Update `extractAdwIdFromComment()` regex in `adws/github/workflowCommentsBase.ts`
- Change the regex from `` /`(adw-\d+-[a-z0-9]+)`/ `` to `` /`(adw-[a-z0-9][a-z0-9-]*[a-z0-9])`/ ``
- This new pattern matches both old format (`adw-1770819277126-v2n6pm`) and new format (`adw-replace-timestamp-v2n6pm`)
- Verify the regex still correctly extracts ADW IDs enclosed in backticks

### Step 4: Update `initializeWorkflow()` in `adws/workflowPhases.ts`
- Change the `adwId` parameter type from `string` to `string | null`
- After fetching the issue (line ~102), resolve the ADW ID: `const resolvedAdwId = adwId ?? generateAdwId(issue.title);`
- Use `resolvedAdwId` throughout the rest of the function instead of `adwId`
- Update the `WorkflowConfig` interface — the `adwId` field remains `string` (it's always resolved by this point)

### Step 5: Update `initializePRReviewWorkflow()` in `adws/workflowPhases.ts`
- Change the `adwId` parameter type from `string` to `string | null`
- After fetching PR details (line ~586), resolve the ADW ID: `const resolvedAdwId = adwId ?? generateAdwId(prDetails.title);`
- Use `resolvedAdwId` throughout the rest of the function

### Step 6: Update orchestrator callers to pass `null` instead of generating ADW IDs directly
- **`adws/adwPlan.tsx`** (line 97): Change `const adwId = providedAdwId || generateAdwId();` to `const adwId = providedAdwId || null;`
- **`adws/adwPlanBuild.tsx`** (line 59): Change `const adwId = args[1] || generateAdwId();` to `const adwId = args[1] || null;`
- **`adws/adwPlanBuildTest.tsx`** (line 63): Change `const adwId = args[1] || generateAdwId();` to `const adwId = args[1] || null;`
- **`adws/adwPrReview.tsx`** (line 43): Change `const adwId = generateAdwId();` to `const adwId = null;` and pass to `initializePRReviewWorkflow(prNumber, adwId);`

### Step 7: Update `adwBuild.tsx` to pass issue title to `generateAdwId()`
- `adwBuild.tsx` does NOT use `initializeWorkflow()` — it has its own initialization
- It already fetches the issue at line 145
- Change line 149 from `const adwId = providedAdwId || generateAdwId();` to `const adwId = providedAdwId || generateAdwId(issue.title);`

### Step 8: Leave `adwTest.tsx` unchanged
- `adwTest.tsx` has no issue context available
- The fallback to timestamp-based ID is appropriate here
- No changes needed

### Step 9: Update existing tests for regex compatibility
- **`adws/__tests__/commentFiltering.test.ts`**: Verify test data with old-format ADW IDs still passes (backwards compatibility)
- **`adws/__tests__/triggerCommentHandling.test.ts`**: Same verification
- **`adws/__tests__/adwPrReview.test.ts`**: Same verification
- Add test cases in relevant test files that use new-format ADW IDs to verify extraction works

### Step 10: Update `adws/__tests__/workflowPhases.test.ts`
- Update mock calls to `initializeWorkflow` and `initializePRReviewWorkflow` to pass `null` as the `adwId` parameter where applicable
- Verify that the functions correctly generate ADW IDs from issue/PR titles

### Step 11: Run Validation Commands
- Run all validation commands below to ensure zero regressions

## Testing Strategy

### Unit Tests
- **`generateAdwId()` tests**: Cover summary-based generation, timestamp fallback, max length enforcement, special character handling, empty/null summary, uniqueness
- **`extractAdwIdFromComment()` tests**: Verify regex matches both old format (`adw-\d+-[a-z0-9]+`) and new format (`adw-{slug}-{random}`)
- **Existing test suites**: Verify all pass without modification (backwards compatibility of regex)

### Integration Tests
- **Workflow initialization tests**: Verify `initializeWorkflow()` correctly generates summary-based ADW IDs when no ID is provided
- **Comment parsing tests**: Verify that recovery from GitHub comments works with both old and new ADW ID formats
- **Branch name generation tests**: Verify the new ADW IDs work correctly in branch name generation flow

### Edge Cases
- Empty issue title → falls back to timestamp-based ID
- Very long issue title (>20 chars) → truncated to 20 chars with clean hyphen handling
- Title with only special characters → produces empty slug → falls back to timestamp
- Title with Unicode characters → slugified to ASCII → truncated
- Recovery from old-format ADW ID in existing GitHub comments → regex still matches
- Two simultaneous workflows on same issue → different random suffixes ensure uniqueness
- Provided ADW ID via CLI (recovery mode) → used as-is, no regeneration

## Acceptance Criteria
- ADW IDs generated from issue titles follow the format `adw-{summary}-{random}` where summary is a max-20-char slugified version of the issue title
- ADW IDs without issue context (e.g., `adwTest.tsx`) fall back to the existing `adw-{timestamp}-{random}` format
- The `extractAdwIdFromComment()` regex matches both old and new ADW ID formats
- All existing tests pass without regressions
- New unit tests cover the `generateAdwId()` function with various inputs
- Recovery from old-format ADW IDs in GitHub comments works correctly
- All orchestrators (`adwPlan`, `adwBuild`, `adwPlanBuild`, `adwPlanBuildTest`, `adwPrReview`) generate summary-based ADW IDs

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `slugify()` function in `adws/core/utils.ts` already handles lowercasing, special character replacement, and leading/trailing hyphen removal. Reuse it for the ADW ID summary and simply truncate to 20 chars.
- Backwards compatibility is critical: old-format ADW IDs (`adw-{timestamp}-{random}`) must still be recognized by `extractAdwIdFromComment()` for workflow recovery from previous runs.
- The `generate_branch_name.md` Claude command does not need changes since it receives the `adw_id` variable and the Claude agent handles formatting.
- No new libraries are required for this feature.
