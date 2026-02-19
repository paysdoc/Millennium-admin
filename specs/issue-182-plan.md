# PR-Review: Commit uncommitted files in PR #185

## PR-Review Description
The reviewer (paysdoc) flagged that two modified files have not been committed to the branch:

1. **`adws/__tests__/tokenLimitRecovery.test.ts`** — Contains a one-line addition of `applicationUrl: 'http://localhost:3000'` to the `createWorkflowConfig()` test helper. This change is directly related to the PR's work: the `WorkflowConfig` interface now includes `applicationUrl`, so the test mock must provide it to remain type-correct and accurate.

2. **`src/app/api/characters/[id]/route.ts`** — Contains two additions: an `import { revalidatePath } from 'next/cache'` statement and a `revalidatePath('/characters/${id}')` call after updating a character. This change is **unrelated** to issue #182 (dedicated app instance per worktree). It appears to be a stale modification in the worktree that was never committed or reverted. The file's git history shows it was last touched in issue #62 (character editing).

The review asks: "Why have tokenLimitRecover.test.ts and route.ts not been checked in?" Both uncommitted changes must be addressed — commit what belongs, revert what doesn't.

## Summary of Original Implementation Plan
The original plan is at `specs/issue-182-adw-unknown-sdlc_planner-dedicated-app-instance-per-worktree.md`. It specifies:

- Create `adws/core/portAllocator.ts` to allocate a random available port per worktree
- Add `applicationUrl` to `WorkflowConfig` and thread it through all agents, phases, and slash commands
- Update slash commands (`prepare_app.md`, `test_e2e.md`, `start.md`, `review.md`, `resolve_failed_e2e_test.md`) to accept dynamic ports
- Update e2e test files to use `applicationUrl` instead of hardcoded `localhost:3000`
- Update existing tests (`testAgent.test.ts`, `reviewAgent.test.ts`, `reviewRetry.test.ts`) and add a new `portAllocator.test.ts`
- Validate with `npm run lint`, `npm run build`, `npm test`

The plan did not explicitly list `tokenLimitRecovery.test.ts` in its relevant files, but the change is a direct consequence of modifying the `WorkflowConfig` interface (Step 3 of the plan).

## Relevant Files
Use these files to resolve the review:

- `adws/__tests__/tokenLimitRecovery.test.ts` — Contains an uncommitted one-line change adding `applicationUrl: 'http://localhost:3000'` to the mock `WorkflowConfig`. This is a required change since `WorkflowConfig` now includes `applicationUrl`, and the test helper must match the interface.
- `src/app/api/characters/[id]/route.ts` — Contains an uncommitted change adding `revalidatePath` import and call. This is unrelated to issue #182 and should be reverted to keep the branch clean.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Revert unrelated changes in `src/app/api/characters/[id]/route.ts`

- Run `git checkout -- "src/app/api/characters/[id]/route.ts"` to discard the uncommitted `revalidatePath` changes
- This change is unrelated to issue #182 (dedicated app instance per worktree) and should not be part of this PR
- If this change is needed, it should be implemented in a separate issue/branch

### Step 2: Stage and commit the tokenLimitRecovery test fix

- Stage the file: `git add adws/__tests__/tokenLimitRecovery.test.ts`
- Commit with a clear message explaining this adds the missing `applicationUrl` field to the test mock config, which is required after the `WorkflowConfig` interface was updated in this PR
- Commit message: `fix: add applicationUrl to tokenLimitRecovery test mock config`

### Step 3: Run validation commands

- Run `npm run lint`, `npm run build`, and `npm test` to confirm zero regressions after the commit and revert

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `tokenLimitRecovery.test.ts` change is a single line addition (`applicationUrl: 'http://localhost:3000'`) inside the `createWorkflowConfig()` helper. Without it, the test would fail to satisfy the `WorkflowConfig` type since `applicationUrl` is now a required field.
- The `route.ts` change (adding `revalidatePath`) is a legitimate improvement to the character update API but belongs in a separate issue/PR. Reverting it here keeps the branch focused on issue #182.
- After committing and reverting, push the branch so the PR reflects the changes.
