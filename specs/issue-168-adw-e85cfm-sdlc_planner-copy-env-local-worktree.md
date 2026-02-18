# Chore: Copy .env.local to worktree

## Metadata
issueNumber: `168`
adwId: `e85cfm`
issueJson: `{"title":"copy .env.local to worktree","body":"When creating a new worktree .env is being copied into the worktree. This should also happen for .env.local","state":"OPEN","number":168,"author":"paysdoc"}`

## Chore Description
When a new git worktree is created by the ADW system, the `copyEnvToWorktree` function in `adws/github/worktreeOperations.ts` copies the `.env` file from the main repository into the new worktree (since `.env` is gitignored and won't be present). However, `.env.local` is also a gitignored environment file that is not being copied. This chore updates `copyEnvToWorktree` to also copy `.env.local` when it exists in the main repository.

## Relevant Files
Use these files to resolve the chore:

- `adws/github/worktreeOperations.ts` — Contains the `copyEnvToWorktree` function that needs to be updated to also copy `.env.local`.
- `adws/__tests__/worktreeOperations.test.ts` — Contains the `copyEnvToWorktree` test suite that needs new tests for `.env.local` copying behavior.
- `adws/__tests__/workflowPhases.test.ts` — References `copyEnvToWorktree` in mocks; may need verification but likely no changes needed since the function signature stays the same.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `copyEnvToWorktree` in `adws/github/worktreeOperations.ts`
- In the `copyEnvToWorktree` function (line 79–94), add logic to also copy `.env.local` from the main repository to the worktree.
- After the existing `.env` copy block, add a similar block that:
  1. Constructs `sourceEnvLocalPath` as `path.join(mainRepoPath, '.env.local')`
  2. Constructs `destEnvLocalPath` as `path.join(worktreePath, '.env.local')`
  3. Checks if `.env.local` exists in the main repo with `fs.existsSync(sourceEnvLocalPath)`
  4. If it exists, copies it with `fs.copyFileSync(sourceEnvLocalPath, destEnvLocalPath)` and logs `Copied .env.local file to worktree at ${worktreePath}`
  5. If it does not exist, logs `No .env.local file found in main repository at ${mainRepoPath}, skipping copy`
- The error handling `catch` block already wraps the entire function, so the new `.env.local` copy is covered by the existing try-catch.
- Update the JSDoc comment to mention that both `.env` and `.env.local` are copied.

### Step 2: Add tests for `.env.local` copying in `adws/__tests__/worktreeOperations.test.ts`
- In the existing `copyEnvToWorktree` describe block (starting at line 1095), add the following test cases:
  - **`copies .env.local when it exists in main repo`**: Mock `fs.existsSync` to return true for both `.env` and `.env.local`, verify `fs.copyFileSync` is called with `.env.local` source and destination paths.
  - **`copies .env but not .env.local when only .env exists`**: Mock `fs.existsSync` to return true for `.env` and false for `.env.local`, verify `fs.copyFileSync` is called only once (for `.env`).
  - **`copies .env.local but not .env when only .env.local exists`**: Mock `fs.existsSync` to return false for `.env` and true for `.env.local`, verify `fs.copyFileSync` is called once (for `.env.local`).
  - **`copies neither when neither exists`**: Mock `fs.existsSync` to return false for both, verify `fs.copyFileSync` is not called.
- Update the existing test `copies .env when it exists in main repo` to also account for the `.env.local` existence check (the `fs.existsSync` mock may need to differentiate between `.env` and `.env.local` paths).

### Step 3: Run Validation Commands
- Run all validation commands listed below to ensure the chore is complete with zero regressions.

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The function signature of `copyEnvToWorktree` does not change, so callers (`worktreeCreation.ts`, `workflowLifecycle.ts`) require no modifications.
- The existing `fs.existsSync` mock in test files that mock `copyEnvToWorktree` itself (e.g., `workflowPhases.test.ts`, `tokenLimitRecovery.test.ts`) are unaffected since they mock the entire function, not its internals.
