# Feature: Refactor Codebase to Conform to Coding Guidelines

## Feature Description
Comprehensive codebase refactoring to bring all source files into strict compliance with the coding guidelines in `/guidelines`. This includes removing unused variables and imports, extracting duplicate code (3+ occurrences) into shared modules with strong internal cohesion, reducing oversized files to under 300 lines, eliminating `any` types, and converting imperative loops to declarative patterns. The refactoring covers both the main application (`src/`) and the AI Developer Workflow scripts (`adws/`).

## User Story
As a developer maintaining the Millennium Admin codebase
I want all code to strictly conform to the coding guidelines
So that the codebase is clean, maintainable, modular, and consistent across all modules

## Problem Statement
The codebase has accumulated technical debt in several areas that violate the coding guidelines defined in `guidelines/coding_guidelines.md`:

1. **Oversized files (9 files exceed 300 lines):** `adws/workflowPhases.ts` (1,052 lines), `adws/agents/claudeAgent.ts` (549 lines), `adws/github/worktreeOperations.ts` (514 lines), `adws/healthCheck.tsx` (500 lines), `adws/core/dataTypes.ts` (485 lines), `adws/github/githubApi.ts` (381 lines), `adws/adwBuild.tsx` (348 lines), `adws/core/agentState.ts` (343 lines), `adws/triggers/trigger_webhook.ts` (305 lines).
2. **Duplicated error handling pattern** appearing 5+ times across `src/lib/characters.ts` and `src/lib/connections.ts`.
3. **Duplicated JSON parsing pattern** appearing 4+ times across `adws/agents/testAgent.ts`, `adws/agents/reviewAgent.ts`, and `adws/triggers/issueClassifier.ts`.
4. **Duplicated retry orchestration pattern** in `adws/agents/testRetry.ts` and `adws/agents/reviewRetry.ts`.
5. **Duplicated agent state initialization pattern** appearing 3+ times across workflow phases and retry files.
6. **`any` types** in `adws/agents/claudeAgent.ts` and `adws/github/githubApi.ts`.
7. **Imperative loops** in `src/lib/characters.ts` (`for...of` in `groupCharactersByCategory`) and `adws/agents/testRetry.ts`/`adws/agents/reviewRetry.ts`.
8. **Repeated JSX pattern** in `src/components/EditableCharacterDetails.tsx` (5 identical infobox-row blocks).
9. **Type inconsistencies** in `src/components/ConnectionsTable.tsx` requiring defensive `String()` conversions.

## Solution Statement
Systematically refactor the codebase in phases, starting with shared utility extraction (error handling, JSON parsing, retry logic), then splitting oversized files into focused modules under 300 lines, removing `any` types in favor of proper interfaces, converting imperative loops to declarative patterns, and eliminating repeated JSX through data-driven rendering. All changes preserve existing behavior and maintain test coverage.

## Relevant Files
Use these files to implement the feature:

### src/ Application Files
- **`src/lib/characters.ts`** (182 lines) — Contains duplicated error handling pattern (3 occurrences) and an imperative `for...of` loop in `groupCharactersByCategory`. Image URL transformation duplicated here.
- **`src/lib/connections.ts`** (71 lines) — Contains duplicated error handling pattern (2 occurrences) matching `characters.ts`.
- **`src/lib/supabase.ts`** (72 lines) — Provides `getSupabaseStorageUrl` used in scattered image URL transformations.
- **`src/lib/schema.ts`** (45 lines) — Error detection utilities, review for consistency.
- **`src/components/EditableCharacterDetails.tsx`** (171 lines) — Contains 5 repeated infobox-row JSX blocks that should be data-driven.
- **`src/components/EditableField.tsx`** (142 lines) — Handles 3 input types in one component; extract state logic to custom hook.
- **`src/components/ConnectionsTable.tsx`** (121 lines) — Contains type inconsistency with `String()` conversions and redundant `getConnectedCharacter()` calls.
- **`src/components/CharacterDetails.tsx`** (83 lines) — Review for consistency with refactored patterns.
- **`src/components/CharacterImage.tsx`** (29 lines) — Review for consistency.
- **`src/components/CategorySection.tsx`** (30 lines) — Review for consistency.
- **`src/components/Header.tsx`** (28 lines) — Review for consistency.
- **`src/components/Footer.tsx`** (9 lines) — Review for consistency.
- **`src/components/TableOfContents.tsx`** (22 lines) — Review for consistency.
- **`src/app/page.tsx`** (59 lines) — Review for consistency.
- **`src/app/layout.tsx`** (21 lines) — Review for consistency.
- **`src/app/characters/[id]/page.tsx`** (85 lines) — Review for consistency.
- **`src/app/users/page.tsx`** (49 lines) — Review for consistency.
- **`src/app/settings/page.tsx`** (50 lines) — Review for consistency.
- **`src/app/api/characters/[id]/route.ts`** (72 lines) — Review for consistency.
- **`src/types/character.ts`** (55 lines) — Review for consistency.
- **`src/types/connection.ts`** (13 lines) — Review for consistency.
- **`src/types/database.ts`** (15 lines) — Review for consistency.
- **`src/__tests__/supabase.test.ts`** (166 lines) — Update tests after refactoring lib files.
- **`src/__tests__/app.test.tsx`** (56 lines) — Update tests after refactoring components.

### adws/ AI Developer Workflow Files
- **`adws/workflowPhases.ts`** (1,052 lines) — CRITICAL: Must split into separate phase files. Contains plan, build, test, PR, and review phase execution.
- **`adws/agents/claudeAgent.ts`** (549 lines) — CRITICAL: Must split into agent execution, JSONL parsing, and token management. Contains `any` types.
- **`adws/github/worktreeOperations.ts`** (514 lines) — CRITICAL: Must split into worktree creation, cleanup, and branch checkout modules.
- **`adws/healthCheck.tsx`** (500 lines) — CRITICAL: Must split into health check sections.
- **`adws/core/dataTypes.ts`** (485 lines) — CRITICAL: Must split by domain (issue types, agent types, workflow types).
- **`adws/github/githubApi.ts`** (381 lines) — CRITICAL: Must split into issue API, PR API, and comment API. Contains `any` types.
- **`adws/adwBuild.tsx`** (348 lines) — Must reduce below 300 lines.
- **`adws/core/agentState.ts`** (343 lines) — Must reduce below 300 lines by extracting state helpers.
- **`adws/triggers/trigger_webhook.ts`** (305 lines) — Must reduce below 300 lines by extracting event handlers.
- **`adws/agents/testAgent.ts`** (291 lines) — Contains duplicated JSON parsing pattern.
- **`adws/agents/testRetry.ts`** (183 lines) — Contains duplicated retry orchestration and imperative loops.
- **`adws/agents/reviewAgent.ts`** (112 lines) — Contains duplicated JSON parsing pattern.
- **`adws/agents/reviewRetry.ts`** (100 lines) — Contains duplicated retry orchestration pattern.
- **`adws/agents/gitAgent.ts`** (139 lines) — Contains duplicated text extraction pattern.
- **`adws/agents/buildAgent.ts`** (98 lines) — Review for consistency.
- **`adws/agents/planAgent.ts`** (140 lines) — Review for consistency.
- **`adws/agents/patchAgent.ts`** (64 lines) — Review for consistency.
- **`adws/core/utils.ts`** (128 lines) — Target for new shared utilities.
- **`adws/core/config.ts`** (48 lines) — Review for consistency.
- **`adws/core/orchestratorLib.ts`** (55 lines) — Review for consistency.
- **`adws/core/costReport.ts`** (162 lines) — Review for consistency.
- **`adws/core/costPricing.ts`** (52 lines) — Review for consistency.
- **`adws/core/costTypes.ts`** (46 lines) — Review for consistency.
- **`adws/github/gitOperations.ts`** (229 lines) — Review for consistency.
- **`adws/github/workflowCommentsBase.ts`** (181 lines) — Review for consistency.
- **`adws/github/workflowCommentsIssue.ts`** (163 lines) — Review for consistency.
- **`adws/github/workflowCommentsPR.ts`** (93 lines) — Review for consistency.
- **`adws/github/workflowComments.ts`** (37 lines) — Review for consistency.
- **`adws/github/prCommentDetector.ts`** (99 lines) — Review for consistency.
- **`adws/github/pullRequestCreator.ts`** (93 lines) — Review for consistency.
- **`adws/triggers/issueClassifier.ts`** (285 lines) — Contains duplicated JSON parsing pattern.
- **`adws/triggers/trigger_cron.ts`** (121 lines) — Review for consistency.
- **`adws/adwPlanBuildTestReview.tsx`** (119 lines) — Review for consistency.
- **`adws/adwPlanBuildTest.tsx`** (107 lines) — Review for consistency.
- **`adws/adwPlanBuild.tsx`** (94 lines) — Review for consistency.
- **`adws/adwPlan.tsx`** (113 lines) — Review for consistency.
- **`adws/adwTest.tsx`** (202 lines) — Review for consistency.
- **`adws/adwPrReview.tsx`** (54 lines) — Review for consistency.
- **`adws/adwClearComments.tsx`** (99 lines) — Review for consistency.
- **`adws/index.ts`** (129 lines) — Update barrel exports after file splits.
- **`adws/agents/index.ts`** (78 lines) — Update barrel exports after file splits.
- **`adws/core/index.ts`** (88 lines) — Update barrel exports after file splits.
- **`adws/github/index.ts`** (87 lines) — Update barrel exports after file splits.

### Guidelines
- **`guidelines/coding_guidelines.md`** — The source of truth for all refactoring decisions.

### New Files
- **`src/lib/errors.ts`** — Shared error handling utility for database operations (extracted from characters.ts/connections.ts).
- **`adws/core/jsonParser.ts`** — Shared JSON extraction/parsing utility (extracted from testAgent, reviewAgent, issueClassifier).
- **`adws/core/retryOrchestrator.ts`** — Generic retry-with-resolution orchestration logic (extracted from testRetry, reviewRetry).
- **`adws/core/stateHelpers.ts`** — Agent state initialization helpers (extracted from agentState.ts and workflowPhases.ts).
- **`adws/phases/planPhase.ts`** — Plan phase execution (extracted from workflowPhases.ts).
- **`adws/phases/buildPhase.ts`** — Build phase execution (extracted from workflowPhases.ts).
- **`adws/phases/testPhase.ts`** — Test phase execution (extracted from workflowPhases.ts).
- **`adws/phases/prPhase.ts`** — PR creation phase execution (extracted from workflowPhases.ts).
- **`adws/phases/reviewPhase.ts`** — Review phase execution (extracted from workflowPhases.ts).
- **`adws/phases/index.ts`** — Barrel export for phases module.
- **`adws/agents/jsonlParser.ts`** — JSONL stream parsing (extracted from claudeAgent.ts).
- **`adws/agents/tokenManager.ts`** — Token computation and management (extracted from claudeAgent.ts).
- **`adws/github/issueApi.ts`** — Issue-related GitHub API functions (extracted from githubApi.ts).
- **`adws/github/prApi.ts`** — PR-related GitHub API functions (extracted from githubApi.ts).
- **`adws/github/worktreeCreation.ts`** — Worktree creation and setup (extracted from worktreeOperations.ts).
- **`adws/github/worktreeCleanup.ts`** — Worktree cleanup and removal (extracted from worktreeOperations.ts).
- **`adws/core/issueTypes.ts`** — Issue-related type definitions (extracted from dataTypes.ts).
- **`adws/core/agentTypes.ts`** — Agent-related type definitions (extracted from dataTypes.ts).
- **`adws/core/workflowTypes.ts`** — Workflow-related type definitions (extracted from dataTypes.ts).

## Implementation Plan

### Phase 1: Foundation — Extract Shared Utilities
Extract duplicated patterns into shared modules to establish the foundation all subsequent refactoring depends on.

1. **Create `src/lib/errors.ts`** — Extract the repeated try-catch error re-throw pattern from `characters.ts` and `connections.ts` into a reusable `handleDatabaseError(err: unknown, operation: string)` function.
2. **Create `adws/core/jsonParser.ts`** — Extract the repeated JSON-from-output parsing pattern from `testAgent.ts`, `reviewAgent.ts`, and `issueClassifier.ts` into a generic `extractJsonFromOutput<T>(output: string): T | null` function.
3. **Create `adws/core/retryOrchestrator.ts`** — Extract the retry-with-resolution loop from `testRetry.ts` and `reviewRetry.ts` into a generic orchestrator.
4. **Create `adws/core/stateHelpers.ts`** — Extract agent state initialization boilerplate from `workflowPhases.ts` and retry files.

### Phase 2: Core Implementation — Split Oversized Files
Decompose all 9 files exceeding 300 lines into focused, single-responsibility modules.

1. **Split `adws/workflowPhases.ts`** (1,052 → 5 phase files ~150-200 lines each) into `adws/phases/planPhase.ts`, `buildPhase.ts`, `testPhase.ts`, `prPhase.ts`, `reviewPhase.ts`, plus barrel export.
2. **Split `adws/agents/claudeAgent.ts`** (549 → 3 files) into core agent execution, `jsonlParser.ts` for JSONL stream parsing, and `tokenManager.ts` for token computation.
3. **Split `adws/github/worktreeOperations.ts`** (514 → 2 files) into `worktreeCreation.ts` and `worktreeCleanup.ts`, keeping the original as a slim barrel/shared-types file.
4. **Split `adws/healthCheck.tsx`** (500 → 2-3 files) into logical health check sections.
5. **Split `adws/core/dataTypes.ts`** (485 → 3 files) into `issueTypes.ts`, `agentTypes.ts`, and `workflowTypes.ts`.
6. **Split `adws/github/githubApi.ts`** (381 → 2 files) into `issueApi.ts` and `prApi.ts`.
7. **Reduce `adws/adwBuild.tsx`** (348 → under 300) by extracting helper logic.
8. **Reduce `adws/core/agentState.ts`** (343 → under 300) by moving initialization helpers to `stateHelpers.ts`.
9. **Reduce `adws/triggers/trigger_webhook.ts`** (305 → under 300) by extracting event handler functions.

### Phase 3: Integration — Clean Up Application Code and Fix Violations
Apply targeted fixes across all remaining files for guideline compliance.

1. **Refactor `src/lib/characters.ts`** — Replace duplicated error handling with `errors.ts` utility; convert `for...of` loop in `groupCharactersByCategory` to `reduce()`.
2. **Refactor `src/lib/connections.ts`** — Replace duplicated error handling with `errors.ts` utility.
3. **Refactor `src/components/EditableCharacterDetails.tsx`** — Replace 5 repeated infobox-row JSX blocks with a field configuration array and `.map()` rendering.
4. **Refactor `src/components/EditableField.tsx`** — Extract editing state logic into a `useEditableField` custom hook in `src/hooks/useEditableField.ts`.
5. **Refactor `src/components/ConnectionsTable.tsx`** — Fix type inconsistency by ensuring consistent ID types; eliminate redundant `String()` conversions; memoize `getConnectedCharacter()` results.
6. **Eliminate `any` types in `adws/agents/claudeAgent.ts`** — Replace with proper discriminated union types for JSONL message blocks.
7. **Eliminate `any` types in `adws/github/githubApi.ts`** — Create proper GitHub API response interfaces.
8. **Refactor `adws/agents/testAgent.ts`** — Use shared `jsonParser.ts` utility.
9. **Refactor `adws/agents/reviewAgent.ts`** — Use shared `jsonParser.ts` utility.
10. **Refactor `adws/triggers/issueClassifier.ts`** — Use shared `jsonParser.ts` utility.
11. **Refactor `adws/agents/testRetry.ts`** — Use shared `retryOrchestrator.ts`; convert imperative loops to declarative.
12. **Refactor `adws/agents/reviewRetry.ts`** — Use shared `retryOrchestrator.ts`; convert imperative loops to declarative.
13. **Update all barrel exports** (`adws/index.ts`, `adws/agents/index.ts`, `adws/core/index.ts`, `adws/github/index.ts`) to reflect new file structure.
14. **Run full lint, build, and test** to validate zero regressions.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create shared error handling utility for src/
- Create `src/lib/errors.ts` with a `handleDatabaseError(err: unknown, operation: string): never` function.
- The function should re-throw known errors (those starting with `Failed to`) and wrap unknown errors with a descriptive message.
- This consolidates the identical try-catch pattern found 5 times across `src/lib/characters.ts` and `src/lib/connections.ts`.

### Step 2: Refactor `src/lib/characters.ts` to use shared error utility
- Import `handleDatabaseError` from `src/lib/errors.ts`.
- Replace all 3 try-catch error blocks in `fetchAllCharacters()`, `fetchCharacterById()`, and `updateCharacter()` with calls to `handleDatabaseError()`.
- Convert the `for...of` loop in `groupCharactersByCategory()` to a `reduce()` call for declarative style.
- Verify all imports are used; remove any that are not.

### Step 3: Refactor `src/lib/connections.ts` to use shared error utility
- Import `handleDatabaseError` from `src/lib/errors.ts`.
- Replace both try-catch error blocks in `fetchAllConnections()` and `fetchConnectionsByCharacter()` with calls to `handleDatabaseError()`.
- Verify all imports are used; remove any that are not.

### Step 4: Refactor `src/components/EditableCharacterDetails.tsx` to eliminate repeated JSX
- Define a field configuration array (e.g., `EDITABLE_FIELDS`) with label, field name, type, and options for each of the 5 repeated infobox-row blocks.
- Replace the 5 repeated JSX blocks with a single `.map()` over the configuration array.
- Verify the component renders identically.

### Step 5: Refactor `src/components/ConnectionsTable.tsx` to fix type inconsistency
- Ensure character IDs are consistently typed (number or string) at the boundary.
- Remove defensive `String()` conversions by ensuring types match.
- Pre-compute `getConnectedCharacter()` results before sort and reuse them in rendering to avoid redundant calls.

### Step 6: Create `adws/core/jsonParser.ts` shared utility
- Create a generic `extractJson<T>(output: string): T | null` function that:
  1. Tries `JSON.parse(output)` directly.
  2. Falls back to regex extraction of JSON objects/arrays from mixed output.
  3. Returns `null` on failure.
- Also create `extractJsonArray<T>(output: string): T[]` for array results.
- This consolidates the identical pattern from `testAgent.ts`, `reviewAgent.ts`, and `issueClassifier.ts`.

### Step 7: Refactor `adws/agents/testAgent.ts` to use shared JSON parser
- Import `extractJson` and `extractJsonArray` from `adws/core/jsonParser.ts`.
- Replace `parseTestResults()` and `parseE2ETestResult()` with calls to the shared utility.
- Remove the now-unused local parsing functions.

### Step 8: Refactor `adws/agents/reviewAgent.ts` to use shared JSON parser
- Import `extractJson` from `adws/core/jsonParser.ts`.
- Replace `parseReviewResult()` with a call to the shared utility.
- Remove the now-unused local parsing function.

### Step 9: Refactor `adws/triggers/issueClassifier.ts` to use shared JSON parser
- Import `extractJson` from `adws/core/jsonParser.ts`.
- Replace `parseAdwClassificationOutput()` with a call to the shared utility.
- Remove the now-unused local parsing function.

### Step 10: Create `adws/core/retryOrchestrator.ts` shared retry utility
- Extract the common retry-with-resolution loop from `testRetry.ts` and `reviewRetry.ts` into a generic function.
- The function should accept: max retries, a run function, a failure extractor, a resolution function, and cost tracking callbacks.
- Use declarative patterns (`.map()`, `Promise.all` where safe) instead of imperative loops.

### Step 11: Refactor `adws/agents/testRetry.ts` and `adws/agents/reviewRetry.ts` to use shared retry orchestrator
- Replace the manual retry loops in both files with calls to the shared `retryOrchestrator`.
- Convert remaining imperative `for...of` loops over failed tests to declarative `.map()` or `for...of` with `await` as appropriate for sequential processing.

### Step 12: Split `adws/core/dataTypes.ts` (485 lines) into domain-specific type files
- Create `adws/core/issueTypes.ts` with issue-related interfaces and types.
- Create `adws/core/agentTypes.ts` with agent-related interfaces and types.
- Create `adws/core/workflowTypes.ts` with workflow and orchestration-related interfaces and types.
- Keep `adws/core/dataTypes.ts` as a slim barrel export re-exporting all types for backward compatibility.
- Each new file must be under 300 lines.

### Step 13: Split `adws/workflowPhases.ts` (1,052 lines) into per-phase files
- Create `adws/phases/` directory.
- Create `adws/phases/planPhase.ts` — Extract `executePlanPhase()` and its helpers.
- Create `adws/phases/buildPhase.ts` — Extract `executeBuildPhase()` and its helpers.
- Create `adws/phases/testPhase.ts` — Extract `executeTestPhase()` and its helpers.
- Create `adws/phases/prPhase.ts` — Extract `executePRPhase()` and its helpers.
- Create `adws/phases/reviewPhase.ts` — Extract `executeReviewPhase()` and its helpers.
- Create `adws/phases/index.ts` — Barrel export all phases.
- Update `adws/workflowPhases.ts` to re-export from the phases directory for backward compatibility.
- Each new file must be under 300 lines.

### Step 14: Split `adws/agents/claudeAgent.ts` (549 lines) into focused modules
- Create `adws/agents/jsonlParser.ts` — Extract JSONL stream parsing logic.
- Create `adws/agents/tokenManager.ts` — Extract token computation and tracking logic.
- Keep `adws/agents/claudeAgent.ts` as the core agent execution module.
- Replace all `any` types with proper discriminated union interfaces (e.g., `JsonlMessage`, `ContentBlock`).
- Each file must be under 300 lines.

### Step 15: Split `adws/github/worktreeOperations.ts` (514 lines) into focused modules
- Create `adws/github/worktreeCreation.ts` — Extract worktree creation and setup functions.
- Create `adws/github/worktreeCleanup.ts` — Extract worktree cleanup and removal functions.
- Keep `adws/github/worktreeOperations.ts` as a slim barrel export.
- Each file must be under 300 lines.

### Step 16: Split `adws/github/githubApi.ts` (381 lines) into focused modules
- Create `adws/github/issueApi.ts` — Extract issue fetching and transformation functions.
- Create `adws/github/prApi.ts` — Extract PR fetching and transformation functions.
- Keep `adws/github/githubApi.ts` as a slim barrel export.
- Replace all `any` types with proper GitHub API response interfaces.
- Each file must be under 300 lines.

### Step 17: Reduce `adws/healthCheck.tsx` (500 lines) below 300 lines
- Extract logical health check sections into helper modules or inline helper files.
- Each resulting file must be under 300 lines.

### Step 18: Reduce `adws/adwBuild.tsx` (348 lines) below 300 lines
- Extract helper functions or configuration into a separate helper file.
- The main file must be under 300 lines.

### Step 19: Reduce `adws/core/agentState.ts` (343 lines) below 300 lines
- Extract state initialization helpers to `adws/core/stateHelpers.ts`.
- The main file must be under 300 lines.

### Step 20: Reduce `adws/triggers/trigger_webhook.ts` (305 lines) below 300 lines
- Extract event handler functions into a separate module.
- The main file must be under 300 lines.

### Step 21: Update all barrel exports
- Update `adws/index.ts` to include new modules.
- Update `adws/agents/index.ts` to export new agent sub-modules.
- Update `adws/core/index.ts` to export new core sub-modules (`jsonParser`, `retryOrchestrator`, `stateHelpers`, domain type files).
- Update `adws/github/index.ts` to export new GitHub sub-modules.
- Ensure backward compatibility — all existing imports from barrel files continue to work.

### Step 22: Final sweep — remove all unused variables, imports, and dead code
- Run ESLint with `--fix` across the entire codebase to auto-fix unused imports and variables.
- Manually review any remaining warnings.
- Verify no `any` types remain in the codebase.
- Verify no file exceeds 300 lines.
- Verify all duplicate patterns (3+ occurrences) have been consolidated.

### Step 23: Update tests to reflect refactored code
- Update `src/__tests__/supabase.test.ts` if any lib function signatures changed.
- Update `src/__tests__/app.test.tsx` if any component imports changed.
- Update all `adws/__tests__/*.test.ts` files to import from new module locations.
- Ensure all existing tests still pass with the refactored code.

### Step 24: Run validation commands
- Run `npm run lint` to verify zero lint errors.
- Run `npm run build` to verify zero build errors.
- Run `npm test` to verify all tests pass with zero regressions.

## Testing Strategy

### Unit Tests
- Update existing tests in `src/__tests__/` to verify refactored library functions (`errors.ts`, `characters.ts`, `connections.ts`) produce identical results.
- Update existing tests in `adws/__tests__/` to verify refactored modules (split files, shared utilities) produce identical results.
- Add tests for new shared utilities: `src/lib/errors.ts`, `adws/core/jsonParser.ts`, `adws/core/retryOrchestrator.ts`.

### Integration Tests
- Verify all barrel exports resolve correctly after file splits.
- Verify all workflow orchestrators (`adwPlanBuildTestReview.tsx`, etc.) still function with the split phase files.
- Verify the Next.js build completes successfully, confirming all component imports resolve.

### Edge Cases
- Ensure `handleDatabaseError` correctly re-throws known errors and wraps unknown errors.
- Ensure `extractJson` handles malformed JSON, empty strings, and mixed content with embedded JSON.
- Ensure backward-compatible barrel exports don't create circular dependencies.
- Ensure split files don't break dynamic imports or lazy loading.

## Acceptance Criteria
- All files in `src/` and `adws/` are under 300 lines.
- Zero `any` types remain in production code (test files excluded if mocking requires it).
- Zero unused variables or imports across the codebase.
- All duplicated code patterns occurring 3+ times have been extracted to shared modules.
- Imperative loops (`for`, `while`) replaced with declarative alternatives where applicable.
- All existing tests pass without modification to test assertions (only import paths may change).
- `npm run lint` passes with zero errors.
- `npm run build` succeeds with zero errors.
- `npm test` passes with zero failures.
- The refactoring introduces no new behavior — all changes are purely structural.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This is a pure refactoring task — no new features or behavior changes are introduced. Every change must preserve existing functionality.
- When splitting files, always create a backward-compatible barrel export in the original file location to avoid breaking downstream imports.
- Prioritize internal cohesion when deciding where to place extracted code — group by domain responsibility, not by technical layer.
- The `adws/` directory has 26 test files in `adws/__tests__/` that must all continue to pass.
- The `src/` directory has 2 test files that must continue to pass.
- When creating new shared utilities, prefer adding to existing modules that handle similar functionality (e.g., add error utilities to `src/lib/`, add parsing utilities to `adws/core/`) rather than creating entirely new directories.
- The `adws/phases/` directory is a new directory — this is the one exception where a new directory is warranted given the 1,052-line `workflowPhases.ts` file needs to be split into 5+ files.
