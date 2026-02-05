# PR-Review: Database Sync Type Mismatch and RLS Policy Errors

## PR-Review Description
The PR review reports that the database sync script (`npm run sync:data`) is still failing with three distinct errors after the initial implementation attempt:

1. **Type mismatch errors for `character` and `connection` tables**: `invalid input syntax for type bigint: ""`
2. **Type mismatch error for `profiles` table**: `invalid input syntax for type uuid: ""`
3. **RLS policy violation for `character_images` bucket**: `new row violates row-level security policy`

These errors occur during the "clear staging table" phase and bucket creation phase respectively. The root cause is that the delete filter `.neq('id', '')` compares the `id` column to an empty string, which fails for bigint and uuid column types. Additionally, bucket creation fails because the staging client uses an anon key that doesn't have permission to create buckets when RLS is enabled.

## Summary of Original Implementation Plan
The original implementation plan (issue #79) addressed three issues:
1. **Supabase client configuration bug**: Updated `getStagingSupabaseClient()` to use `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING` instead of production variables
2. **exec_sql RPC dependency**: Removed the `exec_sql` RPC function dependency and implemented graceful failure for missing tables
3. **Bucket existence check logic**: Added `isBucketNotFoundError()` and `isBucketAlreadyExistsError()` helper functions for proper error handling

The client configuration fix was successful, but the table clearing logic introduced a new bug (`.neq('id', '')`) and the bucket creation still fails due to RLS policy requiring a service role key.

## Relevant Files
Use these files to resolve the review:

- `src/lib/sync-data.ts` - Contains the sync logic with the flawed `.neq('id', '')` delete filter on line 51. This file needs to be updated to use the service role client for operations that require elevated permissions.
- `src/lib/supabase.ts` - Contains Supabase client factory functions. Needs a new `getStagingServiceClient()` function that uses the service role key to bypass RLS.
- `src/lib/schema.ts` - Contains error detection helper functions. May need additional helpers for RLS-related errors.
- `.github/workflows/sync-supabase.yml` - Reference file showing that `SUPABASE_SERVICE_KEY_STAGING` is already available as an environment variable.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Add Service Role Client to supabase.ts
- Edit `src/lib/supabase.ts` to add a new `getStagingServiceClient()` function
- This function should use `SUPABASE_SERVICE_KEY_STAGING` environment variable instead of `SUPABASE_KEY_STAGING`
- The service role key bypasses RLS and is required for admin operations like:
  - Deleting all rows from tables (clearing before sync)
  - Creating storage buckets
- Export the new function for use in sync-data.ts

### 2. Fix Table Clearing Logic in sync-data.ts
- Edit `src/lib/sync-data.ts` to import `getStagingServiceClient` from supabase.ts
- Replace the flawed delete filter on line 51:
  - Current: `.delete().neq('id', '')`
  - Issue: Compares id (bigint/uuid) to empty string, which fails type checking
  - Fix: Use the service role client for delete operations which bypasses RLS
  - Alternative filter: Use `.not('id', 'is', null)` which works for all column types
- The service role client should be used for the `delete()` operation to ensure it works regardless of RLS policies

### 3. Fix Bucket Creation to Use Service Role Client
- Edit `src/lib/sync-data.ts` to use `getStagingServiceClient()` for storage operations
- The bucket creation on line 97 fails because the anon key doesn't have permission to insert into `storage.buckets` when RLS is enabled
- Pass the service role client to `syncBucket()` or create a separate service client instance for storage operations
- This will allow bucket creation to bypass RLS policies

### 4. Update syncTable Function Signature
- Modify the `syncTable()` function to accept a separate service client for admin operations
- Use the service client for delete operations (clearing existing data)
- Use the regular staging client for insert operations (which may have RLS policies that should be respected)
- This separation allows for proper permission handling

### 5. Update syncBucket Function Signature
- Modify the `syncBucket()` function to accept a service client for admin operations
- Use the service client for bucket creation and file deletion
- Use the regular staging client for file uploads (to respect RLS on file uploads if any)

### 6. Update main() Function to Create Service Client
- Edit the `main()` function in `sync-data.ts`
- Add `SUPABASE_SERVICE_KEY_STAGING` to the required environment variables check
- Create both the regular staging client and service client
- Pass both clients to sync functions as needed

### 7. Run Validation Commands
- Run `npm run lint` to ensure no linting errors
- Run `npm run build` to verify no build errors
- Run `npm test` to validate all tests pass

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- The `SUPABASE_SERVICE_KEY_STAGING` environment variable is already defined in the GitHub Actions workflow (`.github/workflows/sync-supabase.yml` line 34), so no workflow changes are needed
- Service role keys bypass Row-Level Security (RLS), so they should only be used for necessary admin operations
- For data insertion, the regular anon key should still be used to ensure any RLS policies on data creation are respected
- The type mismatch error occurs because PostgreSQL cannot compare a bigint or uuid column to an empty string literal - this is a database-level type validation error
- Consider adding a unit test for the delete filter to prevent regression
