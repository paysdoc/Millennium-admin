# Feature: ADW Clear All Comments on an Issue

## Feature Description
A standalone ADW (AI Developer Workflow) script that removes all comments from a GitHub issue. This utility allows developers to clear out all comments on an issue when an ADW workflow has gone wrong, produced incorrect comments, or when a fresh start is needed. The script is a standalone CLI tool (no orchestrators use it) that reuses existing libraries and modules in the `adws/` directory structure.

This feature was originally specified in issue #120 and implemented via PR #122. Issue #125 is a follow-up to ensure the implementation is complete, properly tested, and fully integrated.

## User Story
As a developer managing ADW workflows
I want to clear all comments from a GitHub issue with a single command
So that I can start over with a clean slate when a workflow goes wrong or produces unwanted comments

## Problem Statement
When ADW workflows encounter errors, partially complete, or produce incorrect comments on a GitHub issue, there is no automated way to clean up those comments. Manually deleting many comments through the GitHub UI is tedious and error-prone. Users need a single command to remove all comments from an issue for a fresh start.

## Solution Statement
A standalone ADW script (`adws/adwClearComments.tsx`) that accepts a GitHub issue number as a command-line argument, fetches all comments on that issue via the GitHub REST API, and deletes each comment sequentially. The script leverages existing `adws/github/githubApi.ts` for repo info and the `gh` CLI, adds two focused functions (`fetchIssueCommentsRest` and `deleteIssueComment`), and provides clear logging and a summary of results.

## Relevant Files
Use these files to implement the feature:

- **`adws/adwClearComments.tsx`** — The standalone ADW script that clears all comments from an issue. Already implemented with `clearIssueComments()` exported for testing, CLI argument parsing, logging, and exit code handling.
- **`adws/github/githubApi.ts`** — Contains `fetchIssueCommentsRest()` and `deleteIssueComment()` functions that provide the GitHub REST API integration for listing and deleting issue comments.
- **`adws/github/index.ts`** — Barrel exports for the GitHub module. Must export `fetchIssueCommentsRest` and `deleteIssueComment`.
- **`adws/index.ts`** — Top-level ADW barrel exports. Must export `fetchIssueCommentsRest`, `deleteIssueComment`, and `IssueCommentSummary`.
- **`adws/core/dataTypes.ts`** — Contains the `IssueCommentSummary` interface representing a minimal issue comment from the GitHub REST API.
- **`adws/core/index.ts`** — Core module barrel exports. Must export `IssueCommentSummary`.
- **`adws/__tests__/clearComments.test.ts`** — Unit tests for `fetchIssueCommentsRest`, `deleteIssueComment`, and `clearIssueComments`.
- **`adws/healthCheck.tsx`** — Reference pattern for standalone ADW script structure (shebang, argument parsing, main function, logging).

## Implementation Plan
### Phase 1: Foundation
Add the reusable data type and GitHub API functions needed for comment management:
1. Add `IssueCommentSummary` interface to `adws/core/dataTypes.ts` with `id`, `body`, `authorLogin`, and `createdAt` fields.
2. Add `fetchIssueCommentsRest()` to `adws/github/githubApi.ts` that uses `gh api --paginate` to fetch all comments with numeric REST API IDs.
3. Add `deleteIssueComment()` to `adws/github/githubApi.ts` that uses `gh api -X DELETE` to remove a comment by numeric ID.

### Phase 2: Core Implementation
Create the standalone `adwClearComments.tsx` script following the `healthCheck.tsx` pattern:
1. Shebang line for direct execution via `npx tsx`.
2. `printUsageAndExit()` for usage information.
3. `parseArguments()` to validate the issue number from CLI args.
4. `clearIssueComments()` as the core logic: fetch all comments, delete each sequentially, track successes/failures, return summary.
5. `main()` entry point that parses args, runs clear, logs summary, and exits with appropriate code.

### Phase 3: Integration
1. Update barrel exports in `adws/github/index.ts`, `adws/core/index.ts`, and `adws/index.ts`.
2. Add comprehensive unit tests covering success, failure, and edge cases.
3. Validate with lint, build, and test commands.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Verify `IssueCommentSummary` interface exists in `adws/core/dataTypes.ts`
- Confirm the `IssueCommentSummary` interface is defined with the following fields:
  - `id: number` — Numeric REST API comment ID (required for deletion)
  - `body: string` — Comment body text
  - `authorLogin: string` — Comment author login
  - `createdAt: string` — ISO 8601 creation timestamp
- Confirm it is exported from `adws/core/index.ts`

### Step 2: Verify `fetchIssueCommentsRest` function in `adws/github/githubApi.ts`
- Confirm the function exists and:
  - Calls `getRepoInfo()` to get owner/repo
  - Uses `gh api repos/{owner}/{repo}/issues/{issueNumber}/comments --paginate` to fetch comments
  - Maps raw API response to `IssueCommentSummary[]`
  - Throws a descriptive error on API failure

### Step 3: Verify `deleteIssueComment` function in `adws/github/githubApi.ts`
- Confirm the function exists and:
  - Calls `getRepoInfo()` to get owner/repo
  - Uses `gh api -X DELETE repos/{owner}/{repo}/issues/comments/{commentId}` to delete
  - Logs success via `log()`
  - Throws a descriptive error on API failure

### Step 4: Verify barrel exports are complete
- Confirm `adws/github/index.ts` exports both `fetchIssueCommentsRest` and `deleteIssueComment`
- Confirm `adws/core/index.ts` exports `IssueCommentSummary` type
- Confirm `adws/index.ts` exports `fetchIssueCommentsRest`, `deleteIssueComment`, and `IssueCommentSummary`

### Step 5: Verify `adws/adwClearComments.tsx` script
- Confirm the script:
  - Has shebang line `#!/usr/bin/env npx tsx`
  - Has `printUsageAndExit()` function
  - Has `parseArguments()` that validates issue number (positive integer)
  - Has exported `clearIssueComments()` that:
    - Fetches comments via `fetchIssueCommentsRest`
    - Returns early with `{ total: 0, deleted: 0, failed: 0 }` when no comments
    - Deletes each comment sequentially via `deleteIssueComment`
    - Catches individual deletion errors and continues
    - Returns `{ total, deleted, failed }` summary
  - Has `main()` that parses args, runs clear, logs summary, exits 0 or 1
  - Guards direct execution with `process.argv[1]?.includes('adwClearComments')`

### Step 6: Verify unit tests in `adws/__tests__/clearComments.test.ts`
- Confirm tests cover:
  - **`fetchIssueCommentsRest`**: returns mapped comments, returns empty array, throws on error
  - **`deleteIssueComment`**: successfully deletes, throws on error
  - **`clearIssueComments`**: deletes all and returns summary, handles no comments, continues on partial failure
- Confirm mocking pattern follows existing conventions (mock `child_process`, mock `../core/utils`)

### Step 7: Run validation commands
- Run all validation commands listed below to confirm the feature works correctly with zero regressions.

## Testing Strategy
### Unit Tests
- **`fetchIssueCommentsRest`**: Verify correct mapping of REST API response fields to `IssueCommentSummary` interface. Verify empty array for issues with no comments. Verify error thrown on API failure.
- **`deleteIssueComment`**: Verify correct `gh api` DELETE command with comment ID. Verify error thrown on API failure.
- **`clearIssueComments`**: Verify all comments deleted and summary counts correct. Verify graceful handling of zero comments. Verify partial failure handling (one fails, others succeed).

### Integration Tests
- Manual integration test: `npx tsx adws/adwClearComments.tsx <issue_number>` against a real GitHub issue. Out of scope for automated tests.

### Edge Cases
- Issue has zero comments (should log message and exit cleanly)
- Issue has many comments (pagination handled by `--paginate` flag)
- One or more deletions fail mid-way (should continue and report failures)
- Invalid issue number provided (should exit with usage message)
- No arguments provided (should print usage and exit)
- Issue does not exist or is not accessible (should throw meaningful error)

## Acceptance Criteria
- Running `npx tsx adws/adwClearComments.tsx <issue_number>` successfully deletes all comments from the specified GitHub issue
- The script logs progress as each comment is deleted
- The script reports a summary with total, deleted, and failed counts
- The script exits with code 0 when all comments are deleted, code 1 when any fail
- The script handles the zero-comments case gracefully with an informative message
- The script follows existing ADW patterns (shebang, argument parsing, logging)
- All new functions are exported through barrel files (`adws/github/index.ts`, `adws/core/index.ts`, `adws/index.ts`)
- Unit tests cover success, failure, and edge cases
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This feature was originally implemented via issue #120 (PR #122, merged as commit `643acd0`). All code already exists in the current branch. The implementation steps above are verification tasks to confirm completeness.
- The `adwClearComments.tsx` is a standalone utility script — no orchestrators invoke it. It is designed for manual use via CLI.
- The `gh api --paginate` flag handles GitHub API pagination automatically, supporting issues with 100+ comments.
- The `deleteIssueComment` function throws on failure to allow `clearIssueComments` to track and report failures accurately.
- The `clearIssueComments` function catches individual deletion errors and continues processing remaining comments, ensuring a single failure doesn't abort the entire operation.
- No new npm dependencies are required.
