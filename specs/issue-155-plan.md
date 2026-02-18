# PR-Review: Resolve merge conflicts with develop branch

## PR-Review Description
PR #162 (feat: Add additional adws and refactor existing adws) targets the `develop` branch and is currently in a `CONFLICTING` / `DIRTY` merge state. The reviewer (paysdoc) left a comment: "resolve conflicts". GitHub shows the PR cannot be merged due to a content conflict in `adws/__tests__/workflowPhases.test.ts`. The conflict arises because:

1. **Our branch** added `runPullRequestAgent` support: a new mock, a new import, and rewrote `executePRPhase` tests to use the agent instead of `createPullRequest`.
2. **The `develop` branch** made three independent changes: (a) moved `issueClassifier` from `../triggers/issueClassifier` to `../core/issueClassifier`, (b) removed the `adw-` prefix from `generateAdwId` mock return value (`'adw-test-issue-abc123'` → `'test-issue-abc123'`), and (c) updated corresponding `adwId` assertions to match.

These changes are logically independent and both should be kept. The resolution is to merge `origin/develop` into this branch and accept both sets of changes.

Additionally, there are two unstaged local changes (`adws/__tests__/planAgent.test.ts` and `adws/agents/testAgent.ts`) that should be stashed or committed before the merge to avoid losing work.

## Summary of Original Implementation Plan
The original implementation plan (at `specs/issue-155-adw--sdlc_planner-add-port-typescript-adws.md`) covers porting all remaining ADW orchestrators to TypeScript: creating `adwDocument.tsx`, `adwPatch.tsx`, `adwPlanBuildReview.tsx`, `adwPlanBuildDocument.tsx`, `adwSdlc.tsx`, new agents (`prAgent.ts`, `documentAgent.ts`), new phases (`documentPhase.ts`), refactoring `prPhase.ts` to use the `/pull_request` skill, updating barrel exports, `issueTypes.ts` mappings, `classify_adw.md`, and `README.md`. All of this work has been implemented in the latest commit (`d3b9b96`).

## Relevant Files
Use these files to resolve the review:

- `adws/__tests__/workflowPhases.test.ts` - The sole conflicting file. Contains tests for workflow phases. Needs the `issueClassifier` path updated from `../triggers/issueClassifier` to `../core/issueClassifier`, the `generateAdwId` mock updated to return `'test-issue-abc123'` (without `adw-` prefix), and all corresponding `adwId` assertions updated — while preserving the `runPullRequestAgent` mock, import, and `executePRPhase` test changes from our branch.
- `adws/__tests__/planAgent.test.ts` - Has unstaged local changes (type cast cleanup: `as unknown as fs.Dirent[]` → `as any`). Must be preserved through the merge.
- `adws/agents/testAgent.ts` - Has unstaged local changes (e2e test directory path changed from `.claude/commands/e2e-examples` to `e2e-tests`). Must be preserved through the merge.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Stash unstaged local changes
- Run `git stash` to save the unstaged changes in `adws/__tests__/planAgent.test.ts` and `adws/agents/testAgent.ts` so they are not lost during the merge.

### Step 2: Fetch latest develop and merge into current branch
- Run `git fetch origin develop` to get the latest changes.
- Run `git merge origin/develop` — this will produce a conflict in `adws/__tests__/workflowPhases.test.ts`.

### Step 3: Resolve the conflict in `adws/__tests__/workflowPhases.test.ts`
The resolution must accept **both** sets of changes. Specifically:

**3a. `generateAdwId` mock (line ~34):**
- Accept develop's change: `generateAdwId: vi.fn().mockReturnValue('test-issue-abc123'),` (remove the `adw-` prefix).

**3b. Agents mock block (lines ~106-149):**
- Keep our branch's addition of the `runPullRequestAgent` mock at the end of the `vi.mock('../agents', ...)` block.

**3c. `issueClassifier` mock (line ~151):**
- Accept develop's change: `vi.mock('../core/issueClassifier', ...)` instead of `vi.mock('../triggers/issueClassifier', ...)`.

**3d. Agents import (line ~176):**
- Keep our branch's addition of `runPullRequestAgent` in the agents import.

**3e. `issueClassifier` import (line ~177):**
- Accept develop's change: `import { classifyGitHubIssue } from '../core/issueClassifier';` instead of `from '../triggers/issueClassifier'`.

**3f. `adwId` assertions (lines ~312, ~345, ~352, ~783):**
- Accept develop's change: update all `expect(config.adwId).toBe('adw-test-issue-abc123')` to `expect(config.adwId).toBe('test-issue-abc123')`.

**3g. `executePRPhase` tests (lines ~558-592):**
- Keep our branch's version which uses `runPullRequestAgent` (async tests, `await executePRPhase`, assertions on `runPullRequestAgent` and `result.costUsd`).

### Step 4: Stage and complete the merge
- Run `git add adws/__tests__/workflowPhases.test.ts` to mark the conflict as resolved.
- Run `git commit --no-edit` to complete the merge commit (using the auto-generated merge message).

### Step 5: Pop the stash to restore local changes
- Run `git stash pop` to restore the unstaged changes to `adws/__tests__/planAgent.test.ts` and `adws/agents/testAgent.ts`.

### Step 6: Run validation commands
- Run `npm run lint`, `npm run build`, and `npm test` to verify everything compiles and passes with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The conflict is purely in the test file — no source code conflicts exist.
- The two sets of changes (our `runPullRequestAgent` refactor vs develop's `issueClassifier` path move and `adwId` prefix removal) are logically independent, so both should be accepted in full.
- After resolving, ensure the file has no duplicate mocks, imports, or test cases.
- The unstaged changes in `planAgent.test.ts` and `testAgent.ts` appear to be work-in-progress fixes that should be preserved but are separate from this conflict resolution.
