# Bug: Foreign key constraint violation during table sync due to incorrect table order

## Bug Description
The Supabase data sync script (`npm run sync:data`) fails when syncing the `games` table because it is processed before the `profiles` table. The `games` table has a foreign key constraint `games_created_by_fkey` on a `created_by` column that references `profiles(id)`. When `games` data is inserted into staging before `profiles` data exists, PostgreSQL rejects the insert with a foreign key constraint violation.

Additionally, auto-generated default columns (e.g., `created_at`, `updated_at`) are being copied from production instead of letting the staging database generate its own values.

**Expected behavior:** The sync script should successfully copy all table data from production to staging, respecting foreign key dependencies between tables.

**Actual behavior:** The sync fails with: `Error syncing games: Failed to insert into games: insert or update on table "games" violates foreign key constraint "games_created_by_fkey"`

## Problem Statement
Two problems need to be solved:
1. The `tablesToSync` array in `sync-config.ts` does not respect foreign key dependencies. `games` (which references `profiles` via `created_by`) is synced before `profiles`, causing FK constraint violations on insert. Additionally, clearing tables in the current forward order would also fail if child tables still reference parent tables from a previous sync.
2. Auto-generated default columns (`created_at`, `updated_at`) are copied from production rather than being generated fresh by the staging database.

## Solution Statement
1. **Reorder `tablesToSync`** to respect foreign key dependencies: parent tables (`profiles`, `character`) must come before child tables (`games`, `connection`, `game_players`).
2. **Split the sync into two phases**: first clear ALL staging tables in reverse dependency order (children first), then fetch/insert ALL tables in forward dependency order (parents first). This prevents FK violations during both clearing and insertion.
3. **Add `generatedColumns` to `TableConfig`** to specify columns that should be stripped from data before inserting, allowing the staging database to auto-generate them.

## Steps to Reproduce
1. Configure environment variables for production and staging Supabase instances
2. Run `npm run sync:data`
3. Observe the output showing `games` is synced before `profiles`:
   ```
   Syncing table: games
     Fetched 10 rows from production
     Cleared staging table
     Error syncing games: Failed to insert into games: insert or update on table "games" violates foreign key constraint "games_created_by_fkey"
   Syncing table: profiles
     Fetched 2 rows from production
   ```

## Root Cause Analysis
**Root Cause 1: Incorrect table sync order**

In `scripts/sync-config.ts` lines 81-87, the `tablesToSync` array is:
```typescript
tablesToSync: [
  characterTable,    // 1
  connectionTable,   // 2
  gamePlayersTable,  // 3
  gamesTable,        // 4 ← references profiles via created_by
  profilesTable,     // 5 ← should come BEFORE games
]
```

The foreign key dependency chain is:
- `games.created_by` → `profiles.id` (FK: `games_created_by_fkey`)
- `connection.char1_id` → `character.id`
- `connection.char2_id` → `character.id`
- `game_players.game_id` → `games.id`
- `game_players.player_id` → `profiles.id`

Since `games` is synced at position 4 and `profiles` at position 5, the `games` insert fails because the referenced `profiles` rows don't exist yet in staging.

Additionally, the current implementation clears and inserts each table sequentially within `syncTable`. If staging already has data from a previous sync, clearing a parent table (e.g., `profiles`) while child records (e.g., `games`) still reference it would also cause FK constraint violations during the clear phase.

**Root Cause 2: Generated columns are copied**

In `scripts/sync-supabase.ts`, the `syncTable` function copies all columns from production data including auto-generated default columns like `created_at` and `updated_at`. These should be omitted so the staging database generates its own values.

## Relevant Files
Use these files to fix the bug:

- `scripts/sync-types.ts` - Type definitions for sync configuration. Needs `generatedColumns` added to `TableConfig` interface.
- `scripts/sync-config.ts` - Table sync order configuration. Must be reordered to respect FK dependencies and updated to include generated columns.
- `scripts/sync-supabase.ts` - Main sync script with the `syncTable` and `runSync` functions. Must be refactored to use two-phase clear-then-insert approach and strip generated columns.
- `scripts/__tests__/sync-supabase.test.ts` - Tests for the sync script. Must be updated with tests for new table order, generated column stripping, and two-phase sync.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add `generatedColumns` to `TableConfig` in `sync-types.ts`
- Add a `readonly generatedColumns: readonly string[]` property to the `TableConfig` interface
- This property lists column names that should be stripped from data before inserting into staging (e.g., `created_at`, `updated_at`)

### 2. Update `createTableConfig` in `sync-config.ts` to accept generated columns
- Add a third parameter `generatedColumns: readonly string[] = []` to the `createTableConfig` function
- Include the `generatedColumns` property in the returned `TableConfig` object

### 3. Reorder `tablesToSync` and add generated columns in `sync-config.ts`
- Reorder the `tablesToSync` array to respect FK dependencies (parents first):
  1. `profilesTable` - parent, referenced by `games` and `game_players`
  2. `characterTable` - parent, referenced by `connection`
  3. `gamesTable` - child of `profiles`, parent of `game_players`
  4. `connectionTable` - child of `character`
  5. `gamePlayersTable` - child of `games` and `profiles`
- Add a comment documenting the dependency order and why it matters
- Update each table config with its generated columns:
  - `profilesTable`: `['created_at', 'updated_at']`
  - `characterTable`: `[]` (none)
  - `gamesTable`: `['created_at']`
  - `connectionTable`: `[]` (none)
  - `gamePlayersTable`: `['created_at']`

### 4. Add `stripGeneratedColumns` function in `sync-supabase.ts`
- Add an exported pure function `stripGeneratedColumns` that takes a record and a readonly array of column names, and returns a new record with those columns removed
- If the generated columns array is empty, return the record unchanged
- Use `Object.fromEntries` and `Object.entries` with `filter` to strip columns functionally

### 5. Refactor `runSync` in `sync-supabase.ts` to use two-phase sync
- **Phase 1 - Clear**: Iterate over `tablesToSync` in REVERSE order and clear each staging table. Reverse order ensures children are cleared before parents, avoiding FK violations during deletion.
  - Create the reversed list using `[...syncConfig.tablesToSync].reverse()`
  - Log the clearing phase clearly
- **Phase 2 - Insert**: Iterate over `tablesToSync` in FORWARD order (parents first). For each table:
  - Fetch production data
  - Anonymize PII fields
  - Strip generated columns
  - Insert into staging
  - Log progress
- Update the `syncTable` function to only handle fetch/anonymize/strip/insert (remove the `clearStagingTable` call from it)
- Add a new `clearAllStagingTables` function that clears tables in reverse dependency order
- Track results for both phases and report them

### 6. Update `syncTable` to strip generated columns in `sync-supabase.ts`
- After anonymizing records, apply `stripGeneratedColumns` using `tableConfig.generatedColumns`
- Pass the stripped data to `insertStagingData`

### 7. Update tests in `scripts/__tests__/sync-supabase.test.ts`
- Add a `describe('table sync order')` block that validates:
  - `profiles` comes before `games` in `tablesToSync`
  - `profiles` comes before `game_players` in `tablesToSync`
  - `character` comes before `connection` in `tablesToSync`
  - `games` comes before `game_players` in `tablesToSync`
- Add a `describe('stripGeneratedColumns')` block that validates:
  - Returns the record unchanged when generated columns array is empty
  - Strips specified columns from the record
  - Preserves all other columns
  - Handles records that don't contain the specified generated columns
- Add a `describe('generatedColumns configuration')` block that validates:
  - `profiles` table has `created_at` and `updated_at` in generated columns
  - `games` table has `created_at` in generated columns
  - `game_players` table has `created_at` in generated columns
  - `character` table has empty generated columns
  - `connection` table has empty generated columns

### 8. Run validation commands
- Execute all validation commands to confirm the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The table ordering comment in `sync-config.ts` is critical documentation — future developers adding new tables must understand the FK dependency chain to place tables correctly.
- The `id` column (UUID with `DEFAULT gen_random_uuid()`) must NOT be listed as a generated column, even though it has a default. Preserving production IDs is essential for maintaining referential integrity across synced tables.
- The `game_players` table likely has FK constraints to both `games(id)` and `profiles(id)` even though the old schema didn't show explicit REFERENCES clauses — the actual production database has evolved.
- The two-phase approach (clear all, then insert all) is essential because clearing a parent table while child records still exist in staging would also cause FK constraint violations.
