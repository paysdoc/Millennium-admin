# Bug: ADW PR Review misses PR review body comments

## Bug Description
The ADW PR Review workflow reports no unaddressed comments and exits early, even when a PR has review comments. The `fetchPRReviewComments` function only fetches line-level review comments from the GitHub API (`/pulls/{pr}/comments`), but does not fetch review-level body comments submitted via the `/pulls/{pr}/reviews` endpoint. As a result, when a reviewer submits a review with a top-level body comment (not attached to a specific code line), the system returns an empty array and the workflow exits with "No unaddressed review comments."

**Expected behavior:** The ADW detects all review comments — both line-level and review-body comments — and processes them.

**Actual behavior:** The ADW only detects line-level comments. Review-body comments are invisible, causing the workflow to report no unaddressed comments and exit.

## Problem Statement
`fetchPRReviewComments` in `adws/githubApi.ts` only calls the GitHub REST API endpoint `repos/{owner}/{repo}/pulls/{pr}/comments` (line-level comments). It does not call `repos/{owner}/{repo}/pulls/{pr}/reviews` to fetch review-body comments. This means any review that has a body comment but no line-level comments is completely missed.

## Solution Statement
Add a new function `fetchPRReviews` to `adws/githubApi.ts` that fetches review-body comments from the `/pulls/{pr}/reviews` endpoint. Update `fetchPRReviewComments` (or the caller in `prCommentDetector.ts`) to merge both line-level comments and review-body comments into a single list of `PRReviewComment` objects. Filter out reviews with empty bodies and reviews in `PENDING` state (draft reviews not yet submitted).

## Steps to Reproduce
1. Create a PR in the repository.
2. Submit a review with a body comment (e.g., "Please fix the error handling") but no line-level comments.
3. Run `npx tsx adws/adwPrReview.tsx <pr-number>`.
4. Observe the ADW exits with "No unaddressed review comments on PR #X, exiting."

## Root Cause Analysis
The GitHub REST API separates PR feedback into multiple endpoints:
- `/pulls/{pr}/comments` — line-level review comments (comments on specific code lines)
- `/pulls/{pr}/reviews` — review submissions with optional body comments

The current `fetchPRReviewComments` function (`adws/githubApi.ts:141-168`) only queries the first endpoint. Review-body comments (submitted via the "Submit review" dialog with a summary comment) are only available from the `/pulls/{pr}/reviews` endpoint and are not fetched.

## Relevant Files
Use these files to fix the bug:

- `adws/githubApi.ts` — Contains `fetchPRReviewComments` which needs to also fetch review-body comments from the `/pulls/{pr}/reviews` endpoint.
- `adws/dataTypes.ts` — Contains `PRReviewComment` type. May need a minor update to accommodate review-body comments (which have no `path` or `line`).
- `adws/prCommentDetector.ts` — Contains `getUnaddressedComments` which consumes `fetchPRReviewComments`. Needs to handle the merged comment list.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `fetchPRReviews` function to `adws/githubApi.ts`
- Add a new function `fetchPRReviews` that calls `gh api repos/{owner}/{repo}/pulls/{prNumber}/reviews --paginate`.
- Parse the response and return an array of `PRReviewComment` objects for reviews that have a non-empty `body` and are not in `PENDING` state.
- Map review fields: `id` from review id, `author` from `user`, `body` from review body, `path` as `''` (not file-specific), `line` as `null`, `createdAt` from `submitted_at`, `updatedAt` from `submitted_at`.

### Step 2: Update `fetchPRReviewComments` to include review-body comments
- In `fetchPRReviewComments`, after fetching line-level comments, also call `fetchPRReviews`.
- Merge both arrays into a single `PRReviewComment[]` return value.
- Deduplicate is not needed since these are from different endpoints with different ID spaces.

### Step 3: Run validation commands
- Run `npm run lint`, `npm run build`, and `npm test` to ensure no regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npx tsx adws/adwPrReview.tsx <pr-number>` - Run against a PR with a review-body comment to verify it is now detected
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The GitHub REST API review states are: `APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, `DISMISSED`, `PENDING`. We should only include reviews with state != `PENDING` (pending reviews are drafts not yet submitted).
- Review-body comments don't have a `path` or `line`, so these fields will be `''` and `null` respectively, which is already valid per the `PRReviewComment` type.
- No new libraries are needed; this uses the existing `gh api` CLI pattern already in the codebase.
