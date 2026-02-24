# PR-Review: Add `supabase db push` step to deploy.yml

## PR-Review Description

The PR review has three comments from the author (`paysdoc`), all related to the same issue: the Vercel deployment fails because the original implementation used Knex.js migrations that attempted a direct PostgreSQL connection during the Vercel build step. The connection fails with `ENETUNREACH` because Vercel's build runner cannot reach the Supabase database over IPv6.

A previous review cycle already migrated the schema from Knex to Supabase CLI migrations (`supabase/migrations/20260224200000_create_category_name.sql`) and removed all Knex infrastructure (dependencies, config, scripts, build command). However, the deployment pipeline still lacks a mechanism to apply the Supabase migration to the remote database during deploys.

The reviewer explicitly requests:
1. **Add a `supabase db push` step to `deploy.yml`** — so that Supabase migrations are applied to the remote database as part of the CI/CD pipeline.
2. **Any added env vars must come from the Vercel env** — following the existing pattern where Vercel is the single source of truth for credentials (pulled at runtime via `vercel env pull`).

Additionally, a few stale Knex references remain in non-critical files that should be cleaned up.

## Summary of Original Implementation Plan

The original plan (`specs/issue-207-adw-set-up-category-name-bvy2fq-sdlc_planner-add-category-name-table.md`) specified a three-phase approach to add a `category_name` table: (1) install Knex.js and configure it to connect to Supabase PostgreSQL via `DATABASE_URL`, (2) create migration/seed files and a data access layer (`src/lib/categories.ts`), and (3) integrate category names into UI components and the Vercel deployment pipeline. The Knex migration creates columns `code CHAR(1) PRIMARY KEY`, `name VARCHAR(100) NOT NULL`, `created_at TIMESTAMPTZ`, and `updated_at TIMESTAMPTZ`, seeded with 11 category mappings (R=Royalty, S=Statesmen, etc.). A subsequent review cycle migrated from Knex to Supabase CLI migrations, removing all Knex infrastructure and creating `supabase/migrations/20260224200000_create_category_name.sql` instead.

## Relevant Files
Use these files to resolve the review:

- **`.github/workflows/deploy.yml`** — The deployment workflow. Needs a `supabase db push` step added to each deploy job (deploy-preview, deploy-staging, deploy-production) so that Supabase migrations are applied to the remote database before the Vercel build.
- **`.github/workflows/sync-supabase.yml`** — Reference for the existing pattern of pulling Vercel env vars and sourcing them in CI. Used as a template for the new `supabase db push` step.
- **`.env.sample`** — Needs `SUPABASE_DB_URL` documented so developers and the deployment pipeline know to configure this Vercel env var.
- **`README.md`** — Needs updated deployment documentation to reflect that Supabase migrations are pushed via `supabase db push` in CI/CD, and that `SUPABASE_DB_URL` must be configured in Vercel.
- **`e2e-tests/test_category_names.md`** — Contains a stale Knex reference in prerequisites (line 8) that must be updated to reference Supabase CLI commands.
- **`src/types/categoryName.ts`** — Contains a stale Knex reference in a JSDoc comment (line 3) that must be updated to reference Supabase migrations.
- **`supabase/migrations/20260224200000_create_category_name.sql`** — The existing Supabase migration that `supabase db push` will apply. No changes needed, listed for reference.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add `SUPABASE_DB_URL` to `.env.sample`

- Add a `SUPABASE_DB_URL` entry to `.env.sample` in the Supabase section, after the existing `SUPABASE_SERVICE_KEY` line.
- Include a comment explaining it is the direct PostgreSQL connection string used by `supabase db push` in CI/CD.
- Format:
  ```
  # Direct PostgreSQL connection string for Supabase CLI (supabase db push)
  # For LOCAL development: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  # For CI/CD: configured in Vercel Dashboard (Project Settings > Database > Connection string, URI format)
  SUPABASE_DB_URL=
  ```

### 2. Add `supabase db push` step to the `deploy-preview` job in `deploy.yml`

- In the `deploy-preview` job, add the following steps **after** the "Pull Vercel Environment Information" step and **before** the "Build Project Artifacts" step:
  1. **Install Supabase CLI**: `npm install -g supabase@latest`
  2. **Pull Vercel env vars to a file**: `vercel env pull .env.vercel --yes --environment=preview --token=${{ secrets.VERCEL_TOKEN }}`
  3. **Run `supabase db push`**:
     ```bash
     set -a && source .env.vercel && set +a
     npx supabase db push --db-url "$SUPABASE_DB_URL"
     ```
- This ensures migrations are applied to the preview Supabase database before the Vercel build.

### 3. Add `supabase db push` step to the `deploy-staging` job in `deploy.yml`

- Apply the same pattern as Step 2 to the `deploy-staging` job.
- Insert after "Pull Vercel Environment Information" and before "Build Project Artifacts".
- Use `--environment=preview` (staging uses the preview environment in Vercel).

### 4. Add `supabase db push` step to the `deploy-production` job in `deploy.yml`

- Apply the same pattern as Step 2 to the `deploy-production` job.
- Insert after "Pull Vercel Environment Information" and before "Build Project Artifacts".
- Use `--environment=production` to pull the production `SUPABASE_DB_URL`.

### 5. Fix stale Knex reference in `e2e-tests/test_category_names.md`

- On line 8, replace:
  ```
  - Knex migrations and seeds have been applied (`npm run knex:migrate && npm run knex:seed`)
  ```
  with:
  ```
  - Supabase database has been reset with migrations and seeds (`npm run supabase:reset`)
  ```

### 6. Fix stale Knex reference in `src/types/categoryName.ts`

- On line 3, replace:
  ```
  * This matches the actual SQL schema managed by Knex migrations.
  ```
  with:
  ```
  * This matches the actual SQL schema managed by Supabase migrations.
  ```

### 7. Update `README.md` deployment and secrets documentation

- In the **Secrets Management** section (near the bottom of the README), add `SUPABASE_DB_URL` to the list of Vercel-managed env vars. Update the description to mention that `SUPABASE_DB_URL` is used by the deploy workflow to push Supabase migrations.
- Example addition after the `SUPABASE_SERVICE_KEY` mention:
  ```
  `SUPABASE_DB_URL` is also configured in Vercel and used by the deploy workflow to push Supabase database migrations via `supabase db push` before each deployment.
  ```

### 8. Run validation commands

- Run all validation commands to confirm zero regressions.

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes

- **`SUPABASE_DB_URL` must be added to Vercel**: The direct PostgreSQL connection string (e.g., `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres`) must be configured in the Vercel Dashboard for both Production and Preview environments. This is available in the Supabase Dashboard under Project Settings > Database > Connection string (URI format). Use the "Session mode" connection string (port 5432).
- **`supabase db push` is idempotent**: It only applies migrations that haven't been applied yet, tracked via Supabase's internal `schema_migrations` table. Running it when there are no new migrations is a safe no-op.
- **Pattern follows `sync-supabase.yml`**: The approach of pulling Vercel env vars and sourcing them matches the existing pattern in `.github/workflows/sync-supabase.yml`, keeping the CI/CD pipeline consistent.
- **No changes to application code**: The data access layer (`src/lib/categories.ts`), UI components, and tests are unaffected. Only the CI/CD pipeline and documentation are updated.
