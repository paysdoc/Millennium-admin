# Feature: Refactor Codebase to Conform to Coding Guidelines

## Feature Description
Refactor the entire codebase to strictly conform to the coding guidelines in `/guidelines/coding_guidelines.md`. This includes removing all unused variables and imports, extracting duplicate code that occurs 3 or more times into shared modules (preferring existing modules with similar functionality for internal cohesion), and reducing file sizes to comply with the 150-line guideline. The refactoring covers both the `src/` (Next.js application) and `adws/` (AI Developer Workflow Scripts) directories.

## User Story
As a developer
I want the codebase to strictly conform to the coding guidelines
So that the code is clean, maintainable, modular, and free of duplication

## Problem Statement
The codebase has accumulated several violations of the coding guidelines:
1. **Duplicate code patterns** appear 3+ times across files (database error handling in `src/lib/`, CLI argument parsing in 8 `adws/` orchestrators, progress callback setup, agent state initialization)
2. **Files exceeding 150 lines**: `src/lib/characters.ts` (183), `src/components/EditableCharacterDetails.tsx` (172), `src/app/globals.css` (577), `adws/workflowPhases.ts` (970), `adws/github/worktreeOperations.ts` (514), `adws/healthCheck.tsx` (500), `adws/agents/claudeAgent.ts` (438), `adws/github/githubApi.ts` (381), `adws/adwBuild.tsx` (346), `adws/triggers/trigger_webhook.ts` (305), `adws/triggers/issueClassifier.ts` (285), `adws/core/agentState.ts` (274), `adws/github/gitOperations.ts` (229), `adws/adwTest.tsx` (195), `adws/agents/testRetry.ts` (178), `adws/core/dataTypes.ts` (467)
3. **Functional programming violations**: `for`/`while` loops used instead of `.map()`, `.filter()`, `.reduce()`; mutable state in callbacks; data mutation in conditionals
4. **TypeScript violations**: `any` type used 9 times in `adws/github/githubApi.ts`; `args.splice()` mutating function parameters
5. **Code hygiene**: Repeated error-handling boilerplate, image URL enrichment logic duplicated, category sorting logic not shared

## Solution Statement
Systematically refactor the codebase in phases:
1. **Phase 1 (Foundation)**: Create shared utility modules to house extracted duplicate code — database error handlers, CLI argument parsing, character image enrichment, category sorting utilities, and a retry abstraction.
2. **Phase 2 (Core Implementation)**: Refactor all files to use the new shared modules, replace imperative loops with functional constructs, eliminate `any` types, and split oversized files into focused sub-modules.
3. **Phase 3 (Integration)**: Split the large CSS file, ensure all tests pass, and verify zero regressions via lint, build, and test commands.

## Relevant Files
Use these files to implement the feature:

### src/ Application Files
- `src/lib/characters.ts` (183 lines) — Contains duplicate error handling pattern, `for` loop in `groupCharactersByCategory`, duplicate image URL enrichment. Needs splitting and refactoring.
- `src/lib/connections.ts` (72 lines) — Contains identical error handling pattern as characters.ts. Needs to use shared error handler.
- `src/lib/schema.ts` (46 lines) — Contains `isTableNotFoundError` used by error handling. No changes needed.
- `src/lib/supabase.ts` (73 lines) — Contains `getSupabaseStorageUrl` used for image enrichment. No changes needed.
- `src/components/EditableCharacterDetails.tsx` (172 lines) — Exceeds 150-line limit. Repetitive `infobox-row` JSX pattern. Needs extraction of row component.
- `src/components/EditableField.tsx` (143 lines) — Deep nesting with 3 conditional branches for field types. Extract sub-components.
- `src/components/ConnectionsTable.tsx` (122 lines) — Category sorting logic that could be shared. `getConnectedCharacter` called 3 times redundantly.
- `src/components/CharacterDetails.tsx` (84 lines) — Uses image URL construction that duplicates enrichment logic.
- `src/app/api/characters/[id]/route.ts` (73 lines) — `for` loop mutating `updateData`; should use `.reduce()`.
- `src/app/globals.css` (577 lines) — Far exceeds 150 lines. Must be split into focused CSS modules.
- `src/app/page.tsx` (60 lines) — Clean, no issues.
- `src/app/layout.tsx` (22 lines) — Clean, no issues.
- `src/app/characters/[id]/page.tsx` (86 lines) — Clean, no issues.
- `src/app/settings/page.tsx` (51 lines) — Clean, no issues.
- `src/app/users/page.tsx` (50 lines) — Clean, no issues.
- `src/types/character.ts` (56 lines) — Clean, no issues.
- `src/types/connection.ts` (14 lines) — Clean, no issues.
- `src/types/database.ts` (16 lines) — Clean, no issues.
- `src/__tests__/app.test.tsx` (57 lines) — Clean, no issues.
- `src/__tests__/supabase.test.ts` (167 lines) — Slightly over 150 lines but acceptable for test files. May need minor split.

### adws/ Workflow Files
- `adws/workflowPhases.ts` (970 lines) — CRITICAL: 6.5x over limit. Must be split by phase into separate modules.
- `adws/github/githubApi.ts` (381 lines) — Contains 9 `any` type violations. Needs proper TypeScript interfaces.
- `adws/agents/claudeAgent.ts` (438 lines) — Oversized. `parseJsonlOutput` mutates parameters. Needs splitting.
- `adws/github/worktreeOperations.ts` (514 lines) — Oversized. Array mutations with `.push()`.
- `adws/healthCheck.tsx` (500 lines) — Oversized. `for` loops with array mutations. Needs splitting.
- `adws/adwBuild.tsx` (346 lines) — Contains `parseArguments`/`printUsageAndExit` duplicated across 8 files. `args.splice()` mutates parameter.
- `adws/adwPlan.tsx` (112 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwPlanBuild.tsx` (84 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwPlanBuildTest.tsx` (93 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwPlanBuildTestReview.tsx` (100 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwTest.tsx` (195 lines) — Oversized. Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwPrReview.tsx` (54 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`.
- `adws/adwClearComments.tsx` (99 lines) — Contains duplicate `parseArguments`/`printUsageAndExit`. `for` loop with mutable counters.
- `adws/core/agentState.ts` (274 lines) — Oversized. Consider splitting file I/O from state logic.
- `adws/core/dataTypes.ts` (467 lines) — Oversized type definitions file. Split by domain.
- `adws/triggers/trigger_webhook.ts` (305 lines) — Oversized. Array mutation with `.push()` in event handler.
- `adws/triggers/issueClassifier.ts` (285 lines) — Oversized. Consider splitting classification logic from API interaction.
- `adws/github/gitOperations.ts` (229 lines) — Oversized. Consider splitting by operation type.
- `adws/agents/testRetry.ts` (178 lines) — `while` loops with mutable state. Needs functional refactor.
- `adws/agents/reviewRetry.ts` (98 lines) — `while` loop with mutable counter.

### New Files
- `src/lib/dbErrorHandler.ts` — Shared database error handling utility (extracted from characters.ts and connections.ts)
- `src/lib/characterTransform.ts` — Character image enrichment utilities (extracted from characters.ts)
- `src/lib/categoryUtils.ts` — Category sorting utilities (extracted from ConnectionsTable.tsx and characters.ts)
- `src/components/EditableFieldInput.tsx` — Text input sub-component (extracted from EditableField.tsx)
- `src/components/EditableFieldTextarea.tsx` — Textarea sub-component (extracted from EditableField.tsx)
- `src/components/EditableFieldSelect.tsx` — Select sub-component (extracted from EditableField.tsx)
- `src/components/InfoboxRow.tsx` — Reusable infobox row component (extracted from EditableCharacterDetails.tsx)
- `src/styles/base.css` — Base/global styles (extracted from globals.css)
- `src/styles/character.css` — Character detail styles (extracted from globals.css)
- `src/styles/forms.css` — Editable field and form styles (extracted from globals.css)
- `adws/core/cliUtils.ts` — Shared CLI argument parsing and usage utilities (extracted from 8 orchestrator files)
- `adws/core/githubApiTypes.ts` — TypeScript interfaces for GitHub API responses (extracted from githubApi.ts)
- `adws/core/retryUtils.ts` — Shared retry loop abstraction (extracted from testRetry.ts and reviewRetry.ts)
- `adws/phases/planPhase.ts` — Plan phase logic (extracted from workflowPhases.ts)
- `adws/phases/buildPhase.ts` — Build phase logic (extracted from workflowPhases.ts)
- `adws/phases/testPhase.ts` — Test phase logic (extracted from workflowPhases.ts)
- `adws/phases/reviewPhase.ts` — Review phase logic (extracted from workflowPhases.ts)
- `adws/phases/prPhase.ts` — PR phase logic (extracted from workflowPhases.ts)
- `adws/phases/phaseUtils.ts` — Shared phase utilities (extracted from workflowPhases.ts)
- `adws/healthCheck/envChecks.ts` — Environment variable checks (extracted from healthCheck.tsx)
- `adws/healthCheck/serviceChecks.ts` — Service health checks (extracted from healthCheck.tsx)
- `adws/github/apiTransformers.ts` — GitHub API response transformers with proper types (extracted from githubApi.ts)

## Implementation Plan
### Phase 1: Foundation
Create shared utility modules that will house the extracted duplicate code. These modules must be created first because all subsequent refactoring steps depend on them. Focus on internal cohesion: group related functionality into modules that handle a single concern.

**src/ shared modules:**
1. `src/lib/dbErrorHandler.ts` — A generic database error handler that encapsulates the table-not-found check and error-throw pattern used across `characters.ts` and `connections.ts`.
2. `src/lib/characterTransform.ts` — Character image enrichment utility that wraps `getSupabaseStorageUrl` for character objects, eliminating 4 duplicate `.map()` calls.
3. `src/lib/categoryUtils.ts` — Category index lookup and comparison functions used by both `ConnectionsTable.tsx` and `characters.ts`.
4. CSS module files (`src/styles/base.css`, `src/styles/character.css`, `src/styles/forms.css`) — Split the 577-line `globals.css` into focused modules.

**adws/ shared modules:**
1. `adws/core/cliUtils.ts` — Shared `parseArguments()` and `printUsageAndExit()` with configurable script name and argument patterns.
2. `adws/core/githubApiTypes.ts` — Proper TypeScript interfaces for all GitHub API response shapes, replacing `any`.
3. `adws/core/retryUtils.ts` — A functional retry abstraction using recursion instead of `while` loops.
4. `adws/phases/` directory — Phase modules extracted from the 970-line `workflowPhases.ts`.

### Phase 2: Core Implementation
Refactor existing files to use the new shared modules:

**src/ refactoring:**
1. Refactor `src/lib/characters.ts` to use `dbErrorHandler` and `characterTransform`, replace `for` loop with `.reduce()`.
2. Refactor `src/lib/connections.ts` to use `dbErrorHandler`.
3. Refactor `src/app/api/characters/[id]/route.ts` to replace `for` loop with `.reduce()`.
4. Split `EditableField.tsx` into sub-components (`EditableFieldInput`, `EditableFieldTextarea`, `EditableFieldSelect`).
5. Extract `InfoboxRow` component from `EditableCharacterDetails.tsx` to reduce repetition and file size.
6. Refactor `ConnectionsTable.tsx` to use `categoryUtils` and memoize `getConnectedCharacter` lookups.
7. Split `globals.css` and import the new CSS modules from `layout.tsx`.

**adws/ refactoring:**
1. Refactor all 8 orchestrator files (`adwBuild.tsx`, `adwPlan.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlanBuildTestReview.tsx`, `adwTest.tsx`, `adwPrReview.tsx`, `adwClearComments.tsx`) to use shared `cliUtils`.
2. Split `workflowPhases.ts` into `phases/planPhase.ts`, `phases/buildPhase.ts`, `phases/testPhase.ts`, `phases/reviewPhase.ts`, `phases/prPhase.ts`, and `phases/phaseUtils.ts`.
3. Refactor `githubApi.ts` to use proper TypeScript interfaces from `githubApiTypes.ts`, and extract transformers to `apiTransformers.ts`.
4. Refactor `testRetry.ts` and `reviewRetry.ts` to use `retryUtils` with recursive functional pattern.
5. Refactor `healthCheck.tsx` by splitting into `healthCheck/envChecks.ts` and `healthCheck/serviceChecks.ts`.
6. Replace `for` loops with functional constructs in `adwClearComments.tsx`, `healthCheck.tsx`, `claudeAgent.ts`.
7. Eliminate `args.splice()` mutations in CLI parsing by using immutable array operations.

### Phase 3: Integration
1. Update all imports across the codebase to point to new module locations.
2. Update `layout.tsx` to import the new CSS module files instead of the monolithic `globals.css`.
3. Run `npm run lint` and fix any linting issues introduced by the refactoring.
4. Run `npm run build` and fix any build errors.
5. Run `npm test` and fix any test failures.
6. Verify that `workflowPhases.ts` re-exports all phase functions for backward compatibility.
7. Ensure all adws orchestrator scripts still execute correctly.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Create `src/lib/dbErrorHandler.ts` — Shared Database Error Handler
- Extract the repeated error-handling pattern from `src/lib/characters.ts` (lines 26-34, 66-78) and `src/lib/connections.ts` (lines 16-24, 52-60).
- Create a pure function `handleSupabaseQueryError` that takes the Supabase error, a context label (e.g. `'characters'`), and a fallback return value.
- Create a pure function `wrapDatabaseCall` that encapsulates the try/catch with re-throw pattern used in all 4 database functions.
- Ensure the module is under 150 lines.

### Step 2: Create `src/lib/characterTransform.ts` — Character Image Enrichment
- Extract the image URL enrichment pattern from `src/lib/characters.ts` (lines 37-38, 84-85).
- Create `enrichCharacterWithImageUrl(character: Character): Character` — applies `getSupabaseStorageUrl` to a single character.
- Create `enrichCharacterListWithImageUrls(characters: Character[]): Character[]` — maps enrichment over an array.
- Keep functions pure: no side effects, return new objects.

### Step 3: Create `src/lib/categoryUtils.ts` — Category Sorting Utilities
- Extract category index lookup from `src/components/ConnectionsTable.tsx` (lines 54-62).
- Create `getCategoryIndex(category: string): number` — returns the index in `CATEGORY_ORDER` or `CATEGORY_ORDER.length` for unknown categories.
- Create `compareByCategoryThenName(a: Character, b: Character): number` — comparison function for sorting.
- Refactor `groupCharactersByCategory` in `characters.ts` to use `.reduce()` instead of `for` loop, leveraging these utilities.

### Step 4: Refactor `src/lib/characters.ts` — Use Shared Modules
- Replace inline error handling with calls to `dbErrorHandler`.
- Replace inline image URL enrichment with calls to `characterTransform`.
- Refactor `groupCharactersByCategory` to use `CATEGORY_ORDER.reduce()` instead of `for...of`.
- Target: under 100 lines.

### Step 5: Refactor `src/lib/connections.ts` — Use Shared Error Handler
- Replace inline error handling with calls to `dbErrorHandler`.
- Target: under 50 lines.

### Step 6: Refactor `src/app/api/characters/[id]/route.ts` — Replace For Loop
- Replace the `for (const field of allowedFields)` mutation loop (lines 38-42) with `allowedFields.reduce()` to build `updateData` immutably.

### Step 7: Create Sub-Components for `EditableField.tsx`
- Create `src/components/EditableFieldInput.tsx` — handles text input rendering.
- Create `src/components/EditableFieldTextarea.tsx` — handles textarea rendering.
- Create `src/components/EditableFieldSelect.tsx` — handles select rendering.
- Refactor `EditableField.tsx` to delegate to these sub-components, eliminating deep nesting.
- Each sub-component should accept shared props for `value`, `onChange`, `onBlur`, `onKeyDown`, `className`, `placeholder`, `label`, `fieldName`, and `inputRef`.

### Step 8: Create `src/components/InfoboxRow.tsx` and Refactor `EditableCharacterDetails.tsx`
- Extract the repeated `infobox-row` pattern (6 repetitions in lines 79-153) into a reusable `InfoboxRow` component.
- `InfoboxRow` accepts `label`, `fieldName`, `value`, `onChange`, `type?`, `placeholder?`, `fullWidth?`.
- Refactor `EditableCharacterDetails.tsx` to use `InfoboxRow`, reducing the file well below 150 lines.

### Step 9: Refactor `src/components/ConnectionsTable.tsx` — Use Category Utils and Optimize
- Import `compareByCategoryThenName` from `categoryUtils.ts`.
- Precompute a `Map<string, Character>` lookup from `allCharacters` to avoid calling `getConnectedCharacter` 3 times per connection.
- Use the shared comparison function for sorting.

### Step 10: Split `src/app/globals.css` into CSS Modules
- Create `src/styles/base.css` — global resets, typography, container, header, footer, navigation, tables, buttons, and general layout styles.
- Create `src/styles/character.css` — character detail page styles, infobox styles, category section styles, character image styles.
- Create `src/styles/forms.css` — editable field styles, form inputs, textareas, selects, and action buttons.
- Update `src/app/globals.css` to only import the three new CSS files: `@import '../styles/base.css'; @import '../styles/character.css'; @import '../styles/forms.css';`.
- Ensure each new CSS file is under 150 lines where possible (some may be slightly over due to CSS verbosity, which is acceptable).

### Step 11: Create `adws/core/cliUtils.ts` — Shared CLI Argument Parsing
- Extract the `parseArguments` pattern from the 8 orchestrator files.
- Create a generic `parseCliArguments(args: string[], scriptName: string): { issueNumber: number; providedAdwId: string | null; cwd: string | null }`.
- Create `printUsageAndExit(scriptName: string, description: string): never`.
- Use immutable array operations instead of `args.splice()` — use `.filter()` and `.findIndex()` instead.
- All 8 orchestrator files should import from this module.

### Step 12: Refactor All 8 `adws/adw*.tsx` Orchestrator Files to Use `cliUtils`
- Replace `parseArguments` and `printUsageAndExit` in each of: `adwBuild.tsx`, `adwPlan.tsx`, `adwPlanBuild.tsx`, `adwPlanBuildTest.tsx`, `adwPlanBuildTestReview.tsx`, `adwTest.tsx`, `adwPrReview.tsx`, `adwClearComments.tsx`.
- Import and call the shared versions from `adws/core/cliUtils.ts`.
- Verify each file is under 150 lines after refactoring (notably `adwBuild.tsx` at 346 lines and `adwTest.tsx` at 195 lines will need further splitting).

### Step 13: Create `adws/core/githubApiTypes.ts` — TypeScript Interfaces for GitHub API
- Define interfaces: `RawGitHubIssue`, `RawGitHubComment`, `RawGitHubLabel`, `RawGitHubAssignee`, `RawGitHubReview`, `RawGitHubLineComment`, `RawGitHubPR`.
- Replace all 9 `any` type usages in `adws/github/githubApi.ts` with these typed interfaces.

### Step 14: Create `adws/github/apiTransformers.ts` and Refactor `githubApi.ts`
- Extract `transformIssueResponse`, `transformPRResponse`, and related transformer functions from `githubApi.ts` into `apiTransformers.ts`.
- Update `githubApi.ts` to import transformers and types from the new modules.
- Target: each file under 150 lines.

### Step 15: Split `adws/workflowPhases.ts` into Phase Modules
- Create `adws/phases/phaseUtils.ts` — shared phase utilities (stage checks, state management helpers, progress callback factory).
- Create `adws/phases/planPhase.ts` — `executePlanPhase()` function.
- Create `adws/phases/buildPhase.ts` — `executeBuildPhase()` function.
- Create `adws/phases/testPhase.ts` — `executeTestPhase()` function.
- Create `adws/phases/reviewPhase.ts` — `executeReviewPhase()` function.
- Create `adws/phases/prPhase.ts` — `executePRPhase()` function.
- Update `adws/workflowPhases.ts` to re-export all functions for backward compatibility, keeping it as a barrel file.
- Target: each new phase file under 150 lines; barrel file under 50 lines.

### Step 16: Create `adws/core/retryUtils.ts` — Functional Retry Abstraction
- Create a recursive `retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>` that replaces the `while` loops in `testRetry.ts` and `reviewRetry.ts`.
- Use tail recursion or a reduce-based approach instead of `while` loops with mutable counters.
- Create `RetryOptions` type with `maxRetries`, `onAttempt`, `onFailure` callbacks.

### Step 17: Refactor `adws/agents/testRetry.ts` and `adws/agents/reviewRetry.ts`
- Replace `while` loops with calls to `retryUtils`.
- Eliminate mutable `retryCount` variables.
- Ensure each file is under 150 lines.

### Step 18: Refactor `adws/adwClearComments.tsx` — Replace For Loop
- Replace `for (const comment of comments)` with `.reduce()` to count deleted/failed.
- Eliminate mutable `deleted` and `failed` counters.

### Step 19: Split `adws/healthCheck.tsx` into Sub-Modules
- Create `adws/healthCheck/envChecks.ts` — environment variable validation functions.
- Create `adws/healthCheck/serviceChecks.ts` — service connectivity check functions.
- Refactor the main `healthCheck.tsx` to orchestrate the sub-modules.
- Replace `for` loops with `.filter()` and `.reduce()` for environment variable checks.
- Target: each file under 150 lines.

### Step 20: Refactor Remaining Oversized adws/ Files
- `adws/agents/claudeAgent.ts` (438 lines): Extract `parseJsonlOutput` into its own module (`adws/agents/jsonlParser.ts`). Refactor to return computed results instead of mutating parameters.
- `adws/github/worktreeOperations.ts` (514 lines): Split into `worktreeCreate.ts`, `worktreeCleanup.ts`, and `worktreeUtils.ts`.
- `adws/github/gitOperations.ts` (229 lines): Split into `gitBranch.ts` and `gitCommit.ts` if natural seams exist.
- `adws/triggers/trigger_webhook.ts` (305 lines): Extract request parsing and validation into a separate module.
- `adws/triggers/issueClassifier.ts` (285 lines): Extract classification logic from API interaction.
- `adws/core/dataTypes.ts` (467 lines): Split into domain-specific type files (`adws/core/types/workflow.ts`, `adws/core/types/agent.ts`, `adws/core/types/github.ts`).
- `adws/core/agentState.ts` (274 lines): Split file I/O operations from state computation logic.
- `adws/adwBuild.tsx` (346 lines): After CLI utils extraction, further split orchestration logic.

### Step 21: Final Sweep — Remove Unused Imports and Variables
- Run `npm run lint` across the entire codebase.
- Fix all lint errors related to unused imports, unused variables, and style violations.
- Verify no dead code remains after the refactoring.

### Step 22: Run Validation Commands
- Run `npm run lint` — verify zero lint errors.
- Run `npm run build` — verify zero build errors.
- Run `npm test` — verify all tests pass with zero regressions.

## Testing Strategy
### Unit Tests
- Update `src/__tests__/supabase.test.ts` to test the new `dbErrorHandler` functions.
- Add tests for `characterTransform.ts` (enrichment functions).
- Add tests for `categoryUtils.ts` (sorting and index lookup).
- Add tests for `adws/core/cliUtils.ts` (argument parsing with various inputs).
- Add tests for `adws/core/retryUtils.ts` (retry behavior, max retries, backoff).
- Ensure all existing tests in `src/__tests__/` and `adws/__tests__/` continue to pass.

### Integration Tests
- Verify that `src/lib/characters.ts` functions still return correct data after refactoring to use shared modules.
- Verify that `src/lib/connections.ts` functions still return correct data.
- Verify that all adws orchestrator scripts can still be invoked with the same CLI arguments.
- Verify that `workflowPhases.ts` barrel file correctly re-exports all phase functions.

### Edge Cases
- Database error handling: Verify table-not-found errors still return fallback values (empty arrays / null).
- Character image enrichment: Verify null/undefined image_link values are handled.
- Category sorting: Verify unknown categories sort to end of list.
- CLI parsing: Verify edge cases like missing arguments, extra arguments, and `--cwd` at various positions.
- Retry utils: Verify behavior at 0 retries, 1 retry, and max retries.

## Acceptance Criteria
- All files in `src/` and `adws/` are under 150 lines (with reasonable exceptions for type-definition-heavy files and CSS).
- Zero instances of code duplicated 3 or more times across files.
- Zero `any` type usages in the codebase.
- Zero `for` or `while` loops — all replaced with functional constructs (`.map()`, `.filter()`, `.reduce()`, recursion).
- Zero mutable parameter mutations (no `args.splice()`, no mutating function parameters).
- All unused imports and variables are removed.
- `npm run lint` passes with zero errors.
- `npm run build` passes with zero errors.
- `npm test` passes with all tests passing.
- All shared modules have internal cohesion — each module handles a single concern.
- Backward compatibility is maintained — all existing functionality works identically.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `adws/workflowPhases.ts` file at 970 lines is the single highest-priority refactoring target. It is 6.5x over the 150-line limit.
- When splitting `workflowPhases.ts`, maintain a barrel re-export file so that existing imports from other files do not break.
- The `adws/core/dataTypes.ts` file (467 lines) is a type definitions file. While splitting it is desirable, type-only files may be allowed some leniency since they contain no logic.
- CSS files may slightly exceed 150 lines due to the nature of styling — aim for as close to 150 as practical.
- The 8 orchestrator files (`adw*.tsx`) share nearly identical `parseArguments` and `printUsageAndExit` functions. This is the most impactful deduplication opportunity in the `adws/` directory.
- The `any` type violations are concentrated in a single file (`adws/github/githubApi.ts`). Creating proper interfaces for GitHub API responses will fix all 9 violations.
- Prefer extending existing modules over creating new ones where the concern aligns (e.g., add category utilities to an existing lib file if it makes sense for cohesion).
- When refactoring `for`/`while` loops to functional constructs, ensure the refactored code is equally readable. If a `.reduce()` is harder to understand than the original loop, add a brief comment explaining the accumulation logic.
