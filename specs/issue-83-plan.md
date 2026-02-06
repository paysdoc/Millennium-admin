# Bug: Previous bug returned - invalid input syntax for type bigint/uuid in sync script

## Bug Description
The Supabase data sync script (`scripts/sync-supabase.ts`) fails when attempting to clear staging tables before syncing data from production. All 5 tables fail with PostgreSQL type conversion errors:

- `character` and `connection` fail with: `invalid input syntax for type bigint: ""`
- `game_players`, `games`, and `profiles` fail with: `invalid input syntax for type uuid: ""`

**Expected behavior:** The sync script should successfully clear staging tables and copy all data from production to staging.

**Actual behavior:** All 5 tables fail to sync (0 successful, 5 failed) because the staging table clearing step uses an invalid PostgreSQL filter that attempts to compare `id` columns (bigint/uuid types) against an empty string.

## Problem Statement
The `clearStagingTable` function in `scripts/sync-supabase.ts` at line 213 uses `.neq('id', '')` to delete all rows from a staging table. This generates SQL like `DELETE FROM table WHERE id != ''`, which causes PostgreSQL to attempt casting the empty string `''` to the column's type (bigint or uuid), resulting in a type conversion error. This is the exact same bug that was previously fixed in `src/lib/sync-data.ts` as part of issue #75, but the fix was never applied to the separate `scripts/sync-supabase.ts` implementation.

## Solution Statement
Replace `.neq('id', '')` with `.not('id', 'is', null)` in `scripts/sync-supabase.ts` line 213. This generates valid SQL `WHERE id IS NOT NULL` that works for all column types (bigint, uuid, etc.) since primary keys are never null. Additionally, add a unit test to verify the correct filter is used, preventing future regressions.

## Steps to Reproduce
1. Configure environment variables for production and staging Supabase instances (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_URL_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`)
2. Run `npx tsx scripts/sync-supabase.ts`
3. Observe all 5 tables fail with type conversion errors:
   - `Error syncing character: Failed to clear character: invalid input syntax for type bigint: ""`
   - `Error syncing connection: Failed to clear connection: invalid input syntax for type bigint: ""`
   - `Error syncing game_players: Failed to clear game_players: invalid input syntax for type uuid: ""`
   - `Error syncing games: Failed to clear games: invalid input syntax for type uuid: ""`
   - `Error syncing profiles: Failed to clear profiles: invalid input syntax for type uuid: ""`

## Root Cause Analysis
The root cause is in `scripts/sync-supabase.ts` at line 213:

```typescript
const clearStagingTable = async (
  client: SupabaseClient,
  tableName: string
): Promise<void> => {
  const { error } = await client.from(tableName).delete().neq('id', '')
  // ...
}
```

The Supabase JS client's `.neq('id', '')` generates SQL like `DELETE FROM table WHERE id != ''`. PostgreSQL attempts to cast the empty string literal `''` to the type of the `id` column:
- For `character` and `connection` tables: `id` is `bigint`, and `''` cannot be cast to `bigint`
- For `game_players`, `games`, and `profiles` tables: `id` is `uuid`, and `''` cannot be cast to `uuid`

This is the same bug that was fixed in issue #75 in `src/lib/sync-data.ts` (line 85), where `.neq('id', '')` was replaced with `.not('id', 'is', null)`. However, `scripts/sync-supabase.ts` is a separate implementation of the sync script that was created independently and contains the same unfixed bug.

The fix `.not('id', 'is', null)` generates `WHERE id IS NOT NULL`, which is valid SQL for all column types. Since primary keys are always `NOT NULL`, this effectively selects all rows for deletion.

## Relevant Files
Use these files to fix the bug:

- `scripts/sync-supabase.ts` - The sync script with the bug at line 213. Contains the `clearStagingTable` function that uses the invalid `.neq('id', '')` filter.
- `scripts/__tests__/sync-supabase.test.ts` - Existing test file for the sync script. Needs a new test to verify `clearStagingTable` uses the correct delete filter.

### Reference Files (read-only)
- `src/lib/sync-data.ts` - Contains the correctly fixed version (line 85) using `.not('id', 'is', null)` for reference.
- `scripts/sync-config.ts` - Sync configuration (tables, PII rules). No changes needed.
- `scripts/sync-types.ts` - TypeScript type definitions. No changes needed.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix the delete filter in `scripts/sync-supabase.ts`
- In `scripts/sync-supabase.ts` line 213, replace `.neq('id', '')` with `.not('id', 'is', null)` in the `clearStagingTable` function
- The change is in the body of the `clearStagingTable` function:
  ```typescript
  // Before (line 213):
  const { error } = await client.from(tableName).delete().neq('id', '')

  // After:
  const { error } = await client.from(tableName).delete().not('id', 'is', null)
  ```
- Export the `clearStagingTable` function so it can be tested directly:
  ```typescript
  // Before:
  const clearStagingTable = async (

  // After:
  export const clearStagingTable = async (
  ```

### 2. Add unit test for `clearStagingTable` in `scripts/__tests__/sync-supabase.test.ts`
- Import `clearStagingTable` from `../sync-supabase`
- Add a new `describe('clearStagingTable', ...)` block with the following tests:
  - Test that `clearStagingTable` calls `.not('id', 'is', null)` on the Supabase client (mock the client chain: `from()` → `delete()` → `not()`)
  - Test that `clearStagingTable` throws when the Supabase client returns an error
  - Test that `clearStagingTable` resolves successfully when no error is returned
- Use the same mocking pattern as the existing `listBucketFiles` and `clearBucket` tests in the file

### 3. Run Validation Commands
- Execute all validation commands to confirm the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- IMPORTANT: strictly adhere to the coding guidelines in `/guidelines`. If necessary, refactor existing code to meet the coding guidelines as part of fixing the bug.
- The fix is a single-line change in `scripts/sync-supabase.ts` line 213, mirroring the same fix already applied in `src/lib/sync-data.ts` line 85 from issue #75.
- The `scripts/sync-supabase.ts` is a more feature-rich implementation with PII anonymization, pagination, and batch processing. It was created separately from `src/lib/sync-data.ts` and the bug fix from issue #75 was not applied to it.
- The error log format in the issue (e.g., "Environment validated", "Supabase clients created", "Error syncing character: Failed to clear character:") matches `scripts/sync-supabase.ts` output, NOT `src/lib/sync-data.ts`, confirming this is the file being executed.
- The `npm run sync:data` command in `package.json` points to `src/lib/sync-data.ts` (which is already fixed), so the reporter is running `scripts/sync-supabase.ts` directly via `npx tsx scripts/sync-supabase.ts`.
