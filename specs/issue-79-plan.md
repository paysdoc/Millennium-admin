# Bug: Database Sync Fails in GitHub Actions

## Bug Description
The database sync script (`npm run sync:data`) fails during GitHub Actions execution with multiple errors:
1. Tables fail to sync because the `exec_sql` RPC function cannot be found in the schema cache
2. Storage bucket creation fails with "The resource already exists" error

The script attempts to copy production Supabase data to staging but fails to auto-create tables and mishandles bucket existence checks.

**Actual behavior:**
- Tables fail with: "Could not find the function public.exec_sql(sql_query) in the schema cache"
- Bucket fails with: "The resource already exists"
- Sync summary: 2 tables successful, 3 failed; 0 buckets successful, 1 failed

**Expected behavior:**
- All configured tables should sync successfully from production to staging
- Storage buckets should sync without errors
- The script should handle missing tables gracefully

## Problem Statement
The `src/lib/sync-data.ts` script has three critical issues:
1. **Wrong Supabase client configuration**: `src/lib/supabase.ts` configures both `getStagingSupabaseClient()` and `getProductionSupabaseClient()` to use the same environment variables (`SUPABASE_URL` and `SUPABASE_KEY`), causing both to point to the same database instead of separate production and staging environments.
2. **Missing RPC function dependency**: The script relies on a custom `exec_sql` RPC function that must be manually created in the staging Supabase database. This function doesn't exist by default.
3. **Flawed bucket existence check**: The `syncBucket` function assumes any error from `getBucket()` means the bucket doesn't exist. When the bucket exists but there's a different error, the script incorrectly tries to create it and fails with "already exists".

## Solution Statement
Fix the three root causes:
1. Update `src/lib/supabase.ts` to use the correct staging environment variables (`SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING`) for the staging client
2. Remove the `exec_sql` RPC function dependency by implementing proper error handling - if tables don't exist, log the required SQL and fail gracefully without attempting auto-creation (which requires admin privileges)
3. Fix the bucket existence check to properly distinguish between "bucket not found" errors and other errors, and handle "already exists" errors as success cases

## Steps to Reproduce
1. Set up environment variables for production and staging Supabase instances
2. Run `npm run sync:data` via GitHub Actions workflow
3. Observe the sync failures in the logs:
   - Tables fail with `exec_sql` function not found
   - Bucket creation fails with "already exists"

## Root Cause Analysis

### Issue 1: Supabase Client Configuration Bug
In `src/lib/supabase.ts`:
- `getStagingSupabaseClient()` (lines 10-24) uses `SUPABASE_URL` and `SUPABASE_KEY`
- `getProductionSupabaseClient()` (lines 26-40) ALSO uses `SUPABASE_URL` and `SUPABASE_KEY`
- Both functions return clients connected to the same database

The staging client should use `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING` as defined in the workflow environment variables.

### Issue 2: exec_sql RPC Function Dependency
In `src/lib/sync-data.ts`:
- `executeSQLOnStaging()` (lines 52-58) calls `staging.rpc('exec_sql', { sql_query: sql })`
- This custom function requires manual creation via Supabase SQL Editor
- Without it, auto-creating tables fails entirely
- The script should not rely on RPC functions that may not exist

### Issue 3: Bucket Existence Check Logic
In `src/lib/sync-data.ts`, `syncBucket()` (lines 140-148):
```typescript
const { error: bucketError } = await staging.storage.getBucket(bucketName)
if (bucketError) {
  // Assumes ANY error means bucket doesn't exist
  const { error: createError } = await staging.storage.createBucket(...)
}
```
This logic is flawed because:
- `getBucket()` can return errors for many reasons (permissions, API issues, etc.)
- If the bucket exists but `getBucket()` fails, `createBucket()` will fail with "already exists"
- The solution should check the specific error type before attempting creation

## Relevant Files
Use these files to fix the bug:

- `src/lib/supabase.ts` - Contains Supabase client factory functions. Bug: staging client uses wrong environment variables.
- `src/lib/sync-data.ts` - Main sync script. Contains table sync logic with `exec_sql` dependency and flawed bucket existence check.
- `src/lib/schema.ts` - Contains `isTableNotFoundError()` helper for error detection.
- `src/lib/table-schemas.ts` - Contains table SQL schemas for reference (not directly modified).
- `.github/workflows/sync-supabase.yml` - Defines environment variables passed to the sync script.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix Supabase Client Configuration
- Edit `src/lib/supabase.ts` to update `getStagingSupabaseClient()`:
  - Change from using `SUPABASE_URL` and `SUPABASE_KEY`
  - To using `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING`
- Update the error message to reflect the correct variable names

### 2. Remove exec_sql RPC Dependency
- Edit `src/lib/sync-data.ts` to remove the `executeSQLOnStaging()` function
- Modify `syncTable()` to handle missing tables without attempting auto-creation:
  - When a table doesn't exist in staging, log the required SQL from `getCreateTableSQL()`
  - Return a failure result with a clear message that the table must be created manually
  - Remove the retry logic that depends on `exec_sql`
- Remove the `SQLExecutionResult` interface that's no longer needed
- Update the comment block at the top of the file to remove references to `exec_sql`

### 3. Fix Bucket Existence Check
- Edit `src/lib/sync-data.ts` `syncBucket()` function to improve bucket handling:
  - Add a helper function to check if an error indicates "bucket not found"
  - Only attempt to create the bucket if the error specifically indicates it doesn't exist
  - Handle "already exists" errors during bucket creation as success (bucket exists, continue syncing)
  - For other `getBucket()` errors, report them and continue trying to sync files

### 4. Add Missing Error Detection Helper
- Edit `src/lib/schema.ts` to add a new helper function `isBucketNotFoundError()`:
  - Check for "Bucket not found" or similar error messages
  - Export the function for use in `sync-data.ts`

### 5. Update Tests
- Edit `scripts/__tests__/sync-supabase.test.ts` if any tests rely on removed functionality
- Ensure all existing tests pass with the changes

### 6. Run Validation Commands
- Run `npm run lint` to ensure no linting errors
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all tests pass

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The staging Supabase database must have tables manually created before running sync. The SQL statements are available in `src/lib/table-schemas.ts`.
- The GitHub Actions workflow already passes the correct environment variables (`SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, `SUPABASE_SERVICE_KEY_STAGING`). The bug is in the code not using them.
- Storage buckets must also exist in staging before running sync. The script will now handle existing buckets gracefully.
- After this fix, if tables don't exist in staging, the script will log the required SQL and fail gracefully instead of attempting auto-creation that requires admin privileges.
- Consider future enhancement: Use Supabase migrations to manage staging schema instead of relying on manual table creation.
