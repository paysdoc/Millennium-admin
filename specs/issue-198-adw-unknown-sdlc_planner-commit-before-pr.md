# Bug: ADW creates pull request with uncommitted changes

## Metadata
issueNumber: `198`
adwId: `adw-unknown`
issueJson: `{}`

## Bug Description
Occasionally, a pull request is created with uncommitted changes still in the local workspace. The ADW workflow phases (plan, build, test, review) can leave file modifications that are not committed before the PR phase runs. The expected behavior is that all changes are committed (or cleaned up if unused) before a pull request is created.

## Problem Statement
The `executePRPhase` in `adws/phases/prPhase.ts` creates a pull request without first verifying that all workspace changes have been committed. Multiple upstream phases can leave uncommitted changes:

1. **Test Phase** (`testPhase.ts`): When tests fail, `runResolveTestAgent` and `runResolveE2ETestAgent` modify source code to fix tests, but the test phase never commits these changes. In workflows like `adwPlanBuildTestReview.tsx` and `adwSdlc.tsx`, the flow is Build (commit) → Test (no commit) → PR.
2. **Build Phase** (`buildPhase.ts`): While the build phase calls `runCommitAgent`, the commit agent is an AI agent that could fail to capture all changes or encounter edge cases.
3. **Any phase** can potentially leave files uncommitted due to agent execution edge cases.

## Solution Statement
Add a defensive commit step at the beginning of `executePRPhase` in `adws/phases/prPhase.ts`. Before creating the PR, check for uncommitted changes using the existing `hasUncommittedChanges()` utility. If uncommitted changes exist, run `runCommitAgent()` to stage and commit them. This acts as a safety net that catches uncommitted changes from any upstream phase, ensuring the PR always reflects the full state of the workspace.

## Steps to Reproduce
1. Run an ADW orchestrator that includes a test phase before the PR phase (e.g., `adwPlanBuildTestReview.tsx` or `adwSdlc.tsx`)
2. Have a test fail during the test phase, triggering the `runResolveTestAgent` to fix the test
3. The resolve agent modifies source files to fix the test
4. The test phase completes successfully (tests pass after resolution)
5. The PR phase creates a pull request
6. **Result**: The PR is created but the test resolution changes remain uncommitted in the workspace
7. **Expected**: All changes should be committed before the PR is created

## Root Cause Analysis
The root cause is a missing commit step between the test phase and the PR phase. The test phase (`testPhase.ts`) runs `runResolveTestAgent` and `runResolveE2ETestAgent` when tests fail, which invoke Claude agents that modify source code. However, unlike the build phase (which explicitly calls `runCommitAgent` at line 166 of `buildPhase.ts`) and the document phase (which calls `runCommitAgent` at line 87 of `documentPhase.ts`), the test phase has no commit step after resolving test failures.

Additionally, even for phases that do commit (build, plan), the commit agent is an AI agent that could miss files in edge cases. There is no safety net to ensure everything is committed before PR creation.

The `prPhase.ts` proceeds directly to creating a pull request without any check, pushing the branch with uncommitted changes still in the workspace.

## Relevant Files
Use these files to fix the bug:

- `adws/phases/prPhase.ts` - **The PR phase that needs the fix.** Currently creates PRs without checking for uncommitted changes. This is where the commit safety net will be added.
- `adws/core/orchestratorLib.ts` - **Contains `hasUncommittedChanges()` utility** already used elsewhere in the codebase. Will be imported into `prPhase.ts`.
- `adws/agents/gitAgent.ts` - **Contains `runCommitAgent()`** used to commit changes. Already imported via `../agents` in `prPhase.ts`.
- `adws/__tests__/workflowPhases.test.ts` - **Existing tests for workflow phases.** Contains `executePRPhase` tests that need to be extended to cover the new commit-before-PR behavior.
- `adws/core/index.ts` - **Core module barrel export.** Already exports `hasUncommittedChanges`.
- `guidelines/coding_guidelines.md` - **Coding guidelines** to ensure adherence.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add commit safety net to `executePRPhase` in `adws/phases/prPhase.ts`
- Import `hasUncommittedChanges` from `../core` (add to existing import statement)
- Import `runCommitAgent` from `../agents` (add to existing import statement)
- Before the existing `if (shouldExecuteStage('pr_created', recoveryState))` block, add a new block that:
  1. Calls `hasUncommittedChanges(worktreePath)` to check for uncommitted changes
  2. If uncommitted changes exist, logs an info message: `'Uncommitted changes detected, committing before PR creation...'`
  3. Calls `runCommitAgent` with the appropriate parameters from `config` (agent name `'pre-pr-commit'`, issue type from `config.issueType`, issue context from `config.issue`, logs dir from `config.logsDir`, and worktree path from `config.worktreePath`)
  4. Logs a success message after committing
- This block should execute unconditionally (not gated by `shouldExecuteStage`) since it's a safety net

### 2. Add unit tests for the commit-before-PR behavior in `adws/__tests__/workflowPhases.test.ts`
- In the existing `describe('executePRPhase')` test block, add new test cases:
  - **Test: commits uncommitted changes before creating PR** - Mock `hasUncommittedChanges` to return `true`, verify `runCommitAgent` is called before `runPullRequestAgent`
  - **Test: skips commit when no uncommitted changes** - Mock `hasUncommittedChanges` to return `false`, verify `runCommitAgent` is NOT called, verify `runPullRequestAgent` is still called
  - **Test: commits before PR even when PR stage is skipped** - Mock `shouldExecuteStage` to return `false` and `hasUncommittedChanges` to return `true`, verify `runCommitAgent` is still called (safety net runs unconditionally)

### 3. Run validation commands to ensure the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The fix uses existing utilities (`hasUncommittedChanges` and `runCommitAgent`) that are already proven in the codebase, minimizing risk.
- The safety net approach is intentionally defensive — even if individual phases are later fixed to commit their own changes, this check ensures nothing slips through.
- The `runCommitAgent` is a no-op when there are no changes to commit (it delegates to the `/commit` skill which checks `git status` first), so the additional call is safe even in the common case where everything is already committed.
- `issueType` is needed by `runCommitAgent` to determine the commit prefix. It is available on the `WorkflowConfig` object.
