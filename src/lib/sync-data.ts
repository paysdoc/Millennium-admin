/**
 * Supabase Data Sync Script
 *
 * Syncs tables and storage buckets from production to staging.
 *
 * OPTIONAL: To enable automatic table creation on staging, create this RPC function
 * in Supabase SQL Editor on staging:
 *
 * ```sql
 * CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
 * RETURNS VOID AS $$
 * BEGIN
 *   EXECUTE sql_query;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 * ```
 *
 * Without this function, the script will still work but will require manual table creation.
 */

import 'dotenv/config'
import { SupabaseClient } from '@supabase/supabase-js'
import { isTableNotFoundError } from './schema'
import {
  getProductionSupabaseClient,
  getStagingServiceClient,
  getStagingSupabaseClient,
} from './supabase'
import { getCreateTableSQL } from './table-schemas'

const TABLES_TO_SYNC = ['character', 'connection', 'game_players', 'games', 'profiles'] as const
const EXCLUDED_TABLES = ['users'] as const
const BUCKETS_TO_SYNC = ['character_images'] as const

interface SyncResult {
  success: boolean
  name: string
  rowCount?: number
  fileCount?: number
  error?: string
}

interface SQLExecutionResult {
  success: boolean
  error?: string
}

/**
 * Execute raw SQL on staging via the exec_sql RPC function.
 * This is used to create tables that don't exist on staging.
 *
 * @param sql - The SQL statement to execute
 * @param staging - The staging Supabase client
 * @returns Result indicating success or failure with error message
 */
async function executeSQLOnStaging(sql: string, staging: SupabaseClient): Promise<SQLExecutionResult> {
  const { error } = await staging.rpc('exec_sql', { sql_query: sql })
  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true }
}

async function syncTable(
  tableName: string,
  production: SupabaseClient,
  staging: SupabaseClient
): Promise<SyncResult> {
  console.log(`\nSyncing table: ${tableName}`)

  const { data: rows, error: fetchError } = await production.from(tableName).select('*')

  if (fetchError) {
    console.error(`  Error fetching from production: ${fetchError.message}`)
    return { success: false, name: tableName, error: fetchError.message }
  }

  console.log(`  Fetched ${rows?.length ?? 0} rows from production`)

  if (!rows || rows.length === 0) {
    console.log(`  No data to sync for ${tableName}`)
    return { success: true, name: tableName, rowCount: 0 }
  }

  const { error: clearError } = await staging.from(tableName).delete().not('id', 'is', null)

  if (clearError) {
    if (isTableNotFoundError(clearError)) {
      console.log(`  Table ${tableName} does not exist in staging, skipping clear`)
    } else {
      console.error(`  Error clearing staging table: ${clearError.message}`)
      return { success: false, name: tableName, error: clearError.message }
    }
  } else {
    console.log(`  Cleared existing data from staging`)
  }

  const { error: insertError } = await staging.from(tableName).insert(rows)

  if (insertError) {
    if (isTableNotFoundError(insertError)) {
      console.log(`  Table ${tableName} does not exist in staging, attempting to create...`)

      const createSQL = getCreateTableSQL(tableName)
      if (!createSQL) {
        console.error(`  No schema definition found for table ${tableName}`)
        return { success: false, name: tableName, error: 'No schema definition available' }
      }

      const { success: created, error: createError } = await executeSQLOnStaging(createSQL, staging)
      if (!created) {
        console.error(`  Could not auto-create table. Please create manually in Supabase Dashboard.`)
        console.error(`  Error: ${createError}`)
        console.error(`  Required SQL:\n${createSQL}`)
        return { success: false, name: tableName, error: `Table must be created manually: ${createError}` }
      }

      console.log(`  Created table ${tableName} on staging`)

      const { error: retryError } = await staging.from(tableName).insert(rows)
      if (retryError) {
        console.error(`  Error inserting into staging after table creation: ${retryError.message}`)
        return { success: false, name: tableName, error: retryError.message }
      }

      console.log(`  Successfully synced ${rows.length} rows`)
      return { success: true, name: tableName, rowCount: rows.length }
    }
    console.error(`  Error inserting into staging: ${insertError.message}`)
    return { success: false, name: tableName, error: insertError.message }
  }

  console.log(`  Successfully synced ${rows.length} rows`)
  return { success: true, name: tableName, rowCount: rows.length }
}

async function syncBucket(
  bucketName: string,
  production: SupabaseClient,
  staging: SupabaseClient,
  stagingService: SupabaseClient
): Promise<SyncResult> {
  console.log(`\nSyncing bucket: ${bucketName}`)

  const { error: bucketError } = await staging.storage.getBucket(bucketName)
  if (bucketError) {
    console.log(`  Bucket ${bucketName} does not exist in staging, creating...`)
    const { error: createError } = await stagingService.storage.createBucket(bucketName, {
      public: true,
    })
    if (createError) {
      console.error(`  Error creating bucket: ${createError.message}`)
      return { success: false, name: bucketName, error: createError.message }
    }
    console.log(`  Created bucket ${bucketName} on staging`)
  }

  const { data: files, error: listError } = await production.storage.from(bucketName).list()

  if (listError) {
    console.error(`  Error listing files from production: ${listError.message}`)
    return { success: false, name: bucketName, error: listError.message }
  }

  console.log(`  Found ${files?.length ?? 0} files in production`)

  if (!files || files.length === 0) {
    console.log(`  No files to sync for ${bucketName}`)
    return { success: true, name: bucketName, fileCount: 0 }
  }

  const { data: existingFiles } = await staging.storage.from(bucketName).list()
  if (existingFiles && existingFiles.length > 0) {
    const filePaths = existingFiles.map((f) => f.name)
    await staging.storage.from(bucketName).remove(filePaths)
    console.log(`  Cleared ${filePaths.length} existing files from staging`)
  }

  let syncedCount = 0
  for (const file of files) {
    const { data: fileData, error: downloadError } = await production.storage
      .from(bucketName)
      .download(file.name)

    if (downloadError) {
      console.error(`  Error downloading ${file.name}: ${downloadError.message}`)
      continue
    }

    const { error: uploadError } = await staging.storage
      .from(bucketName)
      .upload(file.name, fileData, { upsert: true })

    if (uploadError) {
      console.error(`  Error uploading ${file.name}: ${uploadError.message}`)
      continue
    }

    syncedCount++
  }

  console.log(`  Successfully synced ${syncedCount}/${files.length} files`)
  return { success: true, name: bucketName, fileCount: syncedCount }
}

async function main(): Promise<void> {
  const requiredVars = [
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_URL_STAGING',
    'SUPABASE_KEY_STAGING',
    'SUPABASE_SERVICE_KEY_STAGING',
  ]
  const missingVars = requiredVars.filter((v) => !process.env[v])

  if (missingVars.length > 0) {
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`)
    process.exit(1)
  }

  console.log('Starting Supabase data sync...')
  console.log(`Excluded tables: ${EXCLUDED_TABLES.join(', ')}`)
  const startTime = Date.now()

  const production = getProductionSupabaseClient()
  const staging = getStagingSupabaseClient()
  const stagingService = getStagingServiceClient()

  const tableResults: SyncResult[] = []
  for (const table of TABLES_TO_SYNC) {
    const result = await syncTable(table, production, staging)
    tableResults.push(result)
  }

  const bucketResults: SyncResult[] = []
  for (const bucket of BUCKETS_TO_SYNC) {
    const result = await syncBucket(bucket, production, staging, stagingService)
    bucketResults.push(result)
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  const tableSuccesses = tableResults.filter((r) => r.success).length
  const tableFailures = tableResults.filter((r) => !r.success).length
  const bucketSuccesses = bucketResults.filter((r) => r.success).length
  const bucketFailures = bucketResults.filter((r) => !r.success).length

  console.log('\n--- Sync Summary ---')
  console.log(`Tables: ${tableSuccesses} successful, ${tableFailures} failed`)
  console.log(`Buckets: ${bucketSuccesses} successful, ${bucketFailures} failed`)
  console.log(`Duration: ${duration}s`)

  if (tableFailures > 0 || bucketFailures > 0) {
    console.log('\nFailed items:')
    tableResults.filter((r) => !r.success).forEach((r) => console.log(`  - ${r.name}: ${r.error}`))
    bucketResults.filter((r) => !r.success).forEach((r) => console.log(`  - ${r.name}: ${r.error}`))
    process.exit(1)
  }
}

main()
