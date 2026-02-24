# PR-Review: Fix knex migration CI/CD connection, uncommitted files, and validate tests

## PR-Review Description
PR #197 (`chore-issue-192-add-category-name-table`) has six review comments from paysdoc that need to be addressed:

1. **"There are uncommitted files in the local worktree. Fix that"** — Git status shows `.claude/commands/review.md` is modified but not committed. This must be committed or discarded.

2. **"Manually disabled some tests. Rerun all the tests"** — The e2e tests have runtime `test.skip(true, ...)` availability guards (added by PR #204). These are NOT manually disabled tests — they gracefully skip when Supabase/app server is unavailable. All unit tests must be re-run to confirm zero regressions.

3. **"Deployment fails due to knex migration error" (TypeScript loading)** — RESOLVED. The `package.json` npm scripts now use `NODE_OPTIONS='--import tsx'` to preload tsx before knex runs, fixing the "Failed to load external module" errors.

4. **"Another problem with the knex migration" (ECONNREFUSED 127.0.0.1:54322)** — The `knexfile.ts` fell back to `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (local Supabase) because `DATABASE_URL` was not available in CI. This was subsequently addressed by adding `vercel env pull` to the deploy.yml, but a new error emerged (see comment 6).

5. **"The env var, DATABASE_URL, is not valid. Please retrieve SUPABASE_URL and SUPABASE_SERVICE_KEY from Vercel and use that for knex migrations"** — The reviewer explicitly states that DATABASE_URL is not a valid env var for this project. The knex migration must be restructured to use SUPABASE_URL and SUPABASE_SERVICE_KEY (which are already available in Vercel) instead.

6. **"ENETUNREACH IPv6 error during knex migrate"** — After adding `vercel env pull`, the knex migration still fails because the DATABASE_URL (if set in Vercel) resolves to an IPv6 address that GitHub Actions runners cannot reach (`connect ENETUNREACH 2a05:d018:...`). This confirms that DATABASE_URL is not a viable approach. The connection must be constructed from SUPABASE_URL and SUPABASE_SERVICE_KEY.

The core problem across comments 4-6: the knex migration in CI/CD needs a PostgreSQL connection to the remote Supabase database, but DATABASE_URL either doesn't exist or fails with IPv6. The reviewer's directive is to use SUPABASE_URL and SUPABASE_SERVICE_KEY from Vercel instead.

## Summary of Original Implementation Plan
The original plan (`specs/issue-192-adw-unknown-sdlc_planner-add-category-name-table.md`) specifies creating a `category_name` database table to store the mapping between single-letter category codes (R, S, P, I, M, N, A, B, C, D, T) and their display names. It includes Knex.js migrations, seeds, Supabase migrations, a `fetchCategoryNames` lib function, TypeScript types, component updates (`CategorySection`, `TableOfContents`, `page.tsx`), deployment pipeline updates, and unit tests. The original plan used `DATABASE_URL` as a GitHub Secret for the knex migration step in `deploy.yml` — this is the approach the reviewer has rejected.

## Relevant Files
Use these files to resolve the review:

- **`knexfile.ts`** — Knex configuration. Currently uses `DATABASE_URL` env var with fallback to local Supabase. Must be updated to construct the PostgreSQL connection from `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` when `DATABASE_URL` is not available.
- **`.github/workflows/deploy.yml`** (lines 60-67, 131-138, 181-188) — Contains the "Run Knex migrations" step in all three deployment jobs. Currently checks for `DATABASE_URL` from `vercel env pull`. Must be updated to check for `SUPABASE_URL` instead and pass the correct env vars to knex.
- **`.env.sample`** (lines 29-32) — Documents `DATABASE_URL`. Must be updated to reflect that knex migrations use `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in CI/CD, and `DATABASE_URL` is only for local development convenience.
- **`.claude/commands/review.md`** — Modified but uncommitted. Must be committed to resolve the "uncommitted files" review comment.
- **`src/__tests__/categoryNames.test.ts`** — Unit tests for the categoryNames library functions. Must be re-run to confirm they pass.
- **`package.json`** — Contains knex npm scripts. May need updates if the migration command changes.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Commit uncommitted files
- Run `git status` to confirm the uncommitted file is `.claude/commands/review.md`
- Stage and commit the file with an appropriate message
- This resolves the "uncommitted files in the local worktree" review comment

### Step 2: Update `knexfile.ts` to construct connection from Supabase env vars
- Modify `knexfile.ts` to build the PostgreSQL connection URL from `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` when `DATABASE_URL` is not available
- The connection resolution order should be:
  1. `DATABASE_URL` if set (for backward compatibility and local dev convenience)
  2. Construct from `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` if both are set
  3. Fall back to local Supabase (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) for local dev
- To construct the PostgreSQL connection from Supabase env vars:
  - Extract the project ref from `SUPABASE_URL` (e.g., `https://abcdef123.supabase.co` → `abcdef123`)
  - Use the Supabase connection pooler format with the service role key as the password: `postgresql://postgres.{ref}:{SUPABASE_SERVICE_KEY}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`
  - The connection pooler uses IPv4, which resolves the ENETUNREACH IPv6 error from comment 6
- Add a helper function `buildConnectionUrl()` that encapsulates this logic
- Keep the knexfile clean and readable per coding guidelines

### Step 3: Update `deploy.yml` knex migration steps
- In all three deployment jobs (`deploy-preview`, `deploy-staging`, `deploy-production`), update the "Run Knex migrations" step to check for `SUPABASE_URL` instead of `DATABASE_URL`:

```yaml
- name: Run Knex migrations
  run: |
    set -a && source .env.vercel && set +a
    if [ -n "$SUPABASE_URL" ]; then
      npm run knex:migrate
    else
      echo "Skipping Knex migrations: SUPABASE_URL not configured in Vercel"
    fi
```

- The `knexfile.ts` (updated in Step 2) handles constructing the connection from the sourced env vars
- No need to set `DATABASE_URL` explicitly — the knexfile constructs it from `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

### Step 4: Update `.env.sample` to reflect new connection approach
- Update the `DATABASE_URL` section to clarify the new connection approach:

```
# Knex.js database migrations
# For LOCAL development: set DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
#   or leave empty to use the default local Supabase connection
# For CI/CD: knexfile.ts constructs the connection from SUPABASE_URL and SUPABASE_SERVICE_KEY
#   (pulled via `vercel env pull`). No separate DATABASE_URL needed.
DATABASE_URL=
```

### Step 5: Run all validation commands
- Run all tests, linter, and build to confirm zero regressions and that the review is fully resolved

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Connection pooler format**: The Supabase connection pooler URL format is `postgresql://postgres.{ref}:{password}@aws-0-{region}.pooler.supabase.com:6543/postgres`. The exact region (e.g., `us-east-1`) may need to be determined during implementation by checking the Supabase dashboard or testing with `vercel env pull` locally. If the region cannot be reliably determined from `SUPABASE_URL`, an additional env var (`SUPABASE_REGION` or `SUPABASE_DB_PASSWORD`) may need to be added to Vercel.
- **Service key as password**: Supabase's Supavisor connection pooler supports JWT authentication, which means the `SUPABASE_SERVICE_KEY` (a JWT token) can be used as the password. If this does not work during implementation, a separate `SUPABASE_DB_PASSWORD` env var will need to be added to Vercel, and the plan should be adjusted accordingly.
- **E2E test.skip() calls are intentional**: The `test.skip(true, ...)` calls in e2e test files (`character-edit.spec.ts`, `character-detail.spec.ts`, `character-image-display.spec.ts`) are runtime availability guards added by PR #204 (commits `204bfdf`, `cbdc7bf`). They gracefully skip tests when the application server or Supabase is unavailable — they are NOT manually disabled tests and should NOT be removed.
- **Vercel is the single source of truth**: Per the README's "Secrets Management" section, Vercel is the single source of truth for Supabase credentials. GitHub Secrets only stores Vercel access credentials (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`). This plan aligns with that principle by using `vercel env pull` to retrieve SUPABASE_URL and SUPABASE_SERVICE_KEY at CI/CD runtime.
- **Local development unchanged**: The `knexfile.ts` local fallback (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`) remains correct for local development with `supabase start`. Developers can also set `DATABASE_URL` in their `.env` for convenience.
