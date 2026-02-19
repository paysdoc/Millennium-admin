# Chore: Add category name table with Knex.js migrations

## Metadata
issueNumber: `192`
adwId: `unknown`
issueJson: `{"title":"Set up category name","body":"The categories in Millennium are named:\n    - R = Royalty\n    - S = Statesmen\n    - P = Philosophers\n    - I = Inventors\n    - M = Mathematical Scientists\n    - N = Natural Scientists\n    - A = Artists\n    - B = Builders\n    - C = Composers\n    - D = Dramatists\n    - T = Towns\n\nThese category names can vary over time and need to, therefore be saved in the database, as a separate table.\n\nCreate a new table that hosts the category / name mapping.\nUse Knex.js as a migration tool to enable the migration of the new datamodel to production.\nUpdate the deployment so that any changes in the knex scripts trigger the npm command to run."}`

## Chore Description
Create a new `category_name` database table that stores the mapping between single-letter category keys (R, S, P, I, M, N, A, B, C, D, T) and their human-readable names (Royalty, Statesmen, Philosophers, etc.). This table replaces the currently hardcoded category display logic and allows category names to change over time via database updates.

The migration tool must be **Knex.js** (not the existing Supabase migration system). A `knexfile.ts` must be created, a Knex migration for the new table must be authored, and a seed file must populate the initial category names. The deployment pipeline (`.github/workflows/deploy.yml`) must be updated so that Knex migrations run automatically when knex-related files change.

Additionally, the application code must be updated to:
- Define a new `CategoryName` TypeScript type
- Add a `fetchCategoryNames` lib function that reads from the new table
- Update the `CategorySection` and `TableOfContents` components to display the full category name instead of just "Category R", "Category S", etc.
- Add a corresponding Supabase migration so the local Supabase dev environment stays in sync

## Relevant Files
Use these files to resolve the chore:

- `package.json` — Add `knex` and `pg` dependencies; add `knex:migrate` and `knex:seed` npm scripts
- `supabase/migrations/20260211184633_initial_schema.sql` — Reference for existing schema conventions (table naming, column types)
- `src/types/character.ts` — Contains `CATEGORY_ORDER`, `CategoryKey` type, and `Character` interface; add new `CategoryName` interface here
- `src/types/database.ts` — Central re-export hub for database types; re-export new `CategoryName` type
- `src/lib/supabase.ts` — Supabase client used by the new `fetchCategoryNames` function
- `src/lib/schema.ts` — Error handling utilities (e.g., `isTableNotFoundError`) used in data fetching
- `src/lib/errors.ts` — Shared `handleDatabaseError` utility
- `src/lib/characters.ts` — Existing pattern for Supabase data fetching; reference for `fetchCategoryNames`
- `src/components/CategorySection.tsx` — Displays "Category {key}"; update to show full name
- `src/components/TableOfContents.tsx` — Displays "Category {key}" in TOC; update to show full name
- `src/app/page.tsx` — Home page that fetches characters and renders categories; fetch category names here and pass them down
- `.github/workflows/deploy.yml` — Deployment pipeline; add Knex migration step
- `vercel.json` — Vercel config; may need `buildCommand` update to run migrations before build
- `.env.sample` — Document any new env vars if needed (e.g., `DATABASE_URL` for Knex)
- `supabase/seed.sql` — Add seed data for the new table so local dev has category names
- `guidelines/coding_guidelines.md` — Coding guidelines to follow

### New Files
- `knexfile.ts` — Knex configuration file pointing to the Supabase Postgres database
- `knex/migrations/<timestamp>_create_category_name.ts` — Knex migration to create the `category_name` table
- `knex/seeds/001_category_names.ts` — Knex seed file to populate initial category-name mappings
- `supabase/migrations/<timestamp>_create_category_name.sql` — Supabase migration for local dev environment parity
- `src/lib/categoryNames.ts` — New lib file for `fetchCategoryNames` and related utilities

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Install Knex.js and pg dependencies
- Run `npm install knex pg` to add Knex.js query builder and the PostgreSQL driver as production dependencies
- Run `npm install --save-dev @types/pg` for TypeScript type definitions
- Verify `package.json` has been updated with both dependencies

### Step 2: Add npm scripts for Knex
- Add the following scripts to `package.json`:
  - `"knex:migrate"`: `"knex migrate:latest --knexfile knexfile.ts"` — runs all pending migrations
  - `"knex:seed"`: `"knex seed:run --knexfile knexfile.ts"` — runs seed files
  - `"knex:migrate:make"`: `"knex migrate:make --knexfile knexfile.ts"` — creates a new migration file
- These scripts use the TypeScript knexfile directly (Knex supports TS config natively)

### Step 3: Create knexfile.ts
- Create `knexfile.ts` in the project root
- Configure it to read the database connection from environment variables:
  - Use `DATABASE_URL` env var if available (for production/Vercel), falling back to constructing a connection string from individual Supabase env vars
  - For local development, construct the connection URL from default Supabase local values: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Set the migrations directory to `./knex/migrations`
- Set the seeds directory to `./knex/seeds`
- Use TypeScript extension for migration/seed stub files
- Example config structure:
  ```ts
  import type { Knex } from 'knex'

  const config: Knex.Config = {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    migrations: {
      directory: './knex/migrations',
      extension: 'ts',
    },
    seeds: {
      directory: './knex/seeds',
      extension: 'ts',
    },
  }

  export default config
  ```

### Step 4: Create the Knex migration for category_name table
- Create directory `knex/migrations/`
- Create a migration file `knex/migrations/20260219000000_create_category_name.ts`
- The `up` function creates the `category_name` table with:
  - `key` — `text`, primary key (single letter: R, S, P, I, M, N, A, B, C, D, T)
  - `name` — `text`, not null (the human-readable name: Royalty, Statesmen, etc.)
  - `created_at` — `timestamptz`, default `now()`
  - `updated_at` — `timestamptz`, default `now()`
- The `down` function drops the `category_name` table
- Use `key` as the primary key (not an auto-incrementing id) since the single-letter codes are the natural identifiers and match the existing `type` column in the `character` table

### Step 5: Create the Knex seed file
- Create directory `knex/seeds/`
- Create `knex/seeds/001_category_names.ts`
- The seed should delete existing rows first (idempotent), then insert all 11 category name mappings:
  - R = Royalty
  - S = Statesmen
  - P = Philosophers
  - I = Inventors
  - M = Mathematical Scientists
  - N = Natural Scientists
  - A = Artists
  - B = Builders
  - C = Composers
  - D = Dramatists
  - T = Towns

### Step 6: Create matching Supabase migration for local dev
- Create `supabase/migrations/<timestamp>_create_category_name.sql` (use a timestamp after the existing `20260211184633`)
- SQL should mirror the Knex migration:
  ```sql
  CREATE TABLE IF NOT EXISTS category_name (
    key text PRIMARY KEY,
    name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
  );
  ```
- Update `supabase/seed.sql` to insert the 11 category name rows (with `ON CONFLICT DO NOTHING` for idempotency)

### Step 7: Add CategoryName type and re-export
- In `src/types/character.ts`, add a new interface:
  ```ts
  export interface CategoryName {
    key: CategoryKey
    name: string
    created_at: string
    updated_at: string
  }
  ```
- In `src/types/database.ts`, add `CategoryName` to the re-exports from `./character`

### Step 8: Create fetchCategoryNames lib function
- Create `src/lib/categoryNames.ts` with a `fetchCategoryNames` function
- Follow the same pattern as `fetchAllCharacters` in `src/lib/characters.ts`:
  - Use `getSupabaseClient()` from `src/lib/supabase.ts`
  - Query the `category_name` table: `select('key, name')`
  - Handle `isTableNotFoundError` gracefully (return empty map)
  - Use `handleDatabaseError` for other errors
  - Return a `Map<CategoryKey, string>` mapping keys to names
- Also export a `getCategoryDisplayName` helper that takes a `CategoryKey` and the map, returning the full name or falling back to `"Category {key}"` if not found

### Step 9: Update page.tsx to fetch category names
- In `src/app/page.tsx`:
  - Import `fetchCategoryNames` from `@/lib/categoryNames`
  - Call `fetchCategoryNames()` alongside the existing `fetchAllCharacters()` call
  - Pass the resulting `categoryNames` map to `TableOfContents` and `CategorySection` components

### Step 10: Update TableOfContents component
- In `src/components/TableOfContents.tsx`:
  - Add a `categoryNames` prop of type `Map<CategoryKey, string>` (import `CategoryKey` from `@/types/character`)
  - Replace `Category {category}` display text with the category name from the map, falling back to `Category {category}` if not found

### Step 11: Update CategorySection component
- In `src/components/CategorySection.tsx`:
  - Add a `categoryName` prop of type `string`
  - Replace `Category {category}` in the `<h2>` with the passed `categoryName`

### Step 12: Update .env.sample with DATABASE_URL
- Add a `DATABASE_URL` entry to `.env.sample` with a comment explaining it's used by Knex.js for database migrations:
  ```
  # Knex.js database migrations
  # For LOCAL development: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  # For PRODUCTION: set to the hosted Supabase Postgres connection string
  DATABASE_URL=
  ```

### Step 13: Update deployment pipeline
- In `.github/workflows/deploy.yml`, add a Knex migration step to each deployment job (`deploy-preview`, `deploy-staging`, `deploy-production`) **after** `Install dependencies` and **before** the Vercel build steps:
  ```yaml
  - name: Install dependencies
    run: npm ci

  - name: Run Knex migrations
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
    run: npm run knex:migrate
  ```
- This ensures the database schema is up-to-date before the application is built and deployed
- The `DATABASE_URL` secret must be configured in GitHub repository secrets (document this in a plan note)

### Step 14: Update existing tests and add new tests
- In `src/__tests__/app.test.tsx`, update any tests that import components affected by the new props (if they render with specific props, ensure the new `categoryNames`/`categoryName` prop is accounted for)
- Add a new test file `src/__tests__/categoryNames.test.ts` with tests for:
  - `fetchCategoryNames` returns a `Map<CategoryKey, string>` (mock Supabase client)
  - `getCategoryDisplayName` returns the correct name for known keys
  - `getCategoryDisplayName` falls back to `"Category {key}"` for unknown keys

### Step 15: Run validation commands
- Run all validation commands to verify the chore is complete with zero regressions

## Validation Commands
Execute every command to validate the chore is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the chore is complete with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of accomplishing the chore.
- The `DATABASE_URL` GitHub secret must be configured for each environment (staging, production) in the repository settings for the Knex migration step to work in CI/CD.
- The Knex migration uses `text` as the primary key type for `key` (not an auto-incrementing integer) because the single-letter category codes are natural identifiers that match the `type` column in the existing `character` table. This keeps joins simple and avoids an unnecessary indirection layer.
- The Supabase migration (`supabase/migrations/`) is maintained in parallel with the Knex migration to ensure `supabase db reset` continues to work for local development. Both should produce the same schema.
- The seed data in both `knex/seeds/` and `supabase/seed.sql` must stay in sync.
- Fallback behavior: if the `category_name` table doesn't exist or a key is missing, components fall back to displaying "Category {key}" — this ensures the app remains functional even if migrations haven't run.
