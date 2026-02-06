# Bug: Review plans created in wrong worktree

## Bug Description
When the ADW PR Review workflow processes review comments, the Claude agent makes file modifications (like updating plan files) in the main worktree instead of the issue's worktree. This causes plan files and other changes to appear in the wrong directory, leading to unexpected behavior and potential conflicts when multiple PRs are being processed simultaneously.

**Expected behavior:** When processing PR review comments, all file operations should occur within the worktree created for that PR branch.

**Actual behavior:** File operations occur in `process.cwd()` (typically the main repository), regardless of which worktree was created for the PR.

## Problem Statement
The `runClaudeAgent` and `runClaudeAgentWithCommand` functions in `claudeAgent.ts` hardcode `process.cwd()` as the working directory when spawning the Claude process. Even though `adwPrReview.tsx` correctly creates a worktree via `ensureWorktree()`, this worktree path is never passed to the agent functions, causing the Claude agent to operate in the wrong directory.

## Solution Statement
Add an optional `cwd` parameter to the Claude agent runner functions and propagate this parameter through the agent function chain. Update `adwPrReview.tsx` to pass the worktree path to all agent invocations, ensuring all file operations occur in the correct worktree.

## Steps to Reproduce
1. Create a PR from a feature branch
2. Add review comments to the PR
3. Run `npx tsx adws/adwPrReview.tsx <pr-number>`
4. Observe that any plan file modifications appear in the main worktree instead of the `.worktrees/<branch-name>/` directory

## Root Cause Analysis
The bug originates from two locations in `claudeAgent.ts`:

1. **Line 172-175** in `runClaudeAgent`:
   ```typescript
   const claude = spawn(CLAUDE_CODE_PATH, args, {
     cwd: process.cwd(),  // <-- Bug: hardcoded to current directory
     env: { ...process.env }
   });
   ```

2. **Line 319-323** in `runClaudeAgentWithCommand`:
   ```typescript
   const claude = spawn(CLAUDE_CODE_PATH, cliArgs, {
     cwd: process.cwd(),  // <-- Bug: hardcoded to current directory
     env: { ...process.env },
     stdio: ['ignore', 'pipe', 'pipe']
   });
   ```

In `adwPrReview.tsx`:
- Line 106: `ensureWorktree(prDetails.headBranch)` correctly returns the worktree path
- Lines 138, 176: `runPrReviewPlanAgent` and `runPrReviewBuildAgent` are called without passing the worktree path
- The agent functions don't have parameters to accept a working directory

## Relevant Files
Use these files to fix the bug:

- `adws/agents/claudeAgent.ts` - Core agent runner that spawns Claude processes. Contains the root cause where `process.cwd()` is hardcoded.
- `adws/agents/planAgent.ts` - Plan agent functions that need to accept and pass through the `cwd` parameter.
- `adws/agents/buildAgent.ts` - Build agent functions that need to accept and pass through the `cwd` parameter.
- `adws/agents/testAgent.ts` - Test agent functions that need to accept and pass through the `cwd` parameter. Also contains `discoverE2ETestFiles` which uses `process.cwd()`.
- `adws/agents/testRetry.ts` - Test retry logic that calls test agents and needs to pass through the `cwd` parameter.
- `adws/agents/index.ts` - Agent exports, may need to update type exports.
- `adws/adwPrReview.tsx` - PR review workflow that creates the worktree but doesn't pass it to agents.
- `adws/adwPlan.tsx` - Plan workflow already has `--cwd` option pattern that can be referenced but also needs updating for agent calls.
- `adws/__tests__/worktreeOperations.test.ts` - Existing worktree tests to verify behavior.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `claudeAgent.ts` to accept optional `cwd` parameter
- Add optional `cwd?: string` parameter to `runClaudeAgent` function signature
- Add optional `cwd?: string` parameter to `runClaudeAgentWithCommand` function signature
- Replace `cwd: process.cwd()` with `cwd: cwd || process.cwd()` in both spawn calls
- Update JSDoc comments to document the new parameter

### Step 2: Update `planAgent.ts` to accept and pass `cwd` parameter
- Add optional `cwd?: string` parameter to `runPrReviewPlanAgent` function signature
- Add optional `cwd?: string` parameter to `runPlanAgent` function signature
- Pass the `cwd` parameter to `runClaudeAgentWithCommand` calls
- Update JSDoc comments to document the new parameter

### Step 3: Update `buildAgent.ts` to accept and pass `cwd` parameter
- Add optional `cwd?: string` parameter to `runPrReviewBuildAgent` function signature
- Add optional `cwd?: string` parameter to `runBuildAgent` function signature
- Pass the `cwd` parameter to `runClaudeAgentWithCommand` calls
- Update JSDoc comments to document the new parameter

### Step 4: Update `testAgent.ts` to accept and pass `cwd` parameter
- Add optional `cwd?: string` parameter to `runTestAgent` function signature
- Add optional `cwd?: string` parameter to `runE2ETestAgent` function signature
- Add optional `cwd?: string` parameter to `runResolveTestAgent` function signature
- Add optional `cwd?: string` parameter to `runResolveE2ETestAgent` function signature
- Update `discoverE2ETestFiles` to use the `cwd` parameter (already has `baseDir` parameter, ensure it's used correctly)
- Pass the `cwd` parameter to `runClaudeAgentWithCommand` calls
- Update JSDoc comments to document the new parameter

### Step 5: Update `testRetry.ts` to accept and pass `cwd` parameter
- Add optional `cwd?: string` field to `TestRetryOptions` interface
- Update `runUnitTestsWithRetry` to pass `cwd` to `runTestAgent` and `runResolveTestAgent`
- Update `runE2ETestsWithRetry` to pass `cwd` to `discoverE2ETestFiles`, `runE2ETestAgent`, and `runResolveE2ETestAgent`

### Step 6: Update `adwPrReview.tsx` to pass worktree path to all agents
- Pass `worktreePath` to `runPrReviewPlanAgent` call on line 138
- Pass `worktreePath` to `runPrReviewBuildAgent` call on line 176
- Pass `worktreePath` to `runUnitTestsWithRetry` options
- Pass `worktreePath` to `runE2ETestsWithRetry` options
- The worktree path is already captured on line 106 via `ensureWorktree(prDetails.headBranch)`

### Step 7: Update `adwPlan.tsx` to pass cwd to agent calls
- Pass `cwd` parameter to `classifyIssue` call on line 308
- Pass `cwd` parameter to `runPlanAgent` call on line 369
- Update `classifyIssue` function to accept and pass `cwd` to `runClaudeAgentWithCommand`

### Step 8: Write unit tests for cwd propagation
- Add test case in `adws/__tests__/` to verify cwd is passed correctly to spawn
- Test that agents use the provided cwd when specified
- Test that agents fall back to `process.cwd()` when cwd is not provided

### Step 9: Run validation commands
- Run linter to check for code quality issues
- Run build to verify no build errors
- Run tests to validate the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The `adwPlan.tsx` file already has a `--cwd` CLI option pattern that shows awareness of working directory concerns, but the cwd is not propagated to agent functions
- The `gitOperations.ts` functions like `commitChanges` and `createFeatureBranch` already accept an optional `cwd` parameter, providing a reference pattern for this fix
- This bug affects all ADW workflows that use worktrees, not just PR review - the fix should benefit planning and build workflows as well
- When testing, create a test worktree and verify that file operations occur in the worktree directory rather than the main repository
