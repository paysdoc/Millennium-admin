# Chore: Update ADW Process to Checkout the Default Branch

## Chore Description
Before the ADW (AI Developer Workflow) process starts, the local branch must be set to the default branch. This ensures that feature branches are created from the latest version of the default branch, preventing conflicts and ensuring a clean starting point for each workflow run.

The implementation requires:
1. Finding out what the current default branch is (could be `main`, `master`, `develop`, etc.)
2. Checking out the default branch locally
3. Pulling in the latest changes from remote

## User Story
As a **developer using the ADW workflow**
I want the **ADW process to automatically checkout the default branch before starting**
So that **feature branches are always created from the latest code, reducing merge conflicts and ensuring consistency**

## Problem Statement
Currently, the ADW workflow (`adwPlanBuild.tsx`) does not verify or reset the working branch before creating a feature branch. If a developer runs the ADW process while on an old or unrelated branch, the feature branch will be created from that state, potentially causing issues like:
- Creating branches from outdated code
- Inheriting unwanted changes from a different feature branch
- Merge conflicts when creating the PR

## Solution Statement
Add a new step at the beginning of the ADW Plan & Build workflow that:
1. Queries the GitHub API to determine the repository's default branch name
2. Checks out the default branch
3. Pulls the latest changes from the remote to ensure the local copy is up to date

This will be implemented as reusable functions in `gitOperations.ts` that can be used by both `adwPlanBuild.tsx` and potentially other workflows.

## Relevant Files
Use these files to resolve the chore:

### Existing Files (to modify)
- `adws/github/gitOperations.ts` — Add new functions `getDefaultBranch()` and `checkoutDefaultBranch()` for default branch operations
- `adws/github/index.ts` — Export the new functions from the github module
- `adws/adwPlanBuild.tsx` — Call `checkoutDefaultBranch()` at the start of the workflow before any other operations
- `adws/index.ts` — Export the new functions from the main adws module (if needed for external use)

### New Files
- `adws/__tests__/gitOperations.test.ts` — Unit tests for the new git operations functions

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add `getDefaultBranch()` Function to gitOperations.ts
- Open `adws/github/gitOperations.ts`
- Add a new function `getDefaultBranch()` that:
  - Uses the `gh` CLI to query the repository's default branch: `gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'`
  - Returns the default branch name as a string (e.g., `main`, `master`, `develop`)
  - Handles errors appropriately with meaningful error messages
  - Uses the existing `log` utility for consistent logging

### Step 2: Add `checkoutDefaultBranch()` Function to gitOperations.ts
- In `adws/github/gitOperations.ts`, add a new function `checkoutDefaultBranch()` that:
  - Calls `getDefaultBranch()` to get the default branch name
  - Executes `git checkout <default-branch>` to switch to the default branch
  - Executes `git pull origin <default-branch>` to pull the latest changes
  - Uses the existing `log` utility to report success/progress
  - Handles errors appropriately (e.g., uncommitted changes, network issues)
  - Returns the default branch name for reference

### Step 3: Export New Functions from github/index.ts
- Open `adws/github/index.ts`
- Add exports for `getDefaultBranch` and `checkoutDefaultBranch` from `./gitOperations`

### Step 4: Update adwPlanBuild.tsx to Use checkoutDefaultBranch()
- Open `adws/adwPlanBuild.tsx`
- Import `checkoutDefaultBranch` from `./github`
- In the `main()` function, add a call to `checkoutDefaultBranch()` immediately after fetching the GitHub issue (before recovery state detection)
- Add appropriate logging to indicate this step is being executed
- Store the returned default branch name for potential later use (e.g., PR base branch)

### Step 5: Create Unit Tests for New Functions
- Create `adws/__tests__/gitOperations.test.ts`
- Add tests for `getDefaultBranch()`:
  - Test successful retrieval of default branch name
  - Test error handling when `gh` command fails
- Add tests for `checkoutDefaultBranch()`:
  - Test successful checkout and pull
  - Test handling of checkout failures
  - Test handling of pull failures
- Use the same mocking patterns as `adws/__tests__/githubApi.test.ts` (mock `child_process` and `../core/utils`)

### Step 6: Run Validation Commands
- Execute all validation commands to verify the implementation works correctly with zero regressions

## Testing Strategy

### Unit Tests
- Test `getDefaultBranch()` returns the correct branch name from mocked `gh` output
- Test `getDefaultBranch()` throws appropriate error when `gh` command fails
- Test `checkoutDefaultBranch()` executes correct git commands in sequence
- Test `checkoutDefaultBranch()` handles errors gracefully

### Integration Testing
- Run the ADW workflow on a test issue to verify the default branch checkout occurs
- Verify that feature branches are created from the default branch
- Test recovery scenario: ensure the workflow still works when recovering from a previous run

### Manual Testing
- Start from a non-default branch and run `npx tsx adws/adwPlanBuild.tsx <issue-number>`
- Verify the workflow checks out the default branch before proceeding
- Verify the workflow pulls the latest changes

## Acceptance Criteria
- [ ] `getDefaultBranch()` function exists in `gitOperations.ts` and returns the repository's default branch name
- [ ] `checkoutDefaultBranch()` function exists in `gitOperations.ts` and checks out + pulls the default branch
- [ ] The ADW Plan & Build workflow (`adwPlanBuild.tsx`) calls `checkoutDefaultBranch()` at the start before creating feature branches
- [ ] Unit tests exist and pass for the new functions
- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` passes with no errors
- [ ] `npm test` passes with no regressions
- [ ] The workflow works correctly when started from any branch

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` — Run linter to check for code quality issues
- `npm run build` — Build the application to verify no build errors
- `npm test` — Run tests to validate the implementation and ensure no regressions

## Notes
- The `gh` CLI is already used throughout the codebase for GitHub operations, so using it for fetching the default branch is consistent with existing patterns
- The function should work with any default branch name (main, master, develop, etc.) since different repositories use different conventions
- Consider whether to skip the checkout if already on the default branch (optimization, but not required for initial implementation)
- The `checkoutBranch()` function already exists but is used for checking out specific named branches; the new `checkoutDefaultBranch()` function adds the step of dynamically determining which branch to checkout
- Error handling should be robust since this runs at the start of the workflow — a failure here should stop the workflow early with a clear error message
