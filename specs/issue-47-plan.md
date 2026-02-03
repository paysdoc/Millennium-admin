# PR-Review: Fix adwPlanBuild.tsx to create PRs after build phase

## PR-Review Description
The PR review comment from paysdoc indicates that `adwPlanBuild.tsx` now no longer creates a PR. This is a side effect of the fix for issue #47, which moved PR creation from `adwBuild.tsx` to `adwPlanBuildTest.tsx`.

The problem is that there are two orchestrator scripts:
1. `adwPlanBuildTest.tsx` - Orchestrates Plan + Build + Test, now creates PR after tests pass ✓
2. `adwPlanBuild.tsx` - Orchestrates Plan + Build only (no Test phase), but now has no PR creation logic ✗

Users who use the simpler `adwPlanBuild.tsx` workflow (without running tests) will no longer get a PR created. The PR creation logic needs to be added to `adwPlanBuild.tsx` so it creates a PR after the Build phase completes.

## Summary of Original Implementation Plan
The original plan for issue #47 was to fix the problem where PRs were created during the Build phase before tests run. The solution was to:
1. Remove PR creation from `adwBuild.tsx` (Step 7)
2. Move PR creation to `adwPlanBuildTest.tsx`, executing it only after the Test phase completes successfully

This was successfully implemented, but the change had a side effect on `adwPlanBuild.tsx` which was not addressed.

## Relevant Files
Use these files to resolve the review:

- `adws/adwPlanBuild.tsx` - Main file that needs PR creation logic added after the Build phase. Currently only calls adwPlan.tsx and adwBuild.tsx but doesn't create a PR.
- `adws/adwPlanBuildTest.tsx` - Reference implementation showing how PR creation should be done after phases complete. This file already imports and uses `createPullRequest`, `fetchGitHubIssue`, `postWorkflowComment`, `WorkflowContext`, and `getCurrentBranch`.
- `adws/github/index.ts` - Exports the functions needed for PR creation (`createPullRequest`, `fetchGitHubIssue`, `postWorkflowComment`, `WorkflowContext`, `getCurrentBranch`).

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add imports to adwPlanBuild.tsx
- Import the necessary functions from `./github`:
  - `createPullRequest` - To create the pull request
  - `fetchGitHubIssue` - To get issue details for PR creation
  - `postWorkflowComment` - To post workflow status comments
  - `WorkflowContext` - Type for workflow context
  - `getCurrentBranch` - To get the current branch name

### Step 2: Update the main function signature
- Change `main()` from synchronous `function main(): void` to async `async function main(): Promise<void>`
- This is required because `fetchGitHubIssue` is an async function

### Step 3: Add PR creation logic after Build phase succeeds
- After the Build phase completes successfully (line ~98), add PR creation logic:
  - Get the current branch name using `getCurrentBranch()`
  - Create a `WorkflowContext` object with `issueNumber`, `adwId`, and `branchName`
  - Fetch the GitHub issue details using `await fetchGitHubIssue(issueNumber)`
  - Post a `pr_creating` workflow comment
  - Call `createPullRequest(issue, '', '')` to create the PR
  - Update `ctx.prUrl` with the returned PR URL
  - Post a `pr_created` workflow comment
  - Post a `completed` workflow comment
  - Log the PR URL
- Wrap the PR creation in a try/catch block and handle errors by posting an `error` workflow comment

### Step 4: Update documentation comment
- Update the file header comment (lines 1-15) to reflect that this script now also handles PR creation after build
- Change "2. adwBuild.tsx - Build phase (implementation, commit, PR creation)" to "2. adwBuild.tsx - Build phase (implementation, commit)"
- Add "3. Create PR after build completes"

### Step 5: Update the usage help text
- Update `printUsageAndExit()` function (lines 23-35) to reflect the new workflow
- Change the step description from "2. adwBuild.tsx - Implementation and PR creation" to "2. adwBuild.tsx - Implementation and commit"
- Add "3. Create Pull Request"

### Step 6: Run validation commands
- Run `npm run lint` to check for linting errors
- Run `npm run build` to verify TypeScript compilation
- Run `npm test` to run unit tests and verify no regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The implementation should closely mirror how `adwPlanBuildTest.tsx` handles PR creation (lines 130-168) but without the test phase logic.
- The `adwPlanBuild.tsx` workflow is used for simpler use cases where tests are not needed or are run separately.
- Error handling should match the pattern used in `adwPlanBuildTest.tsx` for consistency.
- No new libraries or dependencies are needed - all required functions are already exported from the `./github` module.
