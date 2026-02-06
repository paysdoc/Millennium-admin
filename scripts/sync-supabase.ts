#!/usr/bin/env tsx
/**
 * Supabase data sync script.
 * Copies production data to staging with PII anonymization.
 */

import 'dotenv/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import { syncConfig, isTableAllowed, getTableConfig } from './sync-config'
import type {
  SyncEnvironment,
  SyncResult,
  TableSyncResult,
  BucketSyncResult,
  AnonymizationRule,
  TableConfig,
  BucketConfig,
} from './sync-types'

// Constants for anonymization
const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Parker', 'Sage', 'Drew', 'Robin', 'Charlie', 'Finley', 'Emerson', 'Rowan',
] as const

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
] as const

const EMAIL_DOMAINS = [
  'example.com', 'test.com', 'staging.local', 'demo.org', 'sample.net',
] as const

/**
 * Creates a deterministic hash from input string.
 * Same input always produces same output for referential integrity.
 */
export const hashString = (input: string): number => {
  const hash = createHash('sha256').update(input).digest('hex')
  return parseInt(hash.substring(0, 8), 16)
}

/**
 * Anonymizes a name using deterministic hash-based selection.
 * Same name always maps to same fake name.
 */
export const anonymizeName = (name: string | null): string | null => {
  if (name === null || name.trim() === '') {
    return name
  }
  const hash = hashString(name)
  const firstName = FIRST_NAMES[hash % FIRST_NAMES.length]
  const lastName = LAST_NAMES[(hash >> 8) % LAST_NAMES.length]
  return `${firstName} ${lastName}`
}

/**
 * Anonymizes text content using deterministic replacement.
 * Preserves null values and empty strings.
 */
export const anonymizeText = (text: string | null): string | null => {
  if (text === null || text.trim() === '') {
    return text
  }
  const hash = hashString(text)
  const wordCount = Math.max(3, (hash % 10) + 5)
  const words = Array.from({ length: wordCount }, (_, i) => {
    const wordHash = hashString(`${text}-${i}`)
    return FIRST_NAMES[wordHash % FIRST_NAMES.length].toLowerCase()
  })
  return `[Anonymized: ${words.join(' ')}]`
}

/**
 * Anonymizes an email address using deterministic hash-based generation.
 * Preserves null values and empty strings.
 */
export const anonymizeEmail = (email: string | null): string | null => {
  if (email === null || email.trim() === '') {
    return email
  }
  const hash = hashString(email)
  const domain = EMAIL_DOMAINS[hash % EMAIL_DOMAINS.length]
  return `user${hash % 1000000}@${domain}`
}

/**
 * Anonymizes a field based on its anonymization rule.
 */
export const anonymizeField = (
  value: unknown,
  rule: AnonymizationRule
): unknown => {
  if (value === null || value === undefined) {
    return value
  }

  switch (rule) {
    case 'name':
      return typeof value === 'string' ? anonymizeName(value) : value
    case 'text':
      return typeof value === 'string' ? anonymizeText(value) : value
    case 'email':
      return typeof value === 'string' ? anonymizeEmail(value) : value
    case 'none':
      return value
    default:
      return value
  }
}

/**
 * Strips auto-generated columns from a record before inserting into staging.
 * Returns the record unchanged when the generated columns array is empty.
 */
export const stripGeneratedColumns = (
  record: Record<string, unknown>,
  generatedColumns: readonly string[]
): Record<string, unknown> => {
  if (generatedColumns.length === 0) {
    return record
  }

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !generatedColumns.includes(key))
  )
}

/**
 * Anonymizes a record based on table configuration.
 */
export const anonymizeRecord = (
  record: Record<string, unknown>,
  tableConfig: TableConfig
): Record<string, unknown> => {
  const anonymized: Record<string, unknown> = {}

  Object.entries(record).forEach(([key, value]) => {
    const rule = tableConfig.piiFields.get(key)
    anonymized[key] = rule ? anonymizeField(value, rule) : value
  })

  return anonymized
}

/**
 * Validates and returns environment configuration.
 */
const getEnvironment = (): SyncEnvironment => {
  const productionUrl = process.env.SUPABASE_URL
  const productionKey = process.env.SUPABASE_SERVICE_KEY
  const stagingUrl = process.env.SUPABASE_URL_STAGING
  const stagingKey = process.env.SUPABASE_SERVICE_KEY_STAGING

  const missing: string[] = []
  if (!productionUrl) missing.push('SUPABASE_URL')
  if (!productionKey) missing.push('SUPABASE_SERVICE_KEY')
  if (!stagingUrl) missing.push('SUPABASE_URL_STAGING')
  if (!stagingKey) missing.push('SUPABASE_SERVICE_KEY_STAGING')

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    )
  }

  return {
    productionUrl: productionUrl!,
    productionKey: productionKey!,
    stagingUrl: stagingUrl!,
    stagingKey: stagingKey!,
  }
}

/**
 * Creates Supabase client for production (read-only operations).
 */
const createProductionClient = (env: SyncEnvironment): SupabaseClient =>
  createClient(env.productionUrl, env.productionKey)

/**
 * Creates Supabase client for staging (write operations).
 */
const createStagingClient = (env: SyncEnvironment): SupabaseClient =>
  createClient(env.stagingUrl, env.stagingKey)

/**
 * Fetches all data from a production table with pagination.
 */
const fetchTableData = async (
  client: SupabaseClient,
  tableName: string
): Promise<Record<string, unknown>[]> => {
  const pageSize = 1000
  const allData: Record<string, unknown>[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client
      .from(tableName)
      .select('*')
      .range(offset, offset + pageSize - 1)

    if (error) {
      throw new Error(`Failed to fetch from ${tableName}: ${error.message}`)
    }

    if (data && data.length > 0) {
      allData.push(...data)
      offset += pageSize
      hasMore = data.length === pageSize
    } else {
      hasMore = false
    }
  }

  return allData
}

/**
 * Clears all data from a staging table.
 */
const clearStagingTable = async (
  client: SupabaseClient,
  tableName: string
): Promise<void> => {
  const { error } = await client.from(tableName).delete().neq('id', '')

  if (error) {
    throw new Error(`Failed to clear ${tableName}: ${error.message}`)
  }
}

/**
 * Inserts data into a staging table in batches.
 */
const insertStagingData = async (
  client: SupabaseClient,
  tableName: string,
  data: Record<string, unknown>[]
): Promise<void> => {
  if (data.length === 0) {
    return
  }

  const batchSize = 100
  const batches = Array.from(
    { length: Math.ceil(data.length / batchSize) },
    (_, i) => data.slice(i * batchSize, (i + 1) * batchSize)
  )

  for (const batch of batches) {
    const { error } = await client.from(tableName).insert(batch)

    if (error) {
      throw new Error(`Failed to insert into ${tableName}: ${error.message}`)
    }
  }
}

/**
 * Lists all files in a storage bucket with pagination.
 * Supabase Storage API returns max 1000 files per request.
 */
export const listBucketFiles = async (
  client: SupabaseClient,
  bucketName: string
): Promise<string[]> => {
  const pageSize = 1000
  const allFiles: string[] = []
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await client.storage
      .from(bucketName)
      .list('', { limit: pageSize, offset })

    if (error) {
      throw new Error(`Failed to list files in ${bucketName}: ${error.message}`)
    }

    if (data && data.length > 0) {
      const filePaths = data
        .filter((item) => item.name !== '.emptyFolderPlaceholder')
        .map((item) => item.name)
      allFiles.push(...filePaths)
      offset += pageSize
      hasMore = data.length === pageSize
    } else {
      hasMore = false
    }
  }

  return allFiles
}

/**
 * Downloads a file from a storage bucket.
 */
const downloadFile = async (
  client: SupabaseClient,
  bucketName: string,
  filePath: string
): Promise<Blob> => {
  const { data, error } = await client.storage.from(bucketName).download(filePath)

  if (error) {
    throw new Error(`Failed to download ${filePath}: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No data returned for ${filePath}`)
  }

  return data
}

/**
 * Uploads a file to a storage bucket.
 */
const uploadFile = async (
  client: SupabaseClient,
  bucketName: string,
  filePath: string,
  fileData: Blob
): Promise<void> => {
  const { error } = await client.storage
    .from(bucketName)
    .upload(filePath, fileData, { upsert: true })

  if (error) {
    throw new Error(`Failed to upload ${filePath}: ${error.message}`)
  }
}

/**
 * Clears all files from a storage bucket.
 * Deletes files in batches to avoid API limits.
 */
export const clearBucket = async (
  client: SupabaseClient,
  bucketName: string
): Promise<void> => {
  const files = await listBucketFiles(client, bucketName)

  if (files.length === 0) {
    return
  }

  const batchSize = 100
  const batches = Array.from(
    { length: Math.ceil(files.length / batchSize) },
    (_, i) => files.slice(i * batchSize, (i + 1) * batchSize)
  )

  for (const batch of batches) {
    const { error } = await client.storage.from(bucketName).remove(batch)

    if (error) {
      throw new Error(`Failed to clear files from ${bucketName}: ${error.message}`)
    }
  }
}

/**
 * Syncs a single storage bucket from production to staging.
 */
const syncBucket = async (
  productionClient: SupabaseClient,
  stagingClient: SupabaseClient,
  bucketConfig: BucketConfig
): Promise<BucketSyncResult> => {
  const { name: bucketName, syncContent } = bucketConfig

  if (!syncContent) {
    return {
      bucketName,
      filesProcessed: 0,
      success: true,
    }
  }

  try {
    console.log(`  Syncing bucket: ${bucketName}`)

    // List files from production
    const productionFiles = await listBucketFiles(productionClient, bucketName)
    console.log(`    Found ${productionFiles.length} files in production`)

    // Clear staging bucket
    await clearBucket(stagingClient, bucketName)
    console.log(`    Cleared staging bucket`)

    // Download and upload each file
    let successCount = 0
    let errorCount = 0

    for (const filePath of productionFiles) {
      try {
        const fileData = await downloadFile(productionClient, bucketName, filePath)
        await uploadFile(stagingClient, bucketName, filePath, fileData)
        successCount++
      } catch (fileError) {
        errorCount++
        const errorMessage =
          fileError instanceof Error ? fileError.message : 'Unknown error'
        console.error(`    Error syncing file ${filePath}: ${errorMessage}`)
      }
    }

    console.log(
      `    Synced ${successCount} files (${errorCount} errors) to staging`
    )

    const hasErrors = errorCount > 0
    return {
      bucketName,
      filesProcessed: successCount,
      success: !hasErrors,
      error: hasErrors ? `${errorCount} files failed to sync` : undefined,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`    Error syncing bucket ${bucketName}: ${errorMessage}`)
    return {
      bucketName,
      filesProcessed: 0,
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Clears all staging tables in reverse dependency order.
 * Children are cleared before parents to avoid FK constraint violations.
 */
const clearAllStagingTables = async (
  stagingClient: SupabaseClient,
  tables: readonly TableConfig[]
): Promise<void> => {
  const reversed = [...tables].reverse()

  console.log('\nPhase 1: Clearing staging tables (reverse dependency order)...')
  for (const tableConfig of reversed) {
    console.log(`  Clearing table: ${tableConfig.name}`)
    await clearStagingTable(stagingClient, tableConfig.name)
  }
}

/**
 * Syncs a single table from production to staging.
 * Fetches data, anonymizes PII fields, strips generated columns, and inserts.
 */
const syncTable = async (
  productionClient: SupabaseClient,
  stagingClient: SupabaseClient,
  tableConfig: TableConfig
): Promise<TableSyncResult> => {
  const { name: tableName } = tableConfig

  try {
    console.log(`  Syncing table: ${tableName}`)

    // Fetch production data
    const productionData = await fetchTableData(productionClient, tableName)
    console.log(`    Fetched ${productionData.length} rows from production`)

    // Anonymize PII fields
    const anonymizedData = productionData.map((record) =>
      anonymizeRecord(record, tableConfig)
    )

    // Strip auto-generated columns
    const strippedData = anonymizedData.map((record) =>
      stripGeneratedColumns(record, tableConfig.generatedColumns)
    )

    // Insert into staging
    await insertStagingData(stagingClient, tableName, strippedData)
    console.log(`    Inserted ${strippedData.length} rows into staging`)

    return {
      tableName,
      rowsProcessed: strippedData.length,
      success: true,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`    Error syncing ${tableName}: ${errorMessage}`)
    return {
      tableName,
      rowsProcessed: 0,
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Main sync orchestration function.
 */
const runSync = async (): Promise<SyncResult> => {
  const startTime = new Date()
  const tableResults: TableSyncResult[] = []
  const bucketResults: BucketSyncResult[] = []

  try {
    console.log('Starting Supabase data sync...')
    console.log(`Excluded tables: ${syncConfig.excludedTables.join(', ')}`)

    // Validate environment
    const env = getEnvironment()
    console.log('Environment validated')

    // Create clients
    const productionClient = createProductionClient(env)
    const stagingClient = createStagingClient(env)
    console.log('Supabase clients created')

    // Phase 1: Clear all staging tables in reverse dependency order
    const allowedTables = syncConfig.tablesToSync.filter((t) =>
      isTableAllowed(t.name)
    )
    await clearAllStagingTables(stagingClient, allowedTables)

    // Phase 2: Insert data in forward dependency order (parents first)
    console.log('\nPhase 2: Syncing tables (forward dependency order)...')
    for (const tableConfig of allowedTables) {
      const result = await syncTable(
        productionClient,
        stagingClient,
        tableConfig
      )
      tableResults.push(result)
    }

    // Sync each configured bucket
    console.log('\nSyncing storage buckets...')
    for (const bucketConfig of syncConfig.bucketsToSync) {
      const result = await syncBucket(
        productionClient,
        stagingClient,
        bucketConfig
      )
      bucketResults.push(result)
    }

    const endTime = new Date()
    const tablesSuccess = tableResults.every((r) => r.success)
    const bucketsSuccess = bucketResults.every((r) => r.success)
    const allSuccess = tablesSuccess && bucketsSuccess

    console.log('\nSync completed!')
    console.log(`  Tables processed: ${tableResults.length}`)
    console.log(`  Tables successful: ${tableResults.filter((r) => r.success).length}`)
    console.log(`  Tables failed: ${tableResults.filter((r) => !r.success).length}`)
    console.log(`  Buckets processed: ${bucketResults.length}`)
    console.log(`  Buckets successful: ${bucketResults.filter((r) => r.success).length}`)
    console.log(`  Buckets failed: ${bucketResults.filter((r) => !r.success).length}`)
    console.log(
      `  Duration: ${(endTime.getTime() - startTime.getTime()) / 1000}s`
    )

    return {
      success: allSuccess,
      tablesProcessed: tableResults,
      bucketsProcessed: bucketResults,
      startTime,
      endTime,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`\nSync failed: ${errorMessage}`)

    return {
      success: false,
      tablesProcessed: tableResults,
      bucketsProcessed: bucketResults,
      startTime,
      endTime: new Date(),
      error: errorMessage,
    }
  }
}

/**
 * Displays help information.
 */
const showHelp = (): void => {
  console.log(`
Supabase Data Sync Script

Usage: npx tsx scripts/sync-supabase.ts [options]

Options:
  --help, -h    Show this help message

Description:
  Syncs production Supabase data to staging environment with PII anonymization.

  Tables synced: ${syncConfig.tablesToSync.map((t) => t.name).join(', ')}
  Tables excluded: ${syncConfig.excludedTables.join(', ')}
  Buckets synced: ${syncConfig.bucketsToSync.map((b) => b.name).join(', ')}

Environment Variables Required:
  SUPABASE_URL              Production Supabase URL
  SUPABASE_SERVICE_KEY      Production service role key
  SUPABASE_URL_STAGING      Staging Supabase URL
  SUPABASE_SERVICE_KEY_STAGING  Staging service role key
`)
}

// CLI entry point
const main = async (): Promise<void> => {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    process.exit(0)
  }

  const result = await runSync()
  process.exit(result.success ? 0 : 1)
}

// Only run main when executed directly (not when imported by tests)
const isMainModule =
  typeof require !== 'undefined' &&
  require.main?.filename === __filename

if (isMainModule || process.argv[1]?.endsWith('sync-supabase.ts')) {
  main()
}
