# Bug: Worktree creation fails due to unquoted branch names in shell commands

## Metadata
issueNumber: ``
adwId: ``
issueJson: ``

## Bug Description
When the ADW workflow creates a worktree for a new branch, the `git worktree add` command fails with a shell error:
```
/bin/sh: chore-issue-158-adw-adw-copy-env-local-to-wo-pwzbst-copy-env-local-worktree: command not found
```

The branch name is being interpreted as a shell command instead of as an argument to `git worktree add`. This causes the entire ADW workflow to abort at the worktree creation step.

**Expected behavior:** `git worktree add -b <branchName> "<worktreePath>" <baseBranch>` should create a worktree with the given branch name.

**Actual behavior:** The shell fails to parse the command, treating the branch name as a command to execute, and the worktree is never created.

## Problem Statement
Branch names are interpolated into `execSync()` template literals without shell quoting in `worktreeCreation.ts`, `worktreeOperations.ts`, and `gitOperations.ts`. When the shell processes these commands, edge cases in parsing (e.g., long branch names, certain character combinations) can cause the branch name to be misinterpreted. Additionally, the `adw-` prefix is duplicated in generated branch names (`adw-adw-...`) because `generateAdwId()` already prepends `adw-` and the branch name format template adds another `adw-`.

## Solution Statement
1. **Quote all branch name interpolations** in `execSync()` calls across the three affected files (`worktreeCreation.ts`, `worktreeOperations.ts`, `gitOperations.ts`) by wrapping `${branchName}` with double quotes `"${branchName}"`.
2. **Add a branch name validation function** in `gitAgent.ts` that sanitizes the extracted branch name (strips invalid characters, enforces max length, validates format) before it's used in any git commands.
3. **Fix the `adw-` prefix duplication** in `generateAdwId()` in `core/utils.ts` — the function should not prepend `adw-` since the branch name format template already includes the `adw-` prefix.

## Steps to Reproduce
1. Create a GitHub issue with a long title (e.g., "Copy .env.local to worktree")
2. Run an ADW workflow: `npx tsx adws/adwPlanBuildTest.tsx <issueNumber>`
3. The workflow generates a branch name like `chore-issue-158-adw-adw-copy-env-local-to-wo-pwzbst-copy-env-local-worktree`
4. The `git worktree add -b` command fails because the branch name is not quoted in the shell command
5. Error: `/bin/sh: <branchName>: command not found`

## Root Cause Analysis
There are three contributing factors:

### 1. Unquoted branch names in shell commands (Primary cause)
In `worktreeCreation.ts`, the `execSync` calls interpolate `branchName` without quotes:
- Line 93: `execSync(\`git rev-parse --verify ${branchName}\`, { stdio: 'pipe' })`
- Line 98: `execSync(\`git rev-parse --verify origin/${branchName}\`, { stdio: 'pipe' })`
- Line 125: `execSync(\`git worktree add "${worktreePath}" ${branchName}\`, { stdio: 'pipe' })`
- Line 129: `execSync(\`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}\`, { stdio: 'pipe' })`
- Line 162: `execSync(\`git worktree add -b ${branchName} "${worktreePath}" ${base}\`, { stdio: 'pipe' })`

The same pattern exists in `worktreeOperations.ts` (line 170) and `gitOperations.ts` (lines 68, 70, 85, 86, 124).

When `/bin/sh` processes the command string, any parsing ambiguity with the unquoted branch name can cause the shell to misinterpret it — particularly with long names that may interact with shell line-length handling or buffering.

### 2. Duplicated `adw-` prefix
`generateAdwId()` in `core/utils.ts` (line 19) returns `adw-${slug}-${random}`, producing IDs like `adw-copy-env-local-to-wo-pwzbst`. The branch name format in `.claude/commands/generate_branch_name.md` is `<issueClass>-issue-<issueNumber>-adw-<adwId>-<concise_name>`, which inserts `adw-` before the adwId. Combined, this produces `adw-adw-copy-env-local-to-wo-pwzbst` — a redundant `adw-adw-` prefix that lengthens the branch name unnecessarily.

### 3. No branch name validation after extraction
`extractBranchNameFromOutput()` in `gitAgent.ts` (line 27-31) simply takes the last non-empty line of the agent's output with no validation that it's a valid git branch name. If the agent outputs unexpected content, the invalid branch name propagates to git commands.

## Relevant Files
Use these files to fix the bug:

- `adws/github/worktreeCreation.ts` — Contains `createWorktree()` and `createWorktreeForNewBranch()` with unquoted `${branchName}` in `execSync` calls. This is the primary crash site.
- `adws/github/worktreeOperations.ts` — Contains `freeBranchFromMainRepo()` with unquoted `${branchName}` in `git push` command (line 170).
- `adws/github/gitOperations.ts` — Contains `createFeatureBranch()`, `checkoutBranch()`, and `pushBranch()` with unquoted `${branchName}` in `execSync` calls (lines 68, 70, 85, 86, 124).
- `adws/agents/gitAgent.ts` — Contains `extractBranchNameFromOutput()` which needs validation logic added.
- `adws/core/utils.ts` — Contains `generateAdwId()` which duplicates the `adw-` prefix.
- `adws/__tests__/worktreeOperations.test.ts` — Existing tests for worktree operations; must be updated to verify quoted branch names.
- `adws/__tests__/gitAgent.test.ts` — Existing tests for git agent; must be updated to test branch name validation.
- `adws/__tests__/generateAdwId.test.ts` — Existing tests for `generateAdwId()`; must be updated after removing the `adw-` prefix.
- `.claude/commands/generate_branch_name.md` — Branch name format reference (read-only, no changes needed).
- `adws/README.md` — Documents the ADW ID format; may need minor update after `generateAdwId()` change.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix `generateAdwId()` to remove `adw-` prefix duplication
- Read `adws/core/utils.ts`
- Change `generateAdwId()` (line 19) from `return \`adw-${slug}-${random}\`` to `return \`${slug}-${random}\``
- Change the fallback (line 23) from `return \`adw-${Date.now()}-${random}\`` to `return \`${Date.now()}-${random}\``
- Read `adws/__tests__/generateAdwId.test.ts` and update tests to expect the new format without `adw-` prefix
- Run `npm test -- --run adws/__tests__/generateAdwId.test.ts` to verify

### 2. Add branch name validation to `extractBranchNameFromOutput()`
- Read `adws/agents/gitAgent.ts`
- Add a `validateBranchName()` function that:
  - Strips any leading/trailing whitespace
  - Removes characters invalid in git branch names (spaces, `~`, `^`, `:`, `\`, `*`, `?`, `[`, `@{`, `..`)
  - Enforces a maximum length of 100 characters (truncating if needed, ensuring no trailing dash)
  - Throws an error if the result is empty
- Call `validateBranchName()` inside `extractBranchNameFromOutput()` on the extracted name before returning
- Read `adws/__tests__/gitAgent.test.ts` and add tests for the new validation:
  - Test that valid branch names pass through unchanged
  - Test that branch names exceeding 100 characters are truncated
  - Test that invalid characters are stripped
  - Test that empty output throws an error
- Run `npm test -- --run adws/__tests__/gitAgent.test.ts` to verify

### 3. Quote branch names in `worktreeCreation.ts`
- Read `adws/github/worktreeCreation.ts`
- On line 93, change `${branchName}` to `"${branchName}"`
- On line 98, change `origin/${branchName}` to `"origin/${branchName}"`
- On line 125, change `${branchName}` to `"${branchName}"`
- On line 129, change `-b ${branchName}` to `-b "${branchName}"`
- On line 162, change `-b ${branchName}` to `-b "${branchName}"`
- Read `adws/__tests__/worktreeOperations.test.ts` and update test assertions that check `execSync` call arguments to expect quoted branch names in the `git worktree add` commands
- Run `npm test -- --run adws/__tests__/worktreeOperations.test.ts` to verify

### 4. Quote branch names in `worktreeOperations.ts`
- Read `adws/github/worktreeOperations.ts`
- On line 170, change `git push -u origin ${branchName}` to `git push -u origin "${branchName}"`
- Run `npm test -- --run adws/__tests__/worktreeOperations.test.ts` to verify

### 5. Quote branch names in `gitOperations.ts`
- Read `adws/github/gitOperations.ts`
- On line 68, change `git checkout ${branchName}` to `git checkout "${branchName}"`
- On line 70, change `git checkout -b ${branchName}` to `git checkout -b "${branchName}"`
- On line 85, change `git checkout ${branchName}` to `git checkout "${branchName}"`
- On line 86, change `git pull origin ${branchName}` to `git pull origin "${branchName}"`
- On line 124, change `git push -u origin ${branchName}` to `git push -u origin "${branchName}"`
- Run `npm test -- --run adws/__tests__/gitOperations.test.ts` (if it exists) to verify, or run the full test suite

### 6. Run validation commands
- Execute every command in the `Validation Commands` section below to confirm the bug is fixed with zero regressions.

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm test -- --run adws/__tests__/generateAdwId.test.ts` - Verify `generateAdwId()` no longer produces `adw-` prefix
- `npm test -- --run adws/__tests__/gitAgent.test.ts` - Verify branch name validation works correctly
- `npm test -- --run adws/__tests__/worktreeOperations.test.ts` - Verify quoted branch names in worktree operations
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run all tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The `adw-` prefix removal from `generateAdwId()` affects how ADW IDs appear in workflow comments, agent directories, and state files. The branch name format `<issueClass>-issue-<issueNumber>-adw-<adwId>-<concise_name>` will now produce cleaner names like `chore-issue-158-adw-copy-env-local-pwzbst-copy-env-worktree` instead of `chore-issue-158-adw-adw-copy-env-local-to-wo-pwzbst-copy-env-local-worktree`.
- The 100-character branch name limit is a practical safeguard. Git doesn't enforce a strict limit, but long branch names cause issues with file system path limits (especially on Windows), shell command parsing, and readability.
- Existing worktrees and branches from previous runs are unaffected — this fix only changes how *new* branch names are generated and how they're passed to shell commands.
