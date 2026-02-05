# Bug: Supabase Table Sync Fails on Empty Staging Database

## Bug Description
When syncing Supabase data from production to staging, the sync process fails for all tables with the error: "Could not find the table 'public.X' in the schema cache". The sync successfully fetches data from production but fails when attempting to clear tables on the staging database. Storage bucket sync works correctly.

**Symptoms:**
- All 5 tables fail to sync (character, connection, game_players, games, profiles)
- Each table shows: "Fetched N rows from production" then "Error syncing X: Failed to clear X: Could not find the table..."
- Storage bucket sync succeeds (1 successful, 0 failed)
- The staging database is completely empty with no tables

**Expected behavior:** The sync process should successfully sync data from production to staging, creating tables if needed or handling missing tables gracefully.

**Actual behavior:** The sync fails on all tables because it attempts to clear (delete from) tables that don't exist in the staging database.

## Problem Statement
The Supabase data sync script attempts to clear tables on the staging database before inserting data, but doesn't handle the case where the staging database is empty (no tables exist). When a table doesn't exist, Supabase's PostgREST API returns a "schema cache" error, causing the sync to fail.

## Solution Statement
Create a robust data sync script that handles empty staging databases by:
1. Using the existing `isTableNotFoundError` utility from `src/lib/schema.ts` to detect when tables don't exist
2. Skipping the clear step when a table doesn't exist (data will be inserted into an empty table anyway)
3. Using upsert operations with `onConflict` to handle both insert and update scenarios
4. Providing clear logging for which tables were created vs cleared

The sync script will be created as a standalone CLI script in `src/lib/sync-data.ts` with an npm script entry for easy execution.

## Steps to Reproduce
1. Ensure staging Supabase database is completely empty (no tables, no buckets)
2. Run the Supabase data sync command
3. Observe that all table syncs fail with "Could not find the table 'public.X' in the schema cache" error
4. Note that storage bucket sync succeeds

## Root Cause Analysis
The root cause is that the sync process follows this pattern:
1. Fetch data from production table ✓
2. Clear (delete all rows from) staging table ✗ - FAILS when table doesn't exist
3. Insert fetched data into staging table - Never reached

When the staging database is empty:
- There are no tables in the `public` schema
- Supabase's PostgREST API uses a schema cache to validate table names
- Attempting to delete from a non-existent table returns "Could not find the table 'public.X' in the schema cache"
- The script doesn't catch or handle this specific error

The fix requires detecting the "table not found" error and skipping the clear step, since there's nothing to clear in an empty table anyway.

## Relevant Files
Use these files to fix the bug:

- `src/lib/schema.ts` - Contains `isTableNotFoundError()` utility that detects table-not-found errors. Will be reused for error handling in the sync script.
- `src/lib/supabase.ts` - Contains `getSupabaseClient()` for Supabase client initialization. Will need to be extended to support production/staging clients.
- `src/types/character.ts` - Defines `CharacterRow` interface matching the `character` table schema.
- `src/types/connection.ts` - Defines `Connection` interface matching the `connection` table schema.
- `package.json` - Will add new npm script for running the sync.
- `.env.sample` - Will need to document new environment variables for production Supabase.

### New Files
- `src/lib/sync-data.ts` - New CLI script for syncing Supabase data from production to staging. Handles table-not-found errors gracefully.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update .env.sample with production Supabase variables
Add documentation for production Supabase environment variables:
- Add `SUPABASE_PROD_URL` - Production Supabase project URL
- Add `SUPABASE_PROD_KEY` - Production Supabase anon/service key
- Keep existing staging variables (SUPABASE_URL, SUPABASE_KEY) as-is
- Add comment section explaining production vs staging configuration

### Step 2: Extend supabase.ts to support production client
Update `src/lib/supabase.ts` to support both production and staging Supabase clients:
- Keep existing `getSupabaseClient()` for staging (default behavior)
- Add `getProductionSupabaseClient()` function that uses SUPABASE_PROD_URL and SUPABASE_PROD_KEY
- Add `getStagingSupabaseClient()` as explicit alias for `getSupabaseClient()`
- Implement proper singleton pattern for both clients

### Step 3: Create the sync-data.ts script
Create `src/lib/sync-data.ts` with the following functionality:
- Import `isTableNotFoundError` from `./schema`
- Import production and staging Supabase clients from `./supabase`
- Define `TABLES_TO_SYNC` constant: `['character', 'connection', 'game_players', 'games', 'profiles']`
- Define `EXCLUDED_TABLES` constant: `['users']`
- Define `BUCKETS_TO_SYNC` constant: `['character images']`

Implement `syncTable(tableName: string)` function:
- Fetch all rows from production using `.from(tableName).select('*')`
- Attempt to clear staging table using `.from(tableName).delete().neq('id', '')`
- If clear fails with table-not-found error, log warning and continue (table is effectively empty)
- Insert fetched rows into staging using `.from(tableName).insert(rows)`
- Return success/failure status with row count

Implement `syncBucket(bucketName: string)` function:
- List all files in production bucket
- Clear staging bucket (handle if bucket doesn't exist)
- Copy files from production to staging
- Return success/failure status with file count

Implement `main()` function:
- Validate environment variables (all 4 Supabase vars required)
- Log "Starting Supabase data sync..."
- Log excluded tables
- Create production and staging clients
- Loop through TABLES_TO_SYNC, call syncTable, track successes/failures
- Loop through BUCKETS_TO_SYNC, call syncBucket, track successes/failures
- Log summary with counts and duration
- Exit with code 1 if any failures

### Step 4: Add npm script for sync command
Update `package.json` to add:
- `"sync:data": "tsx src/lib/sync-data.ts"` script

### Step 5: Add unit tests for sync functionality
Create `src/__tests__/sync-data.test.ts`:
- Test that `isTableNotFoundError` correctly identifies schema cache errors
- Test sync behavior when staging table doesn't exist (should succeed)
- Test sync behavior when staging table exists (should clear and insert)
- Mock Supabase client for unit tests

### Step 6: Run validation commands
Execute all validation commands to ensure the fix works correctly:
- `npm run lint` - Verify no linting errors
- `npm run build` - Verify the build succeeds
- `npm test` - Verify all tests pass

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- **Environment Setup**: Users must configure both production and staging Supabase credentials in `.env` before running sync.
- **Table Schema**: The sync script assumes tables exist in production with the same schema expected in staging. If staging tables need to be created, that should be done via Supabase dashboard or migrations.
- **PostgREST Limitations**: Supabase's PostgREST API cannot create tables - it can only read/write to existing tables. The fix focuses on handling the case where tables don't exist yet rather than creating them.
- **Existing Pattern**: The `isTableNotFoundError()` utility in `src/lib/schema.ts` already handles this exact error pattern. The fix reuses this existing utility.
- **Storage Buckets**: The error shows bucket sync already works. The fix focuses on table sync only.
- **File Size**: Keep `sync-data.ts` under 150 lines per coding guidelines. If it grows larger, split into separate modules.
