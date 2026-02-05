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
  AnonymizationRule,
  TableConfig,
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
    case 'none':
      return value
    default:
      return value
  }
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
 * Syncs a single table from production to staging.
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

    // Clear staging table
    await clearStagingTable(stagingClient, tableName)
    console.log(`    Cleared staging table`)

    // Insert anonymized data
    await insertStagingData(stagingClient, tableName, anonymizedData)
    console.log(`    Inserted ${anonymizedData.length} rows into staging`)

    return {
      tableName,
      rowsProcessed: anonymizedData.length,
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
  const results: TableSyncResult[] = []

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

    // Sync each configured table
    for (const tableConfig of syncConfig.tablesToSync) {
      if (!isTableAllowed(tableConfig.name)) {
        console.log(`  Skipping excluded table: ${tableConfig.name}`)
        continue
      }

      const result = await syncTable(
        productionClient,
        stagingClient,
        tableConfig
      )
      results.push(result)
    }

    const endTime = new Date()
    const allSuccess = results.every((r) => r.success)

    console.log('\nSync completed!')
    console.log(`  Tables processed: ${results.length}`)
    console.log(`  Successful: ${results.filter((r) => r.success).length}`)
    console.log(`  Failed: ${results.filter((r) => !r.success).length}`)
    console.log(
      `  Duration: ${(endTime.getTime() - startTime.getTime()) / 1000}s`
    )

    return {
      success: allSuccess,
      tablesProcessed: results,
      startTime,
      endTime,
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'
    console.error(`\nSync failed: ${errorMessage}`)

    return {
      success: false,
      tablesProcessed: results,
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
