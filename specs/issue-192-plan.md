# PR-Review: Fix knex migration ECONNREFUSED in deployment and validate all tests

## PR-Review Description
PR #197 (`chore-issue-192-add-category-name-table`) has four review comments from paysdoc. Three have been resolved in prior commits (`972ab6b`, `4653030`, `47ed047`, `9c99214`):

1. **"There are uncommitted files in the local worktree. Fix that"** — RESOLVED. The worktree is clean with no uncommitted files.

2. **"Manually disabled some tests. Rerun all the tests"** — PARTIALLY RESOLVED. Tests have been re-enabled (no `test.skip`, `it.skip`, or `describe.skip` found in the codebase). However, all tests still need to be re-run to confirm zero regressions as the reviewer requested.

3. **"Deployment fails due to knex migration error" (TypeScript loading)** — RESOLVED. The `package.json` npm scripts now use `NODE_OPTIONS='--import tsx'` to preload tsx before knex runs, fixing the "Failed to load external module" errors.

4. **"Another problem with the knex migration" (ECONNREFUSED 127.0.0.1:54322)** — UNRESOLVED. After the tsx fix was applied, the deployment pipeline still fails because `DATABASE_URL` is not configured as a GitHub secret. The `knexfile.ts` falls back to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (local Supabase), which doesn't exist in the CI environment. The `deploy.yml` must gracefully handle a missing `DATABASE_URL` by skipping migrations instead of failing the entire deployment.

## Summary of Original Implementation Plan
The original plan (`specs/issue-192-adw-unknown-sdlc_planner-add-category-name-table.md`) specifies creating a `category_name` database table to store the mapping between single-letter category codes (R, S, P, I, M, N, A, B, C, D, T) and their display names. It includes Knex.js migrations, seeds, Supabase migrations, a `fetchCategoryNames` lib function, TypeScript types, component updates (`CategorySection`, `TableOfContents`, `page.tsx`), deployment pipeline updates, and unit tests.

## Relevant Files
Use these files to resolve the review:

- **`.github/workflows/deploy.yml`** — Contains the "Run Knex migrations" step in all three deployment jobs (`deploy-preview`, `deploy-staging`, `deploy-production`). The step passes `DATABASE_URL` from GitHub secrets but does not check whether the variable is set before running. When `DATABASE_URL` is empty/unset, `knexfile.ts` falls back to `127.0.0.1:54322`, causing `ECONNREFUSED`. The step must be updated to skip migrations gracefully when `DATABASE_URL` is not configured.
- **`src/__tests__/categoryNames.test.ts`** — Unit tests for the categoryNames library functions. Must be re-run to confirm they pass.
- **`e2e-tests/character-edit.spec.ts`** — E2E tests that were previously disabled and re-enabled. Must be re-run to confirm they pass.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix deploy.yml to gracefully handle missing DATABASE_URL
- In `.github/workflows/deploy.yml`, update all three "Run Knex migrations" steps (in `deploy-preview`, `deploy-staging`, and `deploy-production` jobs) to check if `DATABASE_URL` is set before running the migration.
- Replace the current step:
  ```yaml
  - name: Run Knex migrations
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    run: npm run knex:migrate
  ```
- With a conditional version that skips gracefully when `DATABASE_URL` is not configured:
  ```yaml
  - name: Run Knex migrations
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    run: |
      if [ -n "$DATABASE_URL" ]; then
        npm run knex:migrate
      else
        echo "Skipping Knex migrations: DATABASE_URL not configured"
      fi
  ```
- This must be done in all three jobs: `deploy-preview` (line 49-52), `deploy-staging` (line 111-114), and `deploy-production` (line 151-154).
- This ensures the deployment does not fail when `DATABASE_URL` has not yet been added to GitHub secrets, while still running migrations when it is properly configured.

### Step 2: Run all validation commands
- Run all validation commands to verify the review is resolved with zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `DATABASE_URL` GitHub secret must still be configured for each environment (staging, production) in the repository settings for Knex migrations to actually run in CI/CD. This plan makes the step non-blocking so deployments succeed even before the secret is configured.
- The conditional check uses `[ -n "$DATABASE_URL" ]` which evaluates to false when the variable is empty or unset. GitHub Actions sets secrets to empty strings when the secret does not exist.
- The remaining three review comments (uncommitted files, disabled tests, TypeScript loading) were already resolved in prior commits: `972ab6b` (re-enable tests), `4653030` (revert leaked files and fix tsx loader), `47ed047` (restore adws files), and `9c99214` (fix cache, e2e tests, editable field ref).
