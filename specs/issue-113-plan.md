# Feature: Two-Tier Issue Classification with Keyword-Based Fast Path

## Feature Description
Adds a two-tier classification system to the ADW (AI Developer Workflow) issue classifier. The first tier is a new keyword-based classifier (`/classify_adw`) that quickly determines issue type by scanning for information-dense keywords in issue titles, labels, and body content (e.g., `feat:`, `fix:`, `chore:`, `Implements #`, branch prefix patterns). Only when this fast keyword classifier cannot determine the type (returns `0`) does the system fall back to the existing AI-based `/classify_issue` command. This reduces latency and AI costs for the majority of issues that contain obvious classification signals.

## User Story
As an ADW system operator
I want issue classification to use keyword matching before AI inference
So that classification is faster, cheaper, and more deterministic for issues with clear type signals

## Problem Statement
The current issue classification system always invokes a Claude agent (haiku model) via the `/classify_issue` command for every issue, even when the issue title or labels contain obvious keywords like `feat:`, `fix:`, or `chore:`. This adds unnecessary latency (~2-5 seconds per classification) and API cost. Additionally, AI-based classification can occasionally misclassify issues that have clear conventional commit prefixes in their titles.

## Solution Statement
Introduce a new `.claude/commands/classify_adw.md` command that uses keyword-based pattern matching to classify issues. Update the `issueClassifier.ts` module to first attempt classification via `/classify_adw`. If `/classify_adw` returns `0` (unable to classify from keywords alone), fall back to the existing `/classify_issue` AI-based classifier. This provides a fast, deterministic, and cost-free classification path for the majority of issues while preserving the AI fallback for ambiguous cases.

## Relevant Files
Use these files to implement the feature:

- `.claude/commands/classify_issue.md` - The existing AI-based classifier command. This is the fallback when keyword classification fails. Will remain unchanged but serves as reference for the command format.
- `.claude/commands/classify_adw.md` - **New file.** The keyword-based classifier command that examines issue title, labels, and body for classification signals.
- `adws/triggers/issueClassifier.ts` - The core classification module. Must be updated to implement the two-tier classification strategy: try `/classify_adw` first, then fall back to `/classify_issue`.
- `adws/core/dataTypes.ts` - Contains the `SlashCommand` type union and `IssueClassSlashCommand` type. Must add `/classify_adw` to the `SlashCommand` type.
- `adws/__tests__/issueClassifier.test.ts` - **New file.** Unit tests for the updated classification logic, covering keyword matching, fallback behavior, and edge cases.

### New Files
- `.claude/commands/classify_adw.md` - Keyword-based issue classification command
- `adws/__tests__/issueClassifier.test.ts` - Unit tests for the two-tier classification system

## Implementation Plan
### Phase 1: Foundation
- Create the `classify_adw.md` command file that uses keyword pattern matching to classify issues
- Add `/classify_adw` to the `SlashCommand` type in `dataTypes.ts`

### Phase 2: Core Implementation
- Refactor `issueClassifier.ts` to implement the two-tier classification strategy:
  1. First attempt: run `/classify_adw` with haiku for fast keyword-based classification
  2. If the result is `0` (unclassifiable by keywords), fall back to `/classify_issue`
  3. Maintain the same `IssueClassificationResult` return type for backward compatibility
- Extract the shared classification parsing logic into a helper function to avoid duplication between `classifyIssueForTrigger` and `classifyGitHubIssue`

### Phase 3: Integration
- All existing callers (`trigger_webhook.ts`, `trigger_cron.ts`, `workflowPhases.ts`) already use `classifyIssueForTrigger` and `classifyGitHubIssue` — no changes needed at the call sites
- Write comprehensive unit tests covering both tiers, fallback logic, and edge cases
- Run full validation suite to ensure zero regressions

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `/classify_adw` to the `SlashCommand` type
- Open `adws/core/dataTypes.ts`
- Add `'/classify_adw'` to the `SlashCommand` type union, in the "ADW workflow commands" section (after `'/classify_issue'`)
- This enables type-safe usage of the new command throughout the codebase

### Step 2: Create the `classify_adw.md` command file
- Create `.claude/commands/classify_adw.md` with the following behavior:
  - Parse the issue context (title, labels, body) passed via `$ARGUMENTS`
  - Check the issue **title** for conventional commit prefixes:
    - Titles starting with `feat:` or containing `feature` label → respond `/feature`
    - Titles starting with `fix:` or containing `bug` label → respond `/bug`
    - Titles starting with `chore:` or containing `chore` label → respond `/chore`
    - Titles starting with `review:` or containing `pr review` or `code review` keywords → respond `/pr_review`
  - Check the issue **labels** for matching classification:
    - Labels containing `bug`, `defect`, `error` → respond `/bug`
    - Labels containing `feature`, `enhancement` → respond `/feature`
    - Labels containing `chore`, `maintenance`, `docs`, `documentation` → respond `/chore`
    - Labels containing `review` → respond `/pr_review`
  - Check the issue **body** for ADW-generated patterns:
    - Body containing `Implements #` with ADW-style structure → classify based on title prefix of referenced issue
  - If none of the above patterns match, respond with `0` (triggers fallback to AI classifier)
  - The command should be structured as a prompt that instructs Claude to perform deterministic keyword matching (not AI inference)

### Step 3: Update `classifyIssueForTrigger` in `issueClassifier.ts`
- Modify the function to first attempt classification via `/classify_adw`
- Parse the result: if the output contains a valid slash command (`/chore`, `/bug`, `/feature`, `/pr_review`), return it
- If the output contains `0` or no valid command is found, fall back to running `/classify_issue`
- Log which tier was used for classification (keyword vs AI fallback)
- Keep the same error handling: default to `/feature` on failure

### Step 4: Update `classifyGitHubIssue` in `issueClassifier.ts`
- Apply the same two-tier pattern as `classifyIssueForTrigger`:
  1. Try `/classify_adw` first
  2. Fall back to `/classify_issue` if keywords insufficient
- Extract shared parsing logic into a private `parseClassificationOutput` helper function to reduce duplication between the two public functions

### Step 5: Create unit tests for the updated classifier
- Create `adws/__tests__/issueClassifier.test.ts` with tests covering:
  - **Keyword classification success**: issues with `feat:` title prefix return `/feature` from first tier
  - **Keyword classification success**: issues with `fix:` title prefix return `/bug` from first tier
  - **Keyword classification success**: issues with `chore:` title prefix return `/chore` from first tier
  - **Keyword classification fallback**: `/classify_adw` returns `0`, fallback to `/classify_issue` succeeds
  - **Both classifiers fail**: returns default `/feature` with `success: false`
  - **First classifier fails (error)**: falls back to `/classify_issue`
  - **`getWorkflowScript` mapping**: verify correct script is returned for each issue type
  - **`parseClassificationOutput` helper**: test valid commands, invalid output, empty output, and `0` output

### Step 6: Run Validation Commands
- Run all validation commands to verify the feature works correctly with zero regressions

## Testing Strategy
### Unit Tests
- Test `parseClassificationOutput` helper with various inputs (valid commands, `0`, empty, garbage)
- Test `classifyIssueForTrigger` with mocked `/classify_adw` and `/classify_issue` agent responses
- Test `classifyGitHubIssue` with mocked agent responses
- Test the two-tier fallback: first tier returns `0` → second tier is invoked
- Test the two-tier success: first tier returns valid command → second tier is NOT invoked
- Test error handling: first tier throws → second tier is invoked as fallback
- Test `getWorkflowScript` continues to return correct scripts for all issue types

### Integration Tests
- Existing `workflowPhases.test.ts` already mocks `classifyGitHubIssue` — verify it still passes after the refactor
- The mock in `workflowPhases.test.ts` returns `{ issueType: '/feature', success: true }` which remains compatible

### Edge Cases
- Issue title contains multiple prefixes (e.g., `feat: fix: something`) — first match wins
- Issue title has prefix in different case (`Feat:`, `FIX:`) — case-insensitive matching
- Issue with no title, no labels, no body — returns `0`, falls back to AI
- `/classify_adw` agent returns unexpected output format — falls back to AI
- `/classify_adw` agent times out or errors — falls back to AI
- Issue body contains `Implements #N` but title has no clear prefix — returns `0`, falls back to AI

## Acceptance Criteria
- A new `.claude/commands/classify_adw.md` file exists and is a valid Claude command
- `/classify_adw` is added to the `SlashCommand` type in `dataTypes.ts`
- `classifyIssueForTrigger` tries `/classify_adw` before `/classify_issue`
- `classifyGitHubIssue` tries `/classify_adw` before `/classify_issue`
- When `/classify_adw` returns a valid slash command, `/classify_issue` is NOT called
- When `/classify_adw` returns `0`, the system falls back to `/classify_issue`
- When `/classify_adw` fails with an error, the system falls back to `/classify_issue`
- All existing tests in `workflowPhases.test.ts` continue to pass
- New unit tests in `issueClassifier.test.ts` pass
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `classify_adw.md` command is designed as a Claude prompt that performs deterministic keyword matching. While it's still run through the Claude agent, it should be much faster than the AI inference approach of `classify_issue.md` because it relies on simple pattern matching rather than nuanced classification.
- The original issue #107 referenced an attachment `classify_adw.md` that could not be downloaded. The implementation described here follows the intent: keyword-based classification using "information dense keywords" with fallback to AI classification.
- Both `classifyIssueForTrigger` and `classifyGitHubIssue` use the `haiku` model for cost efficiency. This remains unchanged.
- The `issueClassifier.ts` file is currently 142 lines. After adding the two-tier logic and helper function, it may approach the 150-line guideline. If it exceeds the limit, consider extracting the output parsing into a separate utility file.
- No new dependencies are required for this feature.
