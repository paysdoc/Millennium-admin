# Feature: Add Category Name Table

## Metadata
issueNumber: `207`
adwId: `set-up-category-name-bvy2fq`
issueJson: `{"number":207,"title":"Set up category name","body":"The categories in Millennium are named:\n- R = Royalty\n- S = Statesmen\n- P = Philosophers\n- I = Inventors\n- M = Mathematical Scientists\n- N = Natural Scientists\n- A = Artists\n- B = Builders\n- C = Composers\n- D = Dramatists\n- T = Towns\n\nThese category names can vary over time and need to, therefore be saved in the database, as a separate table.\n\nCreate a new table that hosts the category / name mapping.\nUse Knex.js as a migration tool to enable the migration of the new datamodel to production.\nUpdate the deployment so that any changes in the knex scripts trigger the npm command to run.","state":"OPEN","author":"paysdoc","labels":[],"createdAt":"2026-02-24T10:08:09Z","comments":[{"author":"paysdoc","createdAt":"2026-02-24T10:37:00Z","body":"## Take action"}],"actionableComment":null}`

## Feature Description
Create a new `category_name` database table that maps single-letter category codes (R, S, P, I, M, N, A, B, C, D, T) to their full human-readable names (Royalty, Statesmen, Philosophers, etc.). Since category names can change over time, they must be stored in the database rather than hardcoded. The migration is managed with Knex.js, and the deployment pipeline is updated so migrations run automatically on every build.

## User Story
As a Millennium admin user
I want category names stored in the database and displayed alongside their codes
So that categories show meaningful names that can be updated over time without code changes

## Problem Statement
Category names are currently only represented as single-letter codes (R, S, P, I, etc.) throughout the application. The full names (Royalty, Statesmen, Philosophers, etc.) are not stored anywhere in the system. Since these names may change over time, hardcoding them is not viable. A database-backed mapping is needed along with a proper migration tool (Knex.js) to manage schema changes to production.

## Solution Statement
1. Introduce Knex.js as the migration tool for schema changes, configured to connect to the Supabase PostgreSQL database via a `DATABASE_URL` environment variable.
2. Create a Knex migration that adds a `category_name` table with `code` (primary key) and `name` columns.
3. Seed the table with the 11 initial category mappings.
4. Create a TypeScript data access layer (`src/lib/categories.ts`) using the existing Supabase client pattern to query category names.
5. Update UI components (`CategorySection`, `TableOfContents`, `CharacterDetails`) to display full category names fetched from the database.
6. Update the Vercel deployment pipeline to run `knex migrate:latest` before every build, ensuring schema changes are applied automatically.

## Relevant Files
Use these files to implement the feature:

- `README.md` — Project overview; needs updating to document Knex.js setup and the `DATABASE_URL` environment variable.
- `guidelines/coding_guidelines.md` — Coding standards to follow throughout implementation.
- `package.json` — Add `knex` and `pg` dependencies and new npm scripts for running migrations.
- `vercel.json` — Update `buildCommand` to run Knex migrations before building.
- `.env.sample` — Add `DATABASE_URL` environment variable documentation.
- `supabase/config.toml` — Reference for local PostgreSQL port (54322) used in Knex fallback connection.
- `src/types/character.ts` — Contains `CATEGORY_ORDER`, `CategoryKey` type, and `Character` interface. Reference for existing category patterns.
- `src/types/database.ts` — Central database type re-exports; needs updating to include new category name types.
- `src/lib/supabase.ts` — Supabase client initialization; used by the new data access layer.
- `src/lib/schema.ts` — Error handling utilities (`isTableNotFoundError`); used in the new data access layer.
- `src/lib/errors.ts` — Shared `handleDatabaseError` utility; used in the new data access layer.
- `src/lib/characters.ts` — Existing data access pattern to follow; reference for Supabase query style.
- `src/components/CategorySection.tsx` — Renders category headings; needs updating to display full category names.
- `src/components/TableOfContents.tsx` — Renders table of contents with category links; needs updating to display full category names.
- `src/components/CharacterDetails.tsx` — Renders character details including category; needs updating to display full category name.
- `src/app/page.tsx` — Home page that fetches characters and renders categories; needs updating to fetch and pass category names.
- `src/app/characters/[id]/page.tsx` — Character detail page; needs updating to fetch and pass category name.
- `src/__tests__/supabase.test.ts` — Existing test patterns to follow.
- `.github/workflows/deploy.yml` — Deployment workflow; may need a migration step if Vercel build command alone is insufficient.
- Read `.claude/commands/test_e2e.md` and `.claude/commands/e2e-examples/test_basic_query.md` to understand how to create E2E test files.

### New Files
- `knexfile.js` — Knex configuration file (plain JS for simplicity; reads `DATABASE_URL` from env).
- `knex/migrations/20260224_create_category_name.js` — Knex migration to create the `category_name` table.
- `knex/seeds/01_category_names.js` — Knex seed to populate initial category name mappings.
- `src/types/categoryName.ts` — TypeScript interface for category name rows and mapped types.
- `src/lib/categories.ts` — Data access layer for fetching category names from Supabase.
- `src/__tests__/categories.test.ts` — Unit tests for the categories data access layer.
- `e2e-tests/test_category_names.md` — E2E test specification to validate category names display correctly.

## Implementation Plan
### Phase 1: Foundation
Install Knex.js and the PostgreSQL driver (`pg`). Create the `knexfile.js` configuration pointing to Supabase's PostgreSQL database via `DATABASE_URL` (with a local fallback for development). Add npm scripts for running migrations, rollbacks, and seeds. Update `.env.sample` and `README.md` with the new `DATABASE_URL` variable and Knex usage instructions.

### Phase 2: Core Implementation
Create the Knex migration that defines the `category_name` table schema (`code` as primary key, `name` as not null text, plus timestamps). Create the seed file with the 11 initial category mappings. Define TypeScript types for the new table. Build the data access layer (`src/lib/categories.ts`) following the existing Supabase query patterns in `characters.ts` — including `fetchAllCategoryNames()` and a `buildCategoryNameMap()` utility. Write unit tests for the data access functions.

### Phase 3: Integration
Update `src/app/page.tsx` to fetch category names alongside characters and pass the name map to child components. Update `CategorySection`, `TableOfContents`, and `CharacterDetails` to accept and display full category names. Update the Vercel `buildCommand` in `vercel.json` to run `knex migrate:latest` before `next build`. Create the E2E test specification. Run all validation commands to confirm zero regressions.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Install Knex.js and PostgreSQL driver
- Run `npm install knex pg` to add both as production dependencies (Knex needs to be available at build time for the migration step in deployment).
- Verify the packages are added to `package.json`.

### Step 2: Create the Knex configuration file
- Create `knexfile.js` at project root with the following configuration:
  - `client`: `'pg'`
  - `connection`: reads `process.env.DATABASE_URL`, falling back to `'postgresql://postgres:postgres@127.0.0.1:54322/postgres'` for local Supabase development.
  - `migrations.directory`: `'./knex/migrations'`
  - `seeds.directory`: `'./knex/seeds'`
- Use `require('dotenv').config()` at the top so local `.env` is loaded.

### Step 3: Add npm scripts for Knex operations
- Add the following scripts to `package.json`:
  - `"knex:migrate"`: `"knex migrate:latest --knexfile knexfile.js"`
  - `"knex:migrate:rollback"`: `"knex migrate:rollback --knexfile knexfile.js"`
  - `"knex:seed"`: `"knex seed:run --knexfile knexfile.js"`
  - `"knex:migrate:make"`: `"knex migrate:make --knexfile knexfile.js"`

### Step 4: Create the Knex migration for `category_name` table
- Create directory `knex/migrations/`.
- Create migration file `knex/migrations/20260224100000_create_category_name.js` with:
  - `exports.up`: Create table `category_name` with columns:
    - `code` — `string(1)`, primary key (the single-letter category code)
    - `name` — `string(100)`, not nullable (the full category name)
    - `created_at` — `timestamp with time zone`, default `knex.fn.now()`
    - `updated_at` — `timestamp with time zone`, default `knex.fn.now()`
  - `exports.down`: Drop table `category_name`.

### Step 5: Create the Knex seed for initial category names
- Create directory `knex/seeds/`.
- Create seed file `knex/seeds/01_category_names.js` that:
  - Deletes all existing rows from `category_name` (idempotent seed).
  - Inserts the 11 initial mappings:
    - R = Royalty, S = Statesmen, P = Philosophers, I = Inventors, M = Mathematical Scientists, N = Natural Scientists, A = Artists, B = Builders, C = Composers, D = Dramatists, T = Towns

### Step 6: Update environment variable configuration
- Add `DATABASE_URL` to `.env.sample` with documentation:
  ```
  # Database — direct PostgreSQL connection for Knex.js migrations
  # For LOCAL development with Supabase CLI: postgresql://postgres:postgres@127.0.0.1:54322/postgres
  # For PRODUCTION, set to the hosted Supabase PostgreSQL connection string.
  DATABASE_URL=
  ```
- Add `DATABASE_URL` to the Supabase/environment section of `.env.sample`.

### Step 7: Create E2E test specification
- Read `.claude/commands/test_e2e.md` and `.claude/commands/e2e-examples/test_basic_query.md` to understand the E2E test format.
- Create `e2e-tests/test_category_names.md` that validates:
  - The home page displays full category names (e.g., "Royalty" instead of just "R") in section headings.
  - The table of contents displays full category names.
  - A character detail page displays the full category name.
  - Take screenshots at each validation step.

### Step 8: Create TypeScript types for category name
- Create `src/types/categoryName.ts` with:
  - `CategoryNameRow` interface matching the database schema (`code`, `name`, `created_at`, `updated_at`).
  - `CategoryName` interface for the application layer (`code`, `name`).
  - `mapCategoryNameRowToCategoryName()` function following the pattern in `character.ts`.
  - `CategoryNameMap` type alias: `Map<string, string>` — maps code to name.
- Update `src/types/database.ts` to re-export the new types.

### Step 9: Create data access layer for category names
- Create `src/lib/categories.ts` following the patterns in `src/lib/characters.ts`:
  - `fetchAllCategoryNames()` — Fetches all rows from `category_name` using `getSupabaseServiceClient()`. Returns `CategoryName[]`. Handles `isTableNotFoundError` gracefully (returns empty array with console warning). Uses `handleDatabaseError` for unknown errors.
  - `buildCategoryNameMap(categoryNames: CategoryName[])` — Converts an array of `CategoryName` to a `CategoryNameMap` (Map from code to name). Pure function, no side effects.

### Step 10: Write unit tests for categories data access
- Create `src/__tests__/categories.test.ts` with tests for:
  - `buildCategoryNameMap()`:
    - Returns a Map mapping codes to names from input array.
    - Returns an empty Map for an empty input array.
    - Handles duplicate codes (last one wins).
  - Follow the test patterns in `src/__tests__/supabase.test.ts`.

### Step 11: Update the home page to fetch and pass category names
- Update `src/app/page.tsx`:
  - Import `fetchAllCategoryNames` and `buildCategoryNameMap` from `@/lib/categories`.
  - Fetch category names alongside characters (both calls can be made in parallel with `Promise.all`).
  - Build a `CategoryNameMap` from the fetched data.
  - Pass `categoryNameMap` to `TableOfContents` and `CategorySection` components.

### Step 12: Update `TableOfContents` component
- Update `src/components/TableOfContents.tsx`:
  - Add `categoryNames: CategoryNameMap` to `TableOfContentsProps`.
  - Update the rendered list items to display the full category name when available:
    - Format: `{index + 1} {categoryNames.get(category) ?? category}` (falls back to code if name not found).

### Step 13: Update `CategorySection` component
- Update `src/components/CategorySection.tsx`:
  - Add `categoryName?: string` to `CategorySectionProps`.
  - Update the heading to display the full name when available:
    - Format: `{categoryName ?? category}` as the heading text.

### Step 14: Update `CharacterDetails` component
- Update `src/components/CharacterDetails.tsx`:
  - Add `categoryName?: string` to `CharacterDetailsProps`.
  - Update the category display row to show the full name when available:
    - Format: `{categoryName ?? character.category}`.

### Step 15: Update character detail page to pass category name
- Read and update `src/app/characters/[id]/page.tsx`:
  - Import `fetchAllCategoryNames` and `buildCategoryNameMap`.
  - Fetch category names alongside the character data.
  - Look up the character's category name from the map.
  - Pass `categoryName` to the `CharacterDetails` component.

### Step 16: Update Vercel deployment to run migrations
- Update `vercel.json`:
  - Change `buildCommand` from `"npm run build"` to `"npx knex migrate:latest --knexfile knexfile.js && npm run build"`.
  - This ensures Knex migrations run before every Vercel build. Since `knex migrate:latest` is idempotent (tracks state in `knex_migrations` table), running it when there are no new migrations is a safe no-op.

### Step 17: Update README.md
- Add a `## Database Migrations` section to `README.md` documenting:
  - Knex.js is used for database schema migrations.
  - How to run migrations locally: `npm run knex:migrate`.
  - How to create new migrations: `npm run knex:migrate:make -- <migration_name>`.
  - How to roll back: `npm run knex:migrate:rollback`.
  - How to seed: `npm run knex:seed`.
  - That `DATABASE_URL` must be set (locally defaults to the Supabase CLI PostgreSQL instance).
  - That migrations run automatically during Vercel deployments.
  - Note: after running `supabase db reset` locally, also run `npm run knex:migrate && npm run knex:seed` to apply Knex-managed tables.

### Step 18: Run validation commands
- Run `npm run lint` to verify no linting errors.
- Run `npm run build` to verify the application builds successfully.
- Run `npm test` to verify all tests pass with zero regressions.
- Read `.claude/commands/test_e2e.md`, then read and execute `e2e-tests/test_category_names.md` to validate category names display correctly.

## Testing Strategy
### Unit Tests
- `buildCategoryNameMap()` — Verify it correctly builds a Map from code to name. Verify it returns an empty Map for empty input. Verify it handles edge cases.
- `mapCategoryNameRowToCategoryName()` — Verify it maps database rows to the application interface correctly.

### Edge Cases
- Category name table does not exist (graceful fallback to letter codes).
- Category name table exists but is empty (fallback to letter codes).
- A character has a category code that has no matching row in `category_name` (fallback to code).
- Database connection failure during category name fetch (error handling, app still renders with codes).

## Acceptance Criteria
- A `category_name` table exists in the database with 11 rows mapping letter codes to full names.
- Knex.js is installed and configured with a `knexfile.js` that connects to Supabase PostgreSQL.
- npm scripts exist for `knex:migrate`, `knex:migrate:rollback`, `knex:seed`, and `knex:migrate:make`.
- `DATABASE_URL` is documented in `.env.sample`.
- The home page displays full category names in section headings and table of contents.
- Character detail pages display the full category name.
- Components gracefully fall back to single-letter codes if category names are unavailable.
- The Vercel build command runs `knex migrate:latest` before building, ensuring migrations are applied automatically.
- All existing tests pass with zero regressions.
- `npm run lint`, `npm run build`, and `npm test` all succeed.

## Validation Commands
Execute every command to validate the feature works correctly with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the feature works with zero regressions
- Read `.claude/commands/test_e2e.md`, then read and execute `e2e-tests/test_category_names.md` to validate category names display correctly

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of implementing the feature.
- **Coexistence with Supabase migrations**: The project already uses Supabase CLI migrations in `supabase/migrations/`. Knex.js introduces a second migration system that connects directly to the same PostgreSQL database. Both systems can coexist — Supabase CLI manages its own migration state, and Knex manages its own via the `knex_migrations` and `knex_migrations_lock` tables. After running `supabase db reset` locally, you must also run `npm run knex:migrate && npm run knex:seed` to apply Knex-managed schema changes and seed data.
- **`DATABASE_URL` for production**: The hosted Supabase PostgreSQL connection string must be added as an environment variable in Vercel (both Production and Preview environments). This is available in the Supabase dashboard under Project Settings > Database > Connection string (URI format). Use the "Session mode" connection string (port 5432).
- **New dependencies**: `knex` (migration tool) and `pg` (PostgreSQL driver for Node.js) are added as production dependencies because they need to be available during Vercel builds.
- **Migration idempotency**: `knex migrate:latest` is safe to run repeatedly. It only applies migrations that haven't been applied yet, tracked via the `knex_migrations` table.
- **Graceful degradation**: All UI components fall back to displaying the single-letter code if the `category_name` table is empty or unavailable. This ensures the application works even before the seed is run or if the migration hasn't been applied.
