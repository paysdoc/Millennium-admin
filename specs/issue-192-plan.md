# PR-Review: Fix uncommitted files, re-enable tests, and fix knex migration deployment error

## PR-Review Description
PR #197 (`chore-issue-192-add-category-name-table`) has three review comments from paysdoc:

1. **"There are uncommitted files in the local worktree. Fix that"** — The PR branch contains uncommitted modifications to 5 files (`adws/__tests__/testAgent.test.ts`, `adws/__tests__/worktreeOperations.test.ts`, `adws/agents/testAgent.ts`, `adws/agents/testRetry.ts`, `e2e-tests/character-edit.spec.ts`) that are unrelated to issue #192. These changes are already committed to the remote branch as part of prior merges, but should not be part of this PR. The changes need to be reverted from the PR to keep it focused on the category name table work.

2. **"Manually disabled some tests. Rerun all the tests"** — Tests were manually disabled in `e2e-tests/character-edit.spec.ts`. Since the caching fix (`cache: 'no-store'` in `src/lib/supabase.ts`) was already committed in `6eb62ae`, these tests should be re-enabled and all tests must pass.

3. **"Deployment fails due to knex migration error"** — The CI/CD pipeline fails when running `npm run knex:migrate` because Knex cannot load TypeScript files. The project uses `tsx` (not `ts-node`) for TypeScript execution, but the `knex:migrate` npm script invokes knex directly without registering tsx as the TypeScript loader. Knex's CLI tries to auto-detect TypeScript handlers (`ts-node/register`, `typescript-node/register`, etc.), all of which fail because none are installed. The fix is to use `NODE_OPTIONS='--import tsx'` to pre-load tsx before knex runs, which registers tsx as the TypeScript handler for all `.ts` files.

## Summary of Original Implementation Plan
The original plan (`specs/issue-192-adw-unknown-sdlc_planner-add-category-name-table.md`) specifies creating a `category_name` database table to store the mapping between single-letter category codes (R, S, P, I, M, N, A, B, C, D, T) and their display names. It includes Knex.js migrations, seeds, Supabase migrations, a `fetchCategoryNames` lib function, TypeScript types, component updates (`CategorySection`, `TableOfContents`, `page.tsx`), deployment pipeline updates, and unit tests.

## Relevant Files
Use these files to resolve the review:

- **`adws/__tests__/testAgent.test.ts`** — Contains changes from prior merged PRs (E2E_BASE_URL handling). These changes are not related to issue #192 and are already in the `main` branch via other PRs. Should be reverted to match `main`.
- **`adws/__tests__/worktreeOperations.test.ts`** — Contains an `afterEach` import addition from prior PRs. Not related to issue #192. Should be reverted to match `main`.
- **`adws/agents/testAgent.ts`** — Contains `applicationUrl` parameter addition from prior PRs. Not related to issue #192. Should be reverted to match `main`.
- **`adws/agents/testRetry.ts`** — Contains `applicationUrl` passthrough from prior PRs. Not related to issue #192. Should be reverted to match `main`.
- **`e2e-tests/character-edit.spec.ts`** — Contains a manually disabled block of test assertions. The underlying caching issue has been fixed in commit `6eb62ae`. Tests must be re-enabled. This file also has unrelated changes from prior PRs that should be reverted to match `main`.
- **`package.json`** — The `knex:migrate`, `knex:seed`, and `knex:migrate:make` scripts need to use `NODE_OPTIONS='--import tsx'` to enable TypeScript support for knex CLI.
- **`.github/workflows/deploy.yml`** — Runs `npm run knex:migrate` in all three deployment jobs. Once `package.json` is fixed, no changes are needed here since the fix is in the npm script itself.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Revert unrelated file changes to match main
- These files have changes from other merged PRs that leaked into this branch. Revert them to their state on `main` to keep the PR focused on issue #192:
  - `git checkout main -- adws/__tests__/testAgent.test.ts`
  - `git checkout main -- adws/__tests__/worktreeOperations.test.ts`
  - `git checkout main -- adws/agents/testAgent.ts`
  - `git checkout main -- adws/agents/testRetry.ts`
  - `git checkout main -- e2e-tests/character-edit.spec.ts`
- Verify with `git diff --stat main` that only issue-192-related files remain changed

### Step 2: Fix knex TypeScript loading in npm scripts
- In `package.json`, update the three knex-related npm scripts to preload tsx:
  - Change `"knex:migrate": "knex migrate:latest --knexfile knexfile.ts"` to `"knex:migrate": "NODE_OPTIONS='--import tsx' knex migrate:latest --knexfile knexfile.ts"`
  - Change `"knex:seed": "knex seed:run --knexfile knexfile.ts"` to `"knex:seed": "NODE_OPTIONS='--import tsx' knex seed:run --knexfile knexfile.ts"`
  - Change `"knex:migrate:make": "knex migrate:make --knexfile knexfile.ts"` to `"knex:migrate:make": "NODE_OPTIONS='--import tsx' knex migrate:make --knexfile knexfile.ts"`
- The `NODE_OPTIONS='--import tsx'` flag tells Node.js to load tsx's ESM loader hooks before running knex, which enables knex to import `.ts` files (knexfile.ts, migration files, seed files)
- This fix works because `tsx` is already installed as a devDependency and CI runs `npm ci` before migrations

### Step 3: Verify knex migration works locally
- Run `npm run knex:migrate` to confirm the migration executes without TypeScript loading errors
- Expected output should show migration status without "Failed to load external module" warnings

### Step 4: Stage and commit all changes
- Stage the reverted files and the updated package.json:
  - `git add adws/__tests__/testAgent.test.ts adws/__tests__/worktreeOperations.test.ts adws/agents/testAgent.ts adws/agents/testRetry.ts e2e-tests/character-edit.spec.ts package.json`
- Commit with a descriptive message explaining the review resolution

### Step 5: Run validation commands
- Run all validation commands to verify the review is resolved with zero regressions

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `git status` - Verify the worktree is clean with no uncommitted changes
- `git diff --stat main` - Verify only issue-192-related files are changed
- `npm run knex:migrate` - Verify knex migration runs without TypeScript errors
- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The 4 adws files and the e2e spec file contain changes from prior merged PRs (#188, #191, etc.) that leaked into this branch through merge commits. These changes are already in `main` and should not be part of this PR. Reverting them to match `main` keeps the PR diff clean and focused on issue #192.
- The knex TypeScript error occurs because knex's CLI uses the `rechoir`/`interpret` packages to auto-detect TypeScript handlers (ts-node, sucrase, babel, etc.). Since the project uses `tsx` instead, none of these are found. Using `NODE_OPTIONS='--import tsx'` registers tsx as the TypeScript loader before knex runs, which is the recommended approach when using tsx instead of ts-node.
- The `NODE_OPTIONS` fix is applied to the npm scripts rather than the CI workflow, so it works in all environments (local development, CI/CD preview, staging, production).
- The `cache: 'no-store'` fix in `src/lib/supabase.ts` (commit `6eb62ae`) resolved the Next.js caching issue that caused E2E test failures. Since the e2e spec file is being reverted to match `main` (which doesn't have the disabled tests), this concern is already addressed.
