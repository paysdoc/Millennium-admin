# Feature: ADW Clear Comments

## Feature Description
A standalone ADW (AI Developer Workflow) script that removes all comments from a GitHub issue. This is a utility/reset tool that allows users to clear out all comments on an issue when something has gone wrong and they want to start over with a clean slate. The script is standalone (no orchestrators use it) but reuses the existing libraries and modules in the `adws/` directory structure.

## User Story
As a developer managing ADW workflows
I want to clear all comments from a GitHub issue
So that I can start over with a clean slate when a workflow goes wrong or produces unwanted comments

## Problem Statement
When ADW workflows encounter errors, partially complete, or produce incorrect comments on a GitHub issue, there is no automated way to clean up those comments. Manually deleting many comments through the GitHub UI is tedious and error-prone. Users need a single command to remove all comments from an issue for a fresh start.

## Solution Statement
Create a standalone ADW script (`adws/adwClearComments.tsx`) that accepts a GitHub issue number as a command-line argument, fetches all comments on that issue via the GitHub REST API, and deletes each comment. The script will leverage existing `adws/github/githubApi.ts` for repo info and logging, and add two new focused functions: one to fetch issue comments with their REST API numeric IDs (required for deletion), and one to delete a single comment by ID. The script will log progress as it works and report a summary on completion.

## Relevant Files
Use these files to implement the feature:

- **`adws/github/githubApi.ts`** — Contains existing GitHub API functions (`getRepoInfo`, `fetchGitHubIssue`, `commentOnIssue`, etc.). Two new functions will be added here: `fetchIssueCommentsRest` (to fetch comments with numeric REST API IDs) and `deleteIssueComment` (to delete a comment by numeric ID).
- **`adws/github/index.ts`** — Re-exports from GitHub module. Must be updated to export the two new functions.
- **`adws/index.ts`** — Top-level ADW exports. Must be updated to export the two new functions.
- **`adws/core/utils.ts`** — Provides `log` utility used throughout ADW scripts for consistent logging.
- **`adws/core/config.ts`** — Provides configuration constants.
- **`adws/core/index.ts`** — Core module re-exports.
- **`adws/core/dataTypes.ts`** — Contains data type definitions. A new `IssueCommentSummary` interface will be added here.
- **`adws/healthCheck.tsx`** — Reference pattern for standalone ADW script structure (shebang, argument parsing, main function, logging).
- **`adws/__tests__/githubApi.test.ts`** — Existing test file for GitHub API functions. Reference for mocking patterns.

### New Files
- **`adws/adwClearComments.tsx`** — New standalone ADW script that clears all comments from an issue.
- **`adws/__tests__/clearComments.test.ts`** — Unit tests for the new `fetchIssueCommentsRest`, `deleteIssueComment`, and the clear comments logic.

## Implementation Plan
### Phase 1: Foundation
Add the reusable GitHub API functions needed for comment deletion. This involves adding a minimal data type for REST API issue comments, adding a function to fetch all issue comments via the REST API (returning numeric IDs required for deletion), and adding a function to delete a single comment by its numeric ID.

### Phase 2: Core Implementation
Create the standalone `adwClearComments.tsx` script following the existing ADW script pattern (see `healthCheck.tsx`). The script will parse the issue number from command-line arguments, fetch all comments, delete them sequentially, and report results.

### Phase 3: Integration
Update the `adws/github/index.ts` and `adws/index.ts` barrel exports to include the new functions. Add comprehensive unit tests covering success, failure, and edge cases (no comments, API errors, partial failures).

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `IssueCommentSummary` interface to data types
- In `adws/core/dataTypes.ts`, add a new interface representing a minimal issue comment from the GitHub REST API:
  ```typescript
  /**
   * Minimal issue comment from GitHub REST API (for listing/deleting).
   */
  export interface IssueCommentSummary {
    /** Numeric REST API comment ID (required for deletion). */
    id: number;
    /** Comment body text. */
    body: string;
    /** Comment author login. */
    authorLogin: string;
    /** ISO 8601 creation timestamp. */
    createdAt: string;
  }
  ```
- Export the new type from `adws/core/index.ts`.
- Export the new type from `adws/index.ts`.

### Step 2: Add `fetchIssueCommentsRest` function to `githubApi.ts`
- In `adws/github/githubApi.ts`, add a new function that uses `gh api` to fetch all comments on an issue via the REST API:
  ```typescript
  /**
   * Fetches all comments on a GitHub issue via the REST API.
   * Returns comments with numeric IDs needed for deletion.
   */
  export function fetchIssueCommentsRest(issueNumber: number): IssueCommentSummary[] {
    const { owner, repo } = getRepoInfo();
    try {
      const json = execSync(
        `gh api repos/${owner}/${repo}/issues/${issueNumber}/comments --paginate`,
        { encoding: 'utf-8' }
      );
      const raw = JSON.parse(json);
      return (raw as any[]).map((c: any) => ({
        id: c.id,
        body: c.body || '',
        authorLogin: c.user?.login || 'unknown',
        createdAt: c.created_at,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch comments for issue #${issueNumber}: ${error}`);
    }
  }
  ```
- Import `IssueCommentSummary` from `'../core'` in `githubApi.ts`.

### Step 3: Add `deleteIssueComment` function to `githubApi.ts`
- In `adws/github/githubApi.ts`, add a new function that deletes a single issue comment by its numeric REST API ID:
  ```typescript
  /**
   * Deletes a single issue comment by its REST API numeric ID.
   */
  export function deleteIssueComment(commentId: number): void {
    const { owner, repo } = getRepoInfo();
    try {
      execSync(
        `gh api -X DELETE repos/${owner}/${repo}/issues/comments/${commentId}`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
      log(`Deleted comment ${commentId}`, 'success');
    } catch (error) {
      throw new Error(`Failed to delete comment ${commentId}: ${error}`);
    }
  }
  ```

### Step 4: Update barrel exports
- In `adws/github/index.ts`, add exports for `fetchIssueCommentsRest` and `deleteIssueComment` from `'./githubApi'`.
- In `adws/index.ts`, add exports for `fetchIssueCommentsRest`, `deleteIssueComment`, and `type IssueCommentSummary` in the appropriate sections.

### Step 5: Create the standalone ADW script `adws/adwClearComments.tsx`
- Create `adws/adwClearComments.tsx` following the pattern established by `adws/healthCheck.tsx`:
  - Add shebang line: `#!/usr/bin/env npx tsx`
  - Add JSDoc header describing usage: `npx tsx adws/adwClearComments.tsx <issue_number>`
  - Import `log` from `'./core'` and `fetchIssueCommentsRest`, `deleteIssueComment` from `'./github'`
  - Implement `printUsageAndExit()` function for usage information
  - Implement `parseArguments(args)` function to validate and parse the issue number from CLI args
  - Implement `clearIssueComments(issueNumber)` function that:
    1. Fetches all comments via `fetchIssueCommentsRest`
    2. If no comments found, logs and returns early with a summary
    3. Logs the number of comments found
    4. Deletes each comment sequentially using `deleteIssueComment`, tracking successes and failures
    5. Returns a result summary object with `{ total, deleted, failed }`
  - Implement `main()` async function that:
    1. Parses arguments
    2. Logs start
    3. Calls `clearIssueComments`
    4. Logs human-readable summary
    5. Exits with code 0 on full success, 1 if any deletions failed
  - Call `main()` at module level

### Step 6: Create unit tests `adws/__tests__/clearComments.test.ts`
- Create `adws/__tests__/clearComments.test.ts` with the following test cases:
  - **`fetchIssueCommentsRest`** tests:
    - Returns mapped comments from REST API response
    - Returns empty array when no comments exist
    - Throws on API error
  - **`deleteIssueComment`** tests:
    - Successfully deletes a comment
    - Throws on API error
  - **`clearIssueComments`** tests (import from `adwClearComments.tsx`):
    - Deletes all comments and returns correct summary
    - Handles issue with no comments gracefully
    - Continues deleting when one deletion fails (partial failure), returns accurate counts
- Follow the existing test pattern from `githubApi.test.ts`:
  - Mock `child_process` with `vi.mock`
  - Mock `../core/utils` to silence logs
  - Use `vi.mocked(execSync)` for assertions

### Step 7: Run validation commands
- Run all validation commands listed below to confirm the feature works correctly with zero regressions.

## Testing Strategy
### Unit Tests
- **`fetchIssueCommentsRest`**: Verify correct mapping of REST API response fields to `IssueCommentSummary` interface. Verify empty array returned for issues with no comments. Verify error thrown on API failure.
- **`deleteIssueComment`**: Verify correct `gh api` DELETE command is called with the comment ID. Verify error thrown on API failure.
- **`clearIssueComments`**: Verify all comments are deleted and summary counts are correct. Verify graceful handling of zero comments. Verify partial failure handling (one comment fails to delete, others succeed).

### Integration Tests
- The script can be manually integration-tested by running `npx tsx adws/adwClearComments.tsx <issue_number>` against a real GitHub issue. This is out of scope for automated tests but is the recommended way to verify end-to-end behavior.

### Edge Cases
- Issue has zero comments (should log a message and exit cleanly)
- Issue has a very large number of comments (pagination is handled by `--paginate` flag)
- One or more comment deletions fail mid-way through (script should continue deleting remaining comments and report failures)
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
- All new functions are exported through the barrel files (`adws/github/index.ts`, `adws/index.ts`)
- Unit tests cover success, failure, and edge cases
- `npm run lint`, `npm run build`, and `npm test` all pass with zero errors

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- This ADW is standalone — no orchestrators use it. It is a utility script for manual use.
- The script reuses existing modules: `adws/core` for logging/config, `adws/github/githubApi.ts` for GitHub API functions and `getRepoInfo`.
- The `gh api --paginate` flag handles GitHub API pagination automatically, ensuring all comments are fetched even for issues with more than 100 comments.
- The `deleteIssueComment` function throws on failure (rather than silently logging) to allow the caller (`clearIssueComments`) to track and report failures accurately.
- The `clearIssueComments` function catches individual deletion errors and continues processing remaining comments, ensuring a single failure doesn't abort the entire operation.
- No new npm dependencies are required.
