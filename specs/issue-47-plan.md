# Bug: PR should not be created until all tests pass

## Bug Description
The `adwPlanBuildTest` workflow creates a Pull Request during the Build phase (Step 7 in `adwBuild.tsx`) before the Test phase runs. This means that even if tests fail after exhausting all retry attempts (MAX_TEST_RETRY_ATTEMPTS), a PR has already been created and is visible on GitHub. This is problematic because PRs with failing tests should not be created in the first place.

**Expected behavior:** A PR should only be created after all tests (unit and E2E) pass successfully.

**Actual behavior:** A PR is created during the Build phase before tests are run. If tests fail after max retries, the PR already exists.

## Problem Statement
The PR creation step is located in `adwBuild.tsx` (Step 7, lines 329-338), which executes before `adwTest.tsx` runs. The orchestrator `adwPlanBuildTest.tsx` calls these phases sequentially, but PR creation happens too early in the workflow.

## Solution Statement
Move the PR creation logic from `adwBuild.tsx` to `adwPlanBuildTest.tsx`, executing it only after the Test phase completes successfully. If tests fail after maximum retry attempts, the workflow should exit without creating a PR.

## Steps to Reproduce
1. Run `npx tsx adws/adwPlanBuildTest.tsx <issue-number>` on an issue
2. The Plan phase completes successfully
3. The Build phase completes and creates a PR (Step 7)
4. The Test phase runs, tests fail, resolution is attempted
5. Tests still fail after MAX_TEST_RETRY_ATTEMPTS
6. PR already exists on GitHub despite tests failing

## Root Cause Analysis
The workflow architecture has a sequencing flaw:

1. `adwPlanBuildTest.tsx` orchestrates the workflow by calling three phases in order:
   - Phase 1: `adwPlan.tsx` - Plans the implementation
   - Phase 2: `adwBuild.tsx` - Implements AND creates PR (lines 329-338)
   - Phase 3: `adwTest.tsx` - Runs tests with retry logic

2. In `adwBuild.tsx` (lines 329-338), the PR is created at Step 7:
   ```typescript
   // Step 7: Create PR
   if (shouldExecuteStage('pr_created', recoveryState) && !ctx.prUrl) {
     postWorkflowComment(issueNumber, 'pr_creating', ctx);
     log('Creating Pull Request...', 'info');
     const prUrl = createPullRequest(issue, ctx.planOutput || '', ctx.buildOutput || '');
     ctx.prUrl = prUrl;
     postWorkflowComment(issueNumber, 'pr_created', ctx);
   }
   ```

3. The Test phase is completely independent and has no way to prevent or undo PR creation.

4. The fix requires separating the "implementation commit" step from the "PR creation" step, keeping the commit in Build and moving PR creation to after tests pass in the orchestrator.

## Relevant Files
Use these files to fix the bug:

- `adws/adwPlanBuildTest.tsx` - Main orchestrator that needs to handle PR creation after tests pass. This is where the PR creation logic should be moved to.
- `adws/adwBuild.tsx` - Currently contains PR creation logic (Step 7, lines 329-338) that needs to be removed. The "completed" workflow comment posting should also be removed since the workflow isn't complete until tests pass and PR is created.
- `adws/github/pullRequestCreator.ts` - Contains the `createPullRequest` function that will be called from the orchestrator instead. No changes needed to this file.
- `adws/github/index.ts` - May need to export `createPullRequest` if not already exported for use by orchestrator.
- `adws/github/workflowComments.ts` - Contains workflow comment functions and stage definitions. May need reference for understanding stage progression.
- `adws/core/dataTypes.ts` - Contains type definitions including `WorkflowStage`. May need to add new stages for test workflow integration.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Verify current exports in github/index.ts
- Read `adws/github/index.ts` to confirm what is currently exported
- Ensure `createPullRequest` is exported from the github module (it should be re-exported from `pullRequestCreator.ts`)

### Step 2: Remove PR creation from adwBuild.tsx
- Remove Step 7 (PR creation) from `adwBuild.tsx` (lines 329-338)
- Remove the "completed" workflow comment posting (line 341) since the workflow isn't complete until tests pass and PR is created
- Update the `printBuildSummary` function call to not expect a PR URL (pass empty string)
- Remove the `prUrl` from the final orchestrator state metadata
- Adjust the workflow comments: do NOT post `pr_creating`, `pr_created`, or `completed` stages
- Keep the implementation commit step (Step 6) intact

### Step 3: Update adwPlanBuildTest.tsx to create PR after tests pass
- Import `createPullRequest` from `./github`
- Import `fetchGitHubIssue` from `./github` to get issue details for PR creation
- After Test Phase succeeds (line 109), add PR creation logic:
  - Fetch the GitHub issue details
  - Call `createPullRequest` with issue, plan summary (empty), and build summary (empty)
  - Log the PR URL on success
- If Test Phase fails, log that no PR was created due to test failures and exit with code 1

### Step 4: Update workflow comments for the new flow
- In `adwPlanBuildTest.tsx`, post appropriate workflow comments:
  - Post `pr_creating` comment before creating PR
  - Post `pr_created` comment after PR is created
  - Post `completed` comment after PR is created
  - Post `error` comment if tests fail after max retries (no PR created)
- Import `postWorkflowComment` and `WorkflowContext` from `./github`

### Step 5: Run validation commands
- Run `npm run lint` to check for linting errors
- Run `npm run build` to verify TypeScript compilation
- Run `npm test` to run unit tests and verify no regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The `createPullRequest` function is already self-contained in `pullRequestCreator.ts` and handles pushing the branch before creating the PR.
- The `adwTest.tsx` already returns appropriate exit codes: `process.exit(1)` if tests fail, `process.exit(0)` (implicit) if tests pass.
- The orchestrator `adwPlanBuildTest.tsx` already checks the exit status of each subprocess via `runSubprocess` and handles failures appropriately.
- Consider adding a workflow comment when tests fail indicating no PR was created. This provides visibility to users monitoring the issue.
- The `WorkflowContext` interface already has `prUrl` as an optional field, so it can be omitted when posting comments before PR creation.
- No new libraries are needed for this fix.
