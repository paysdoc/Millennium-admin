# PR-Review: Fix Vercel deployment failure — migrate from Knex to Supabase CLI migration

## PR-Review Description

The Vercel deployment fails during the build step because the `buildCommand` in `vercel.json` runs `npx knex migrate:latest --knexfile knexfile.js` before `npm run build`. Knex attempts a direct PostgreSQL connection to the Supabase database, but the host resolves to an IPv6 address (`2a05:d018:...`) that is unreachable from Vercel's build environment (`ENETUNREACH`).

The root cause is architectural: Knex.js was added as a **second migration system** alongside the existing Supabase CLI migrations, introducing a build-time dependency on a direct database connection that Vercel's build runner cannot satisfy.

The fix is to **replace the Knex migration with a Supabase CLI migration**. The project already uses Supabase CLI for all other schema management (`supabase/migrations/`). The `category_name` table migration and seed data should be moved there. This eliminates the need for a database connection during the Vercel build, removes the duplicate migration system, and keeps the project consistent.

## Summary of Original Implementation Plan

The original plan (`specs/issue-207-adw-set-up-category-name-bvy2fq-sdlc_planner-add-category-name-table.md`) specified a three-phase approach to add a `category_name` table: (1) install Knex.js and configure it to connect to Supabase PostgreSQL, (2) create migration/seed files and a data access layer (`src/lib/categories.ts`), and (3) integrate category names into UI components and the Vercel deployment pipeline. The Knex migration creates columns `code CHAR(1) PRIMARY KEY`, `name VARCHAR(100) NOT NULL`, `created_at TIMESTAMPTZ`, and `updated_at TIMESTAMPTZ`, seeded with 11 category mappings (R=Royalty, S=Statesmen, etc.). The `vercel.json` buildCommand was modified to run `npx knex migrate:latest` before `npm run build`.

## Relevant Files

Use these files to resolve the review:

- **`vercel.json`** — Contains the failing `buildCommand` that runs Knex migration before build. Must revert to `npm run build`.
- **`knex/migrations/20260224100000_create_category_name.js`** — Knex migration file to be removed (replaced by Supabase CLI migration).
- **`knex/seeds/01_category_names.js`** — Knex seed file to be removed (seed data moves to Supabase migration and seed.sql).
- **`knexfile.js`** — Knex configuration file to be removed.
- **`supabase/migrations/`** — Destination for the new Supabase SQL migration file.
- **`supabase/seed.sql`** — Must be updated to include category name seed data for local `supabase db reset`.
- **`package.json`** — Remove `knex` and `pg` dependencies and Knex npm scripts.
- **`.env.sample`** — Remove `DATABASE_URL` variable (only used by Knex).
- **`README.md`** — Remove the "Database Migrations" Knex section and update project structure references.

### New Files

- **`supabase/migrations/<timestamp>_create_category_name.sql`** — New Supabase SQL migration that creates the `category_name` table and inserts seed data.

## Step by Step Tasks

### 1. Create Supabase SQL migration for `category_name` table

- Create a new migration file in `supabase/migrations/` with the next sequential timestamp (e.g., `20260224200000_create_category_name.sql`).
- The migration must create the `category_name` table with the same schema as the Knex migration:
  ```sql
  CREATE TABLE IF NOT EXISTS category_name (
    code VARCHAR(1) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );
  ```
- Include the seed data directly in the migration using `INSERT ... ON CONFLICT DO NOTHING` so it is applied on both local and production databases:
  ```sql
  INSERT INTO category_name (code, name) VALUES
    ('R', 'Royalty'),
    ('S', 'Statesmen'),
    ('P', 'Philosophers'),
    ('I', 'Inventors'),
    ('M', 'Mathematical Scientists'),
    ('N', 'Natural Scientists'),
    ('A', 'Artists'),
    ('B', 'Builders'),
    ('C', 'Composers'),
    ('D', 'Dramatists'),
    ('T', 'Towns')
  ON CONFLICT (code) DO NOTHING;
  ```

### 2. Update `supabase/seed.sql` with category name seed data

- Append seed data for the `category_name` table so that `supabase db reset` restores category names during local development.
- Use `INSERT ... ON CONFLICT (code) DO NOTHING` for idempotency.

### 3. Revert `vercel.json` buildCommand

- Change `buildCommand` from `"npx knex migrate:latest --knexfile knexfile.js && npm run build"` back to `"npm run build"`.
- This eliminates the build-time database connection that causes the `ENETUNREACH` error.

### 4. Remove Knex migration and seed files

- Delete `knex/migrations/20260224100000_create_category_name.js`.
- Delete `knex/seeds/01_category_names.js`.
- Delete the `knex/migrations/` and `knex/seeds/` directories if empty.
- Delete the `knex/` directory.

### 5. Remove `knexfile.js`

- Delete `knexfile.js` from the project root.

### 6. Remove Knex dependencies and scripts from `package.json`

- Remove the following npm scripts: `knex:migrate`, `knex:migrate:rollback`, `knex:seed`, `knex:migrate:make`.
- Remove `knex` and `pg` from `dependencies`. Keep `dotenv` as it is used by `adws/core/config.ts`.
- Run `npm install` to regenerate `package-lock.json`.

### 7. Remove `DATABASE_URL` from `.env.sample`

- Remove the `DATABASE_URL` variable and its associated comments from `.env.sample`. This variable was only used by Knex.

### 8. Update `README.md`

- Remove the entire "Database Migrations" section (lines 79–118) that documents Knex usage.
- Update the "Project Structure" section to remove references to `knex/` and `knexfile.js`.
- Update the "Deployment" subsection under "Project Structure" to remove the note about Knex migrations running on Vercel.

### 9. Run validation commands

- Run all validation commands to confirm zero regressions.

## Validation Commands

Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes

- **No changes to `src/lib/categories.ts`**: The data access layer queries the `category_name` table via the Supabase client, not Knex. The table name and column names remain identical, so no code changes are needed.
- **No changes to UI components**: Components consume category data via `src/lib/categories.ts`, which is unaffected.
- **No changes to `src/types/categoryName.ts` or `src/types/database.ts`**: Type definitions reference the table shape, not the migration tool.
- **Production migration**: After merging, run `supabase db push` against the hosted Supabase project to apply the new migration to production. This is the standard Supabase workflow and matches how the initial schema was deployed.
- **Knex lock table cleanup**: If the Knex migration was previously partially applied (creating `knex_migrations` and `knex_migrations_lock` tables), these orphan tables can be dropped manually from the production database. This is optional and non-urgent.
- **Unit tests in `src/__tests__/categories.test.ts`**: These test the `buildCategoryNameMap()` pure function, not the migration tool. They remain valid and should pass without changes.
