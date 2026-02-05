import 'dotenv/config'
import { SupabaseClient } from '@supabase/supabase-js'
import { isTableNotFoundError } from './schema'
import { getProductionSupabaseClient, getStagingSupabaseClient } from './supabase'

const TABLES_TO_SYNC = ['character', 'connection', 'game_players', 'games', 'profiles'] as const
const EXCLUDED_TABLES = ['users'] as const
const BUCKETS_TO_SYNC = ['character images'] as const

interface SyncResult {
  success: boolean
  name: string
  rowCount?: number
  fileCount?: number
  error?: string
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

  const { error: clearError } = await staging.from(tableName).delete().neq('id', '')

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
      console.error(`  Table ${tableName} does not exist in staging - cannot insert data`)
      return { success: false, name: tableName, error: `Table does not exist in staging` }
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
  staging: SupabaseClient
): Promise<SyncResult> {
  console.log(`\nSyncing bucket: ${bucketName}`)

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
  const requiredVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_PROD_URL', 'SUPABASE_PROD_KEY']
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

  const tableResults: SyncResult[] = []
  for (const table of TABLES_TO_SYNC) {
    const result = await syncTable(table, production, staging)
    tableResults.push(result)
  }

  const bucketResults: SyncResult[] = []
  for (const bucket of BUCKETS_TO_SYNC) {
    const result = await syncBucket(bucket, production, staging)
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
