# PR-Review: Fix Bucket Name and Auto-Create Missing Tables/Buckets on Staging

## PR-Review Description
The PR review identified two critical issues with the current Supabase sync implementation:

1. **Incorrect bucket name**: The `BUCKETS_TO_SYNC` constant uses `'character images'` (with a space), but the actual production bucket is named `'character_images'` (with an underscore). This causes the bucket sync to fail.

2. **Missing auto-creation of tables/buckets**: When tables or buckets don't exist on staging, the sync script currently fails. The expected behavior is that the sync script should automatically create missing tables and buckets on staging based on the production schema, then sync the data.

## Summary of Original Implementation Plan
The original plan addressed the "table not found" error by:
1. Using `isTableNotFoundError` utility to detect missing tables
2. Skipping the clear step when a table doesn't exist
3. Adding proper logging

However, the original plan did not address:
- The incorrect bucket name (`'character images'` vs `'character_images'`)
- Automatically creating missing tables on staging
- Automatically creating missing buckets on staging

## Relevant Files
Use these files to resolve the review:

- `src/lib/sync-data.ts` - The main sync script that needs to be updated:
  - Fix the bucket name from `'character images'` to `'character_images'`
  - Add logic to create missing buckets on staging before syncing files
  - Add logic to create missing tables on staging before syncing data
- `src/lib/supabase.ts` - Contains Supabase client initialization. May need service role key for admin operations.
- `src/lib/schema.ts` - Contains `isTableNotFoundError` utility for error detection.
- `.env.sample` - Document service role key requirements for table/bucket creation.

### New Files
- `src/lib/table-schemas.ts` - SQL CREATE TABLE statements for all synced tables, allowing schema creation on staging.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix the bucket name typo
Update `src/lib/sync-data.ts` to correct the bucket name:
- Change `BUCKETS_TO_SYNC` from `['character images']` to `['character_images']`
- This is a one-line fix at line 8

### Step 2: Create table-schemas.ts with CREATE TABLE statements
Create `src/lib/table-schemas.ts` containing SQL schemas for all tables:
- Define `TABLE_SCHEMAS` as a `Record<string, string>` mapping table names to CREATE TABLE SQL
- Include schemas for: `character`, `connection`, `game_players`, `games`, `profiles`
- Base schemas on existing TypeScript interfaces in `src/types/`
- Export `getCreateTableSQL(tableName: string): string | undefined`

Example structure:
```typescript
export const TABLE_SCHEMAS: Record<string, string> = {
  character: `
    CREATE TABLE IF NOT EXISTS public.character (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      first_names TEXT,
      birth_date TEXT,
      death_date TEXT,
      biography TEXT,
      type TEXT NOT NULL,
      link TEXT,
      image_link TEXT
    );
  `,
  connection: `
    CREATE TABLE IF NOT EXISTS public.connection (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      char1_id UUID NOT NULL REFERENCES public.character(id),
      char2_id UUID NOT NULL REFERENCES public.character(id),
      value INTEGER,
      why TEXT,
      why_short TEXT,
      active BOOLEAN DEFAULT true
    );
  `,
  // ... schemas for game_players, games, profiles
}

export function getCreateTableSQL(tableName: string): string | undefined {
  return TABLE_SCHEMAS[tableName]
}
```

### Step 3: Add RPC function check and SQL execution helper
Add a helper function to `src/lib/sync-data.ts` to execute raw SQL via Supabase RPC:
- Check if an `exec_sql` RPC function exists on staging
- If it exists, use it to execute CREATE TABLE statements
- If not, log a warning and provide manual instructions

```typescript
async function executeSQLOnStaging(
  sql: string,
  staging: SupabaseClient
): Promise<{ success: boolean; error?: string }> {
  const { error } = await staging.rpc('exec_sql', { sql_query: sql })
  if (error) {
    // RPC function doesn't exist or execution failed
    return { success: false, error: error.message }
  }
  return { success: true }
}
```

### Step 4: Update syncTable to create missing tables
Update the `syncTable` function in `src/lib/sync-data.ts`:
- Import `getCreateTableSQL` from `./table-schemas`
- When insert fails due to table not found:
  1. Get the CREATE TABLE SQL from `getCreateTableSQL(tableName)`
  2. Attempt to execute the SQL via `executeSQLOnStaging()`
  3. If successful, retry the insert
  4. If RPC fails, log clear instructions for manual table creation

```typescript
if (insertError && isTableNotFoundError(insertError)) {
  console.log(`  Table ${tableName} does not exist in staging, attempting to create...`)

  const createSQL = getCreateTableSQL(tableName)
  if (!createSQL) {
    console.error(`  No schema definition found for table ${tableName}`)
    return { success: false, name: tableName, error: 'No schema definition available' }
  }

  const { success: created, error: createError } = await executeSQLOnStaging(createSQL, staging)
  if (!created) {
    console.error(`  Could not auto-create table. Please create manually in Supabase Dashboard.`)
    console.error(`  Required SQL:\n${createSQL}`)
    return { success: false, name: tableName, error: `Table must be created manually: ${createError}` }
  }

  console.log(`  Created table ${tableName} on staging`)
  // Retry insert after table creation
  const { error: retryError } = await staging.from(tableName).insert(rows)
  if (retryError) {
    return { success: false, name: tableName, error: retryError.message }
  }
  console.log(`  Successfully synced ${rows.length} rows`)
  return { success: true, name: tableName, rowCount: rows.length }
}
```

### Step 5: Add bucket auto-creation to syncBucket function
Update the `syncBucket` function in `src/lib/sync-data.ts`:
- Before syncing, check if bucket exists on staging using `getBucket()`
- If bucket doesn't exist, create it using `createBucket()`
- Handle creation errors appropriately

```typescript
// At the start of syncBucket, before listing production files:
const { error: bucketCheckError } = await staging.storage.getBucket(bucketName)
if (bucketCheckError) {
  console.log(`  Bucket ${bucketName} does not exist in staging, creating...`)
  const { error: createError } = await staging.storage.createBucket(bucketName, { public: true })
  if (createError) {
    console.error(`  Error creating bucket: ${createError.message}`)
    return { success: false, name: bucketName, error: `Failed to create bucket: ${createError.message}` }
  }
  console.log(`  Created bucket ${bucketName} on staging`)
}
```

### Step 6: Update .env.sample with service role documentation
Update `.env.sample`:
- Add comments explaining that service role keys are required for:
  - Bucket creation on staging
  - Table creation via RPC (if using exec_sql function)
- Document that anon keys will fail for these admin operations

```
# Staging Supabase credentials
# NOTE: Use SERVICE ROLE key (not anon key) for sync script to work
# The service role key is required for bucket creation and table management
SUPABASE_URL=your_staging_supabase_url
SUPABASE_KEY=your_staging_service_role_key

# Production Supabase credentials
# NOTE: Use SERVICE ROLE key for reading all data
SUPABASE_PROD_URL=your_production_supabase_url
SUPABASE_PROD_KEY=your_production_service_role_key
```

### Step 7: Add exec_sql RPC function documentation
Add a note in the sync-data.ts file header or create documentation for setting up the `exec_sql` RPC function on staging:

```sql
-- Run this in Supabase SQL Editor on staging to enable auto table creation
CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS VOID AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

This is optional - if the function doesn't exist, the script will still work but will require manual table creation.

### Step 8: Run validation commands
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
- **Bucket Naming**: The production bucket uses underscores (`character_images`), not spaces. This is a critical fix.

- **Bucket Creation**: Supabase Storage API fully supports bucket creation via `createBucket()`. This will work automatically with service role keys.

- **Table Creation Strategy**: Since Supabase PostgREST cannot execute DDL directly, we use a two-tier approach:
  1. **Automatic**: If an `exec_sql` RPC function exists on staging, tables are created automatically
  2. **Manual fallback**: If RPC is unavailable, clear instructions and SQL are provided for manual creation

- **Service Role Key Requirement**: Both bucket creation and SQL execution via RPC require service role keys, not anon keys. Update `.env` files accordingly.

- **Schema Definitions**: The `table-schemas.ts` file should be kept in sync with production schema. When production schema changes, this file must be updated.

- **Idempotent Operations**: All operations are idempotent - using `CREATE TABLE IF NOT EXISTS` for tables and checking bucket existence before creation.

- **Foreign Key Considerations**: The `connection` table has foreign keys to `character`. The sync order in `TABLES_TO_SYNC` should ensure `character` is synced before `connection`.
