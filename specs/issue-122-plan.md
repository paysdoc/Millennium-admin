# Feature: ADW Clear All Issue Comments

## Feature Description
A standalone ADW (AI Developer Workflow) script that removes all comments from a specified GitHub issue. This is a utility tool for developers who need to reset an issue's comment history — for example, when an ADW workflow run produced unwanted comments, or when starting over on an issue. The script uses the GitHub REST API (via the `gh` CLI) to fetch all comments with their numeric IDs, then deletes each one. It follows the same patterns as other standalone ADW scripts like `healthCheck.tsx`.

## User Story
As a developer using the ADW system
I want to clear all comments from a GitHub issue with a single command
So that I can reset the issue state and start fresh when a workflow run went wrong or produced noise

## Problem Statement
When ADW workflows run (plan, build, test, PR review), they post multiple progress comments on GitHub issues. If something goes wrong, an issue can accumulate many stale or incorrect workflow comments. Currently there is no automated way to clear these comments — the developer must manually delete each one through the GitHub UI, which is tedious and error-prone for issues with many comments.

## Solution Statement
Create a standalone ADW script `adws/adwClearComments.tsx` that:
1. Accepts a GitHub issue number as a CLI argument
2. Fetches all comments on the issue using the GitHub REST API (which returns numeric comment IDs needed for deletion)
3. Deletes each comment one at a time, logging progress
4. Provides a summary of how many comments were deleted vs. failed
5. Supports a `--dry-run` flag to preview which comments would be deleted without actually deleting them

The script follows the same conventions as `adws/healthCheck.tsx`: shebang line, argument parsing, usage help, structured logging, and exit codes.

## Relevant Files
Use these files to implement the feature:

- **`adws/github/githubApi.ts`** — Contains existing GitHub API functions using the `gh` CLI. Two new functions will be added here: `fetchIssueCommentsRest` (to fetch comments with numeric IDs via the REST API) and `deleteIssueComment` (to delete a single comment by ID).
- **`adws/core/dataTypes.ts`** — Contains all data type interfaces. A new `IssueCommentSummary` interface will be added here for the REST API comment representation (which uses numeric IDs unlike the GraphQL `GitHubComment` which uses string node IDs).
- **`adws/core/index.ts`** — Core module barrel exports. Needs to export the new `IssueCommentSummary` type.
- **`adws/github/index.ts`** — GitHub module barrel exports. Needs to export the new `fetchIssueCommentsRest` and `deleteIssueComment` functions.
- **`adws/index.ts`** — Top-level ADW barrel exports. Needs to export the new functions and type.
- **`adws/healthCheck.tsx`** — Reference implementation for standalone ADW script pattern (shebang, CLI parsing, structured output, exit codes).
- **`adws/core/utils.ts`** — Contains the `log()` utility function used for structured logging.
- **`adws/__tests__/githubApi.test.ts`** — Existing GitHub API tests. Reference for mocking patterns.
- **`guidelines/coding_guidelines.md`** — Coding guidelines that must be followed.

### New Files
- **`adws/adwClearComments.tsx`** — The new standalone ADW script for clearing issue comments.
- **`adws/__tests__/clearComments.test.ts`** — Unit tests for the new functionality.

## Implementation Plan
### Phase 1: Foundation
Add the data type and GitHub API functions needed by the clear comments script:
- Add `IssueCommentSummary` interface to `dataTypes.ts` for REST API comment representation (numeric `id`, `body`, `authorLogin`, `createdAt`)
- Add `fetchIssueCommentsRest()` function to `githubApi.ts` that fetches all issue comments via `gh api repos/{owner}/{repo}/issues/{number}/comments --paginate`
- Add `deleteIssueComment()` function to `githubApi.ts` that deletes a single comment via `gh api -X DELETE repos/{owner}/{repo}/issues/comments/{id}`
- Update barrel exports in `core/index.ts`, `github/index.ts`, and `adws/index.ts`

### Phase 2: Core Implementation
Create the standalone ADW script:
- Create `adws/adwClearComments.tsx` following the `healthCheck.tsx` pattern
- Implement CLI argument parsing (`<issue_number>` required, `--dry-run` optional)
- Implement `clearIssueComments()` function that fetches and deletes all comments
- Add progress logging for each deletion
- Add summary output showing total, deleted, and failed counts
- Support `--dry-run` mode that lists comments without deleting

### Phase 3: Integration
- Create comprehensive unit tests in `adws/__tests__/clearComments.test.ts`
- Test coverage: success path, empty comments, API errors, partial failures, dry-run mode
- Run validation commands to ensure no regressions

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `IssueCommentSummary` Interface to `adws/core/dataTypes.ts`

- Add a new exported interface `IssueCommentSummary` with the following fields:
  - `id: number` — REST API numeric comment ID (needed for deletion)
  - `body: string` — Comment body text
  - `authorLogin: string` — Author's GitHub login
  - `createdAt: string` — ISO 8601 creation timestamp
- Place it after the existing `GitHubComment` interface for logical grouping

### Step 2: Export `IssueCommentSummary` from Barrel Files

- In `adws/core/index.ts`, add `IssueCommentSummary` to the type exports from `./dataTypes`
- In `adws/index.ts`, add `type IssueCommentSummary` to the exports from `./core`

### Step 3: Add `fetchIssueCommentsRest` Function to `adws/github/githubApi.ts`

- Add a new exported function `fetchIssueCommentsRest(issueNumber: number): IssueCommentSummary[]`
- Use `getRepoInfo()` to get owner/repo
- Execute `gh api repos/${owner}/${repo}/issues/${issueNumber}/comments --paginate` via `execSync`
- Parse the JSON response and map each comment to `IssueCommentSummary`
- Log the number of comments fetched
- On error, log the error and return an empty array (graceful degradation, consistent with `fetchPRReviews` pattern)

### Step 4: Add `deleteIssueComment` Function to `adws/github/githubApi.ts`

- Add a new exported function `deleteIssueComment(commentId: number): boolean`
- Use `getRepoInfo()` to get owner/repo
- Execute `gh api -X DELETE repos/${owner}/${repo}/issues/comments/${commentId}` via `execSync`
- Return `true` on success, `false` on error
- Log success or failure for each deletion

### Step 5: Export New Functions from GitHub Barrel Files

- In `adws/github/index.ts`, add `fetchIssueCommentsRest` and `deleteIssueComment` to the exports from `./githubApi`
- In `adws/index.ts`, add `fetchIssueCommentsRest` and `deleteIssueComment` to the exports from `./github`

### Step 6: Create `adws/adwClearComments.tsx`

- Add the shebang line: `#!/usr/bin/env npx tsx`
- Add JSDoc header documenting usage: `npx tsx adws/adwClearComments.tsx <issue_number> [--dry-run]`
- Import `log` from `./core` and `fetchIssueCommentsRest`, `deleteIssueComment` from `./github`
- Implement `printUsageAndExit()` function following the `healthCheck.tsx` pattern
- Implement `parseArguments(args: string[]): { issueNumber: number; dryRun: boolean }`
  - Parse the required `<issue_number>` positional argument
  - Parse the optional `--dry-run` flag
  - Validate the issue number is a positive integer
- Implement `clearIssueComments(issueNumber: number, dryRun: boolean): { total: number; deleted: number; failed: number }`
  - Call `fetchIssueCommentsRest(issueNumber)` to get all comments
  - If no comments, log and return `{ total: 0, deleted: 0, failed: 0 }`
  - Log the total number of comments found
  - If `dryRun`, log each comment (truncated body, author, date) and return `{ total, deleted: 0, failed: 0 }`
  - Otherwise, iterate over comments and call `deleteIssueComment(comment.id)` for each
  - Track `deleted` and `failed` counts
  - Log progress for each comment (e.g., `Deleting comment 3/15 by user...`)
  - Return the summary `{ total, deleted, failed }`
- Implement `main()` async function:
  - Parse arguments
  - Log the start banner
  - Call `clearIssueComments()`
  - Log the summary
  - Exit with code 0 if all succeeded, 1 if any failed
- Guard `main()` call with `import.meta.url` check or use `process.argv[1]` pattern to prevent execution during test imports

### Step 7: Create Unit Tests `adws/__tests__/clearComments.test.ts`

- Mock `child_process` and `../core/utils` (log) following existing test patterns (e.g., `githubApi.test.ts`)
- Mock `../github/githubApi` to mock `getRepoInfo`, `fetchIssueCommentsRest`, and `deleteIssueComment`
- Import the functions under test
- Test `fetchIssueCommentsRest`:
  - Returns mapped `IssueCommentSummary` array on success
  - Returns empty array on API error
  - Handles paginated responses correctly
- Test `deleteIssueComment`:
  - Returns `true` on successful deletion
  - Returns `false` on API error
- Test `clearIssueComments`:
  - Successfully deletes all comments and returns correct counts
  - Returns `{ total: 0, deleted: 0, failed: 0 }` when no comments exist
  - Handles partial failures (some deletes succeed, some fail)
  - Dry-run mode does not call `deleteIssueComment` and returns `deleted: 0`
- Aim for 8+ test cases covering success, error, and edge case scenarios

### Step 8: Run Validation Commands

- Run `npm run lint` — verify no linting errors
- Run `npm run build` — verify the application builds without errors
- Run `npm test` — verify all tests pass with zero regressions

## Testing Strategy
### Unit Tests
- Test `fetchIssueCommentsRest` in isolation: verify it calls the correct `gh api` command, parses the JSON response correctly, maps fields to `IssueCommentSummary`, and handles API errors gracefully
- Test `deleteIssueComment` in isolation: verify it calls the correct `gh api -X DELETE` command and returns the correct boolean result
- Test `clearIssueComments` (the orchestration function): verify it coordinates fetch and delete correctly, handles empty comment lists, handles partial failures, and respects dry-run mode

### Integration Tests
- The script can be tested manually by running `npx tsx adws/adwClearComments.tsx <issue_number> --dry-run` against a real issue to verify the fetch and display logic works
- Full integration is tested by running the script against a test issue (without `--dry-run`) and verifying comments are deleted

### Edge Cases
- Issue with zero comments: should succeed with `{ total: 0, deleted: 0, failed: 0 }`
- Issue that does not exist: should fail gracefully with an error message
- Network/API errors during fetch: should return empty array and log error
- Network/API errors during individual delete: should continue deleting remaining comments and report partial failure
- Very large number of comments: paginated fetch via `--paginate` handles this
- Permission denied on delete (e.g., comments by other users in repos where the authenticated user doesn't have admin rights): should report as failed and continue

## Acceptance Criteria
- Running `npx tsx adws/adwClearComments.tsx <issue_number>` deletes all comments from the specified GitHub issue
- Running `npx tsx adws/adwClearComments.tsx <issue_number> --dry-run` lists all comments without deleting any
- The script provides clear progress logging during execution
- The script provides a summary of total/deleted/failed counts at the end
- The script exits with code 0 on full success, 1 on any failures
- Running with no arguments or invalid arguments prints usage help and exits with code 1
- All new functions (`fetchIssueCommentsRest`, `deleteIssueComment`, `clearIssueComments`) have unit tests
- All unit tests pass: `npm test`
- No linting errors: `npm run lint`
- Application builds successfully: `npm run build`
- No regressions in existing tests
- New types and functions are exported through barrel files
- Code follows project coding guidelines (TypeScript strict types, functional patterns, modular design, file size < 150 lines)

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The `GitHubComment` interface in `dataTypes.ts` uses string `id` fields (GraphQL node IDs), which are not suitable for the REST API delete endpoint. The new `IssueCommentSummary` interface uses numeric `id` to match the REST API format required by the delete endpoint (`DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}`).
- Follow the `healthCheck.tsx` pattern for standalone scripts: shebang line, JSDoc header, argument parsing, structured output, and exit codes.
- The `clearIssueComments` function is exported separately from `main()` to allow unit testing without triggering the CLI entry point.
- The `--dry-run` flag is included as a safety mechanism since deleting comments is destructive and irreversible.
- Guard the `main()` invocation to prevent it from running when the module is imported during tests.
