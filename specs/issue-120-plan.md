# Feature: ADW Clear Issue Comments

## Feature Description
A standalone ADW (AI Developer Workflow) script that removes all comments from a GitHub issue. This is a utility tool for resetting issue state when something goes wrong during an ADW workflow run, allowing the user to start over with a clean issue. The script is standalone — no orchestrators use it — but leverages existing libraries and modules from the `adws/` directory structure (GitHub API, logging, config, data types).

## User Story
As a developer using the ADW system
I want to clear all comments from a GitHub issue
So that I can reset the issue state and start a fresh ADW workflow run when something goes wrong

## Problem Statement
When an ADW workflow fails or produces incorrect results, the issue accumulates many bot-posted comments (workflow status updates, progress reports, error messages). There is no automated way to clean these up, forcing manual deletion of each comment one by one through the GitHub UI. This is tedious and error-prone when dozens of comments exist.

## Solution Statement
Create a standalone `adwClearComments.tsx` script that accepts an issue number, fetches all comments on that issue via the GitHub REST API (which provides numeric comment IDs required for deletion), and deletes each comment. The script follows the existing ADW standalone pattern (shebang, CLI argument parsing, logging, structured output) and reuses existing modules for repo info, logging, and configuration. Two new GitHub API functions (`fetchIssueCommentsRest` and `deleteIssueComment`) are added to `githubApi.ts` to support fetching comments with numeric IDs and deleting individual comments via the REST API.

## Relevant Files
Use these files to implement the feature:

- `adws/core/dataTypes.ts` — Add new `IssueCommentSummary` interface for REST API comment representation with numeric IDs
- `adws/core/index.ts` — Update barrel export to include new type
- `adws/github/githubApi.ts` — Add `fetchIssueCommentsRest` and `deleteIssueComment` functions
- `adws/github/index.ts` — Update barrel export to include new functions
- `adws/index.ts` — Update barrel export to include new functions and types
- `adws/healthCheck.tsx` — Reference pattern for standalone ADW scripts (shebang, arg parsing, logging)
- `adws/github/workflowCommentsBase.ts` — Reference for `isAdwComment()` utility (not modified, but used by the script for optional `--adw-only` filtering)
- `adws/__tests__/githubApi.test.ts` — Reference test pattern for GitHub API function tests

### New Files
- `adws/adwClearComments.tsx` — Standalone ADW script to clear issue comments
- `adws/__tests__/clearComments.test.ts` — Unit tests for the new functionality

## Implementation Plan
### Phase 1: Foundation
Add the data type and GitHub API functions needed to fetch and delete comments via the REST API. The existing `fetchGitHubIssue` function returns comments with GraphQL-style string IDs, but the REST API `DELETE` endpoint requires numeric IDs. Two new functions are needed: one to fetch comments with numeric IDs via `gh api --paginate`, and one to delete a single comment by its numeric ID.

### Phase 2: Core Implementation
Create the standalone `adwClearComments.tsx` script following the `healthCheck.tsx` pattern. The script accepts an issue number, fetches all comments, deletes them sequentially, and reports results. The core logic is extracted into an exported `clearIssueComments()` function for testability, with a guarded `main()` call that only executes when the script is run directly (not imported by tests).

### Phase 3: Integration
Update barrel exports across the module hierarchy (`core/index.ts` → `github/index.ts` → `adws/index.ts`) so the new types and functions are accessible from the top-level `adws` module. Write comprehensive unit tests covering success, no-comments, API errors, and partial failure scenarios.

## Step by Step Tasks

### Step 1: Add `IssueCommentSummary` interface to `adws/core/dataTypes.ts`
- Add a new interface `IssueCommentSummary` with fields:
  - `id: number` — Numeric comment ID from the REST API (required for deletion)
  - `body: string` — Comment body text
  - `authorLogin: string` — Comment author's login
  - `createdAt: string` — ISO 8601 creation timestamp
- Place it near the existing `GitHubComment` interface for logical grouping

### Step 2: Update `adws/core/index.ts` barrel export
- Add `IssueCommentSummary` to the type exports from `./dataTypes`

### Step 3: Add `fetchIssueCommentsRest` function to `adws/github/githubApi.ts`
- Add a new function `fetchIssueCommentsRest(owner: string, repo: string, issueNumber: number): IssueCommentSummary[]`
- Use `gh api --paginate repos/{owner}/{repo}/issues/{issueNumber}/comments` to fetch all comments
- Parse the JSON response and map each entry to `IssueCommentSummary`
- Import `IssueCommentSummary` from `../core`
- Handle errors with try-catch, log errors, and rethrow

### Step 4: Add `deleteIssueComment` function to `adws/github/githubApi.ts`
- Add a new function `deleteIssueComment(owner: string, repo: string, commentId: number): void`
- Use `gh api -X DELETE repos/{owner}/{repo}/issues/comments/{commentId}` to delete the comment
- Handle errors with try-catch, log errors, and rethrow

### Step 5: Update `adws/github/index.ts` barrel export
- Add `fetchIssueCommentsRest` and `deleteIssueComment` to the exports from `./githubApi`

### Step 6: Update `adws/index.ts` barrel export
- Add `fetchIssueCommentsRest` and `deleteIssueComment` to the GitHub module exports
- Add `type IssueCommentSummary` to the core data type exports

### Step 7: Create `adws/adwClearComments.tsx`
- Add shebang line: `#!/usr/bin/env npx tsx`
- Import dependencies: `log` from `./core`, `getRepoInfo`, `fetchIssueCommentsRest`, `deleteIssueComment` from `./github`, `isAdwComment` from `./github/workflowCommentsBase`
- Implement `printUsageAndExit()` function showing usage: `npx tsx adws/adwClearComments.tsx <issue_number> [--adw-only]`
- Implement `parseArguments(args: string[])` to extract `issueNumber` (required) and `adwOnly` flag (optional `--adw-only`)
- Implement exported `clearIssueComments(issueNumber: number, adwOnly: boolean)` function:
  - Get repo info via `getRepoInfo()`
  - Fetch all comments via `fetchIssueCommentsRest(owner, repo, issueNumber)`
  - If `adwOnly` is true, filter to only comments where `isAdwComment(comment.body)` returns true
  - Log total comments found and how many will be deleted
  - If no comments, log and return early with `{ total: 0, deleted: 0, failed: 0 }`
  - Iterate through comments, calling `deleteIssueComment(owner, repo, comment.id)` for each
  - Track successful deletions and failures (catch errors per-comment, don't abort on single failure)
  - Log progress (e.g., "Deleting comment 3/15...")
  - Return summary object: `{ total: number, deleted: number, failed: number }`
- Implement `main()` async function that parses args, calls `clearIssueComments`, and logs summary
- Guard the `main()` call so it only runs when executed directly, not when imported by tests:
  ```ts
  const isDirectExecution = process.argv[1]?.includes('adwClearComments');
  if (isDirectExecution) {
    main();
  }
  ```
- Keep the file under 100 lines by keeping functions focused and concise

### Step 8: Create `adws/__tests__/clearComments.test.ts`
- Mock `child_process` and `../core/utils` following existing test patterns
- Test `fetchIssueCommentsRest`:
  - Successfully fetches and maps comments with numeric IDs
  - Returns empty array when no comments exist
  - Throws on API error
- Test `deleteIssueComment`:
  - Successfully deletes a comment (verify correct `gh api -X DELETE` command)
  - Throws on API error
- Test `clearIssueComments`:
  - Successfully deletes all comments and returns correct summary
  - Returns `{ total: 0, deleted: 0, failed: 0 }` when no comments exist
  - Handles partial failures (some deletes fail) and returns correct counts
  - Filters to ADW-only comments when `adwOnly` is true
- Follow existing test patterns: use `vi.mock`, `vi.mocked(execSync)`, `describe`/`it`/`expect`

### Step 9: Run validation commands
- Run `npm run lint` to check for code quality issues
- Run `npm run build` to verify no build errors
- Run `npm test` to validate the feature works with zero regressions

## Testing Strategy
### Unit Tests
- `fetchIssueCommentsRest`: Test successful fetch, empty results, API errors
- `deleteIssueComment`: Test successful deletion, API errors
- `clearIssueComments`: Test full deletion flow, empty issue, partial failures, ADW-only filtering

### Integration Tests
- No integration tests needed as this is a standalone utility script. The unit tests with mocked `gh` CLI calls provide sufficient coverage.

### Edge Cases
- Issue with zero comments — should return early with `{ total: 0, deleted: 0, failed: 0 }`
- API error fetching comments — should throw with descriptive error message
- Partial deletion failure — some comments fail to delete but others succeed; should continue and report counts
- `--adw-only` flag — should only delete comments matching `isAdwComment()` pattern
- Large number of comments — `--paginate` flag handles pagination automatically
- Invalid issue number — CLI argument parsing should reject non-numeric input

## Acceptance Criteria
- Running `npx tsx adws/adwClearComments.tsx <issue_number>` deletes all comments on the specified issue
- Running `npx tsx adws/adwClearComments.tsx <issue_number> --adw-only` deletes only ADW bot comments
- The script logs progress during deletion (comment count, progress, summary)
- The script handles partial failures gracefully (continues deleting remaining comments)
- The script exits with code 0 on success, code 1 on complete failure or invalid arguments
- New functions `fetchIssueCommentsRest` and `deleteIssueComment` are exported from `adws/index.ts`
- New type `IssueCommentSummary` is exported from `adws/index.ts`
- All existing tests continue to pass (zero regressions)
- Lint passes with no warnings or errors
- Build compiles successfully

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- The existing `fetchGitHubIssue()` function returns comments with GraphQL-style string IDs. The REST API `DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}` endpoint requires numeric IDs. That is why a separate `fetchIssueCommentsRest()` function is needed that uses `gh api --paginate` to get comments with their numeric IDs.
- The `main()` call must be guarded to prevent it from executing when the module is imported by tests. The previous implementation attempt hit this exact issue.
- The `--adw-only` flag uses the existing `isAdwComment()` function from `workflowCommentsBase.ts` which checks for the `<!-- adw-bot -->` marker and ADW heading patterns.
- This ADW is standalone — it is not called by any orchestrator workflow. It is a manual utility the developer runs directly.
