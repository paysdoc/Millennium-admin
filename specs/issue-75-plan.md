# Bug: Database Sync Script Fails with Type Conversion Errors

## Bug Description
The Supabase data sync script (`npm run sync:data`) fails when attempting to sync tables from production to staging. The script encounters PostgreSQL type conversion errors when clearing staging tables, and storage bucket creation fails due to Row Level Security (RLS) policy violations.

**Symptoms:**
- Tables `character` and `connection` fail with: "invalid input syntax for type bigint: """
- Table `profiles` fails with: "invalid input syntax for type uuid: """
- Bucket `character_images` fails with: "new row violates row-level security policy"

**Expected behavior:** The sync script should successfully copy all table data and storage bucket contents from production to staging.

**Actual behavior:** 3 out of 5 tables fail to sync, and 1 storage bucket fails to create, resulting in a partial sync with exit code 1.

## Problem Statement
The sync script uses an invalid PostgreSQL filter `.neq('id', '')` to delete all rows from staging tables. This filter attempts to compare the `id` column (which is `bigint` or `uuid` type) against an empty string literal, causing PostgreSQL to reject the query due to type mismatch. Additionally, the storage bucket creation fails because the Supabase client is not using the service role key required to bypass RLS policies.

## Solution Statement
1. Replace the invalid `.neq('id', '')` filter with `.not('id', 'is', null)` which generates valid SQL `WHERE id IS NOT NULL` that works for all column types.
2. Update the `supabase.ts` client factory to use the correct environment variables for staging (`SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`).
3. Create separate service role client functions for admin operations (bucket creation) that use `SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_KEY_STAGING`.

## Steps to Reproduce
1. Configure environment variables for production and staging Supabase instances
2. Run `npm run sync:data`
3. Observe the following errors in output:
   - "Error clearing staging table: invalid input syntax for type bigint: """ for `character` and `connection`
   - "Error clearing staging table: invalid input syntax for type uuid: """ for `profiles`
   - "Error creating bucket: new row violates row-level security policy" for `character_images`

## Root Cause Analysis

### Issue 1: Invalid Type Comparison in Delete Filter
**Location:** `src/lib/sync-data.ts:81`
```typescript
const { error: clearError } = await staging.from(tableName).delete().neq('id', '')
```

**Root Cause:** The Supabase JS client's `.neq('id', '')` generates SQL like `DELETE FROM table WHERE id != ''`. PostgreSQL attempts to cast the empty string `''` to the type of the `id` column:
- For `character` and `connection` tables: `id` is `bigint`, and `''` cannot be cast to `bigint`
- For `profiles` table: `id` is `uuid`, and `''` cannot be cast to `uuid`

**Fix:** Use `.not('id', 'is', null)` which generates `WHERE id IS NOT NULL`. Since primary keys are never null, this selects all rows regardless of the `id` column type.

### Issue 2: Wrong Environment Variables for Staging Client
**Location:** `src/lib/supabase.ts:10-24`
```typescript
export function getStagingSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL  // Wrong! Should be SUPABASE_URL_STAGING
  const supabaseKey = process.env.SUPABASE_KEY  // Wrong! Should be SUPABASE_KEY_STAGING
}
```

**Root Cause:** The `getStagingSupabaseClient` function uses the production environment variables instead of the staging-specific ones. The `sync-data.ts` script expects separate staging variables (`SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`), but the client factory doesn't use them.

**Fix:** Update `getStagingSupabaseClient` to use `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING`.

### Issue 3: RLS Policy Blocks Bucket Creation
**Location:** `src/lib/sync-data.ts:143`
```typescript
const { error: createError } = await staging.storage.createBucket(bucketName, { public: true })
```

**Root Cause:** Storage bucket creation requires admin privileges that bypass RLS. The current client uses the anonymous/public key instead of the service role key, which is blocked by RLS policies on the `storage.buckets` table.

**Fix:** Create separate service role client functions that use `SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_KEY_STAGING` for admin operations like bucket creation.

## Relevant Files
Use these files to fix the bug:

- `src/lib/sync-data.ts` - Main sync script containing the invalid delete filter at line 81 and bucket creation at line 143
- `src/lib/supabase.ts` - Supabase client factory with incorrect environment variable usage for staging
- `src/__tests__/sync-data.test.ts` - Test file to add tests for the fix
- `src/lib/table-schemas.ts` - Reference for table schema definitions (read-only)
- `.github/workflows/sync-supabase.yml` - GitHub Actions workflow that defines available environment variables (read-only)

## Step by Step Tasks

### 1. Fix the Supabase Client Factory Environment Variables
- In `src/lib/supabase.ts`, update `getStagingSupabaseClient` to use `SUPABASE_URL_STAGING` and `SUPABASE_KEY_STAGING`
- Update the error message to reflect the correct environment variable names
- Ensure `getProductionSupabaseClient` continues to use `SUPABASE_URL` and `SUPABASE_KEY`

### 2. Add Service Role Client Functions for Admin Operations
- In `src/lib/supabase.ts`, add `getProductionServiceClient()` function that uses `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
- Add `getStagingServiceClient()` function that uses `SUPABASE_URL_STAGING` and `SUPABASE_SERVICE_KEY_STAGING`
- These clients will be used for operations requiring admin privileges (bucket creation, table clearing)

### 3. Fix the Delete Filter in sync-data.ts
- In `src/lib/sync-data.ts` line 81, replace:
  ```typescript
  await staging.from(tableName).delete().neq('id', '')
  ```
  with:
  ```typescript
  await staging.from(tableName).delete().not('id', 'is', null)
  ```
- This generates valid SQL `WHERE id IS NOT NULL` that works for all ID types (bigint, uuid, etc.)

### 4. Update Bucket Sync to Use Service Role Client
- In `src/lib/sync-data.ts`, import the new `getStagingServiceClient` function
- Update `syncBucket` function to use the service role client for bucket creation (line 143)
- The service role key bypasses RLS policies, allowing bucket creation

### 5. Update Required Environment Variables Check
- In `src/lib/sync-data.ts` line 200, update `requiredVars` to include service keys:
  ```typescript
  const requiredVars = [
    'SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_SERVICE_KEY',
    'SUPABASE_URL_STAGING', 'SUPABASE_KEY_STAGING', 'SUPABASE_SERVICE_KEY_STAGING'
  ]
  ```

### 6. Add Unit Tests for the Fix
- In `src/__tests__/sync-data.test.ts`, add test cases for:
  - Test that the delete filter uses `.not('id', 'is', null)` syntax (mock test)
  - Test that `getStagingSupabaseClient` uses correct staging environment variables
  - Test that service role clients are created with correct environment variables

### 7. Run Validation Commands
- Execute all validation commands to confirm the bug is fixed with zero regressions

## Validation Commands
Execute every command to validate the bug is fixed with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the bug is fixed with zero regressions

## Notes
- The sync script is designed to run in GitHub Actions via the workflow at `.github/workflows/sync-supabase.yml`
- Environment variables for production and staging are stored as GitHub Secrets
- The service role key provides admin access that bypasses Row Level Security (RLS)
- The `character_images` bucket name in `sync-data.ts` uses underscore (`character_images`) while `sync-config.ts` uses space (`character images`) - ensure consistency
- The Supabase PostgREST API requires a filter for DELETE operations, hence the need for `.not('id', 'is', null)` rather than just `.delete()`
- After fixing, consider running the sync script manually via GitHub Actions workflow_dispatch to verify the fix in the actual CI environment
