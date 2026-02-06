# PR-Review: Fix Environment Variable Naming Conflict with Develop Branch

## PR-Review Description
The PR review identified a critical conflict in `.env.sample` between this branch and the develop branch regarding Supabase environment variable naming conventions:

**Current Branch (incorrect):**
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` = Staging (target)
- `SUPABASE_PROD_URL`, `SUPABASE_PROD_KEY` = Production (source)

**Develop Branch (correct convention):**
- `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` = Production (source for sync, main app database)
- `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`, `SUPABASE_SERVICE_KEY_STAGING` = Staging (destination)

The reviewer states that `SUPABASE_URL`, `SUPABASE_KEY` and `SUPABASE_SERVICE_KEY` are for **production** and should remain so. For staging, the variables should be suffixed with `_STAGING`. The code must be updated to align with this convention.

## Summary of Original Implementation Plan
The original plan for issue #73 addressed:
1. Fix bucket name typo from `'character images'` to `'character_images'`
2. Create `table-schemas.ts` with CREATE TABLE statements for auto-creation
3. Add `executeSQLOnStaging()` helper for executing SQL via RPC
4. Update `syncTable` to auto-create missing tables
5. Add bucket auto-creation to `syncBucket` function
6. Update `.env.sample` with service role documentation

The issue: The plan incorrectly swapped the meaning of environment variables, treating `SUPABASE_URL` as staging instead of production.

## Relevant Files
Use these files to resolve the review:

- `.env.sample` - Must be reverted to use develop branch convention:
  - `SUPABASE_URL/KEY/SERVICE_KEY` = production
  - `SUPABASE_URL_STAGING/KEY_STAGING/SERVICE_KEY_STAGING` = staging
- `src/lib/supabase.ts` - Must update environment variable references:
  - `getStagingSupabaseClient()` should use `SUPABASE_URL_STAGING`, `SUPABASE_KEY_STAGING`
  - `getProductionSupabaseClient()` should use `SUPABASE_URL`, `SUPABASE_KEY`
- `src/lib/sync-data.ts` - Must update the `requiredVars` array to check for correct variable names

### Files NOT Requiring Changes
- `src/__tests__/sync-data.test.ts` - Only tests `isTableNotFoundError` function, no environment variable references

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Update `.env.sample` to match develop branch convention
Revert the environment variable naming to match the develop branch convention:

- Replace the current staging/production sections with:
  ```
  # Production Supabase (source for sync)
  SUPABASE_URL=https://gownillwfbtrbnkrvrxi.supabase.co
  SUPABASE_KEY=
  SUPABASE_SERVICE_KEY=

  # Staging Supabase (destination for sync)
  # NOTE: Use SERVICE ROLE key (not anon key) for full sync functionality.
  # The service role key is required for:
  #   - Bucket creation and management
  #   - Table creation via exec_sql RPC (if configured)
  # The anon key will work for data sync only.
  SUPABASE_URL_STAGING=https://hdyqdnnwhvhmvsdqvkpu.supabase.co
  SUPABASE_KEY_STAGING=
  SUPABASE_SERVICE_KEY_STAGING=
  ```

### Step 2: Update `src/lib/supabase.ts` to use correct variable names
Update the Supabase client functions to use the correct environment variable names:

**For `getStagingSupabaseClient()`:**
- Change `process.env.SUPABASE_URL` → `process.env.SUPABASE_URL_STAGING`
- Change `process.env.SUPABASE_KEY` → `process.env.SUPABASE_KEY_STAGING`
- Update the error message to reference `SUPABASE_URL_STAGING, SUPABASE_KEY_STAGING`

**For `getProductionSupabaseClient()`:**
- Change `process.env.SUPABASE_PROD_URL` → `process.env.SUPABASE_URL`
- Change `process.env.SUPABASE_PROD_KEY` → `process.env.SUPABASE_KEY`
- Update the error message to reference `SUPABASE_URL, SUPABASE_KEY`

### Step 3: Update `src/lib/sync-data.ts` environment variable check
Update the `requiredVars` array in the `main()` function:

- Change from:
  ```typescript
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_PROD_URL', 'SUPABASE_PROD_KEY']
  ```
- To:
  ```typescript
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_URL_STAGING', 'SUPABASE_KEY_STAGING']
  ```

### Step 4: Run validation commands
Execute all validation commands to ensure the fix works correctly:
- `npm run lint` - Verify no linting errors
- `npm run build` - Verify the build succeeds
- `npm test` - Verify all tests pass

## Validation Commands
Execute every command to validate the review is complete with zero regressions.

- `npm run lint` - Run linter to check for code quality issues
- `npm run build` - Build the application to verify no build errors
- `npm test` - Run tests to validate the review is complete with zero regressions

## Notes
- **Convention Consistency**: The develop branch established that `SUPABASE_URL/KEY/SERVICE_KEY` without suffix refers to production. This is the main database used by the application. The `_STAGING` suffix is for the staging environment.

- **Sync Direction**: The sync script copies data FROM production (source) TO staging (destination). Production = `SUPABASE_URL`, Staging = `SUPABASE_URL_STAGING`.

- **Service Key Requirement**: Both `SUPABASE_SERVICE_KEY` (production) and `SUPABASE_SERVICE_KEY_STAGING` (staging) may be needed for full functionality, but the sync script primarily needs the staging service key for creating buckets/tables.

- **No Functional Changes**: This is purely a naming convention fix. The sync functionality (auto-create tables, auto-create buckets, bucket name fix) implemented in the original PR remains unchanged - only the environment variable names are being corrected.

- **No Test Changes Required**: The test file `src/__tests__/sync-data.test.ts` only tests the `isTableNotFoundError` utility function and does not reference any environment variables, so it requires no updates.
