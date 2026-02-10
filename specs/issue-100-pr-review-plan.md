# PR-Review: Reinstate worktree creation — branch should not be created in main worktree

## PR-Review Description
The reviewer (paysdoc) identified that the implementation of #100 removed the worktree creation process. The `generate_branch_name.md` skill currently runs `git checkout main`, `git pull`, and `git checkout -b <branch_name>` directly in the **main repository working directory**. This means the new branch is being created and checked out in the main worktree instead of being created as part of the worktree isolation process.

The original workflow used `setupWorktreeWithLatestCode()` which:
1. Checked for existing worktrees and reused them if found
2. Called `checkoutDefaultBranch()` on the main repo (checkout main + pull)
3. Created a new worktree with the branch via `ensureWorktree(branchName, defaultBranch)` — which uses `git worktree add -b <branch> <path> <baseBranch>` to create both the worktree and branch atomically

The new implementation has the agent running git operations directly in the main repo, then creates the worktree separately. This is problematic because:
- The main repo's working directory is left on the new branch instead of the default branch
- It bypasses the worktree's atomic branch+worktree creation
- Other workflows or users sharing the main repo may be affected

The fix is to:
1. Update `generate_branch_name.md` to **only generate the branch name** without running any git operations (no checkout, no pull, no branch creation)
2. Update `runGenerateBranchNameAgent()` to only return the generated name
3. Reinstate worktree creation logic that creates the branch inside the worktree using the worktree operations (`ensureWorktree` with `baseBranch` or `createWorktreeForNewBranch`)

## Summary of Original Implementation Plan
The original plan (specs/issue-100-plan.md) described extracting git branch creation and commit processes from ADW orchestrators into Claude Code skills. It involved:
1. Creating `.claude/commands/commit.md` and `.claude/commands/generate_branch_name.md` skill files
2. Creating `adws/agents/gitAgent.ts` with `runGenerateBranchNameAgent()` and `runCommitAgent()` wrapper functions
3. Updating `workflowPhases.ts` to use agent-based branch naming and committing instead of direct `createFeatureBranch()` and `commitChanges()` calls
4. The plan's Note section explicitly stated: "The branch name agent runs in the main repo (not the worktree) because it needs to `git checkout main && git pull && git checkout -b`." — This is the design decision the reviewer is asking to change.

## Relevant Files
Use these files to resolve the review:

- **`.claude/commands/generate_branch_name.md`** — The skill file that currently runs git operations in the main repo. Must be updated to only generate the branch name without any git operations.
- **`adws/agents/gitAgent.ts`** — Contains `runGenerateBranchNameAgent()` which passes `cwd` as the main repo path. Must be updated since the agent no longer needs a specific cwd for git operations.
- **`adws/workflowPhases.ts`** — Contains `initializeWorkflow()` where the worktree creation logic was changed. Must reinstate proper worktree creation using `ensureWorktree(branchName, defaultBranch)` or equivalent, and also reinstate the handling for existing worktrees (merge latest code into them).
- **`adws/github/worktreeOperations.ts`** — Contains `ensureWorktree()`, `createWorktree()`, `createWorktreeForNewBranch()`, `getWorktreeForBranch()`, `copyEnvToWorktree()`, `getMainRepoPath()`. Reference for the worktree creation API.
- **`adws/github/gitOperations.ts`** — Contains `checkoutDefaultBranch()`, `mergeLatestFromDefaultBranch()`, `generateBranchName()`. `checkoutDefaultBranch()` was removed from imports in the current implementation and needs to be reinstated.
- **`adws/__tests__/gitAgent.test.ts`** — Tests for gitAgent functions. May need updates if `runGenerateBranchNameAgent` signature changes (e.g., `cwd` default behavior).
- **`adws/__tests__/workflowPhases.test.ts`** — Tests for workflow phases. May need updates to verify worktree creation is reinstated.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `.claude/commands/generate_branch_name.md` to remove git operations

- Remove the `## Run` section's git commands (`git checkout main`, `git pull`, `git checkout -b <branch_name>`).
- Replace the `## Run` section with instructions to **only generate the branch name** and return it. The skill should not perform any git operations. Example:
  ```
  ## Run

  Generate the branch name based on the instructions above.
  Do NOT run any git commands. Only generate the branch name string.
  ```
- The `## Report` section stays the same: "Return ONLY the branch name (no other text)".

### Step 2: Update `adws/agents/gitAgent.ts` — `runGenerateBranchNameAgent()`

- Remove the import of `getMainRepoPath` from `../github/worktreeOperations` since it's no longer needed as a default cwd.
- Update `runGenerateBranchNameAgent()`:
  - Remove the `cwd` parameter entirely (or keep it optional but remove the `getMainRepoPath()` default). The agent no longer needs to run in a specific directory since it doesn't execute git commands.
  - Remove the `effectiveCwd` logic that defaults to `getMainRepoPath()`.
  - Update the `runClaudeAgentWithCommand()` call to not pass a `cwd` (or pass `undefined`).
  - Update the JSDoc to reflect that this agent only generates a branch name without creating it.

### Step 3: Update `adws/workflowPhases.ts` — `initializeWorkflow()`

- Reinstate `checkoutDefaultBranch` in the imports from `./github`.
- Reinstate `getWorktreeForBranch` in the imports from `./github`.
- Remove `getMainRepoPath` from the imports (no longer needed in this file since we don't pass it to the agent).
- In the `else` branch (no `--cwd` provided), reinstate the worktree creation flow:
  1. Call `runGenerateBranchNameAgent(issueType, adwId, issue, logsDir)` to generate the branch name **only** (no git operations).
  2. Extract the branch name from the result.
  3. Check if a worktree already exists for this branch using `getWorktreeForBranch(branchName)`:
     - If it exists, reuse it and call `mergeLatestFromDefaultBranch(defaultBranch, existingPath)` + `copyEnvToWorktree(existingPath)`.
     - If it doesn't exist, call `checkoutDefaultBranch()` to ensure main repo is on the default branch with latest code, then call `ensureWorktree(branchName, defaultBranch)` to create both the worktree and branch atomically via `git worktree add -b <branch> <path> <baseBranch>`.
  4. Set `worktreePath` from the result.
- This essentially reinstates the logic from the removed `setupWorktreeWithLatestCode()` function, but uses the agent-generated branch name instead of `generateBranchName()`.

### Step 4: Update tests in `adws/__tests__/gitAgent.test.ts`

- Update tests for `runGenerateBranchNameAgent()` to reflect:
  - The function no longer accepts or defaults to a `cwd` parameter (or if kept optional, the default is no longer `getMainRepoPath()`).
  - The agent is expected to NOT run git operations.
- Verify `formatBranchNameArgs()` tests remain valid (no changes expected).
- Verify `extractBranchNameFromOutput()` tests remain valid (no changes expected).

### Step 5: Update tests in `adws/__tests__/workflowPhases.test.ts`

- If there are tests that mock the worktree creation flow in `initializeWorkflow()`, update them to verify:
  - `checkoutDefaultBranch()` is called when creating a new worktree.
  - `ensureWorktree(branchName, defaultBranch)` is called with the `defaultBranch` parameter.
  - The worktree-reuse path still works (when `getWorktreeForBranch()` returns an existing path).

### Step 6: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to verify all changes pass validation with zero regressions.
- Ensure no unused imports remain.
- Ensure all existing tests pass.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The key insight from the reviewer is that worktree isolation is a fundamental design pattern in this project. Branch creation should happen **inside the worktree** (via `git worktree add -b`), not in the main repo's working directory.
- The `generate_branch_name.md` skill should be a pure naming function — it generates a name string, nothing more. The git operations (checkout default branch, pull, create worktree with branch) remain in the TypeScript orchestrator code where they belong.
- The `commit.md` skill is NOT affected by this review — it correctly runs in the worktree cwd and its git operations (diff, add, commit) are appropriate for the worktree context.
- The `runGenerateBranchNameAgent()` function's `cwd` parameter was originally set to `getMainRepoPath()` because the skill ran git commands in the main repo. Since the skill no longer runs git commands, the cwd becomes irrelevant for this agent.
- The reinstated worktree flow should handle the same edge cases as the original `setupWorktreeWithLatestCode()`: existing worktrees are reused with a merge, new worktrees are created from the default branch.
