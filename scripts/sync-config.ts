/**
 * Configuration for Supabase data synchronization.
 * Defines which tables to sync and how to anonymize PII fields.
 */

import type {
  SyncConfig,
  TableConfig,
  BucketConfig,
  AnonymizationRule,
} from './sync-types'

/**
 * Creates a TableConfig with PII field mappings.
 */
const createTableConfig = (
  name: string,
  piiFieldEntries: ReadonlyArray<readonly [string, AnonymizationRule]>
): TableConfig => ({
  name,
  piiFields: new Map(piiFieldEntries),
})

/**
 * Creates a BucketConfig for storage bucket sync.
 */
const createBucketConfig = (name: string, syncContent: boolean): BucketConfig => ({
  name,
  syncContent,
})

/**
 * Character table configuration.
 * Contains historical public data - no PII anonymization needed.
 */
const characterTable = createTableConfig('character', [])

/**
 * Connection table configuration.
 * Contains historical public data - no PII anonymization needed.
 */
const connectionTable = createTableConfig('connection', [])

/**
 * Game players table configuration.
 * Contains game player relationship data - no PII anonymization needed.
 */
const gamePlayersTable = createTableConfig('game_players', [])

/**
 * Games table configuration.
 * Contains game data - no PII anonymization needed.
 */
const gamesTable = createTableConfig('games', [])

/**
 * Profiles table configuration.
 * Contains user profile data - requires PII anonymization.
 */
const profilesTable = createTableConfig('profiles', [
  ['username', 'name'],
  ['display_name', 'name'],
  ['full_name', 'name'],
  ['bio', 'text'],
])

/**
 * Character images bucket configuration.
 * Contains public historical character portraits - no anonymization needed.
 */
const characterImagesBucket = createBucketConfig('character images', true)

/**
 * Main sync configuration.
 *
 * - tablesToSync: Tables that will be copied from production to staging
 * - excludedTables: Tables explicitly excluded from sync (e.g., users for privacy)
 */
export const syncConfig: SyncConfig = {
  tablesToSync: [
    characterTable,
    connectionTable,
    gamePlayersTable,
    gamesTable,
    profilesTable,
  ],
  excludedTables: ['users'],
  bucketsToSync: [characterImagesBucket],
}

/**
 * Validates that a table is allowed to be synced.
 * Returns false if the table is in the excluded list.
 */
export const isTableAllowed = (tableName: string): boolean =>
  !syncConfig.excludedTables.includes(tableName)

/**
 * Gets the configuration for a specific table.
 * Returns undefined if the table is not configured for sync.
 */
export const getTableConfig = (tableName: string): TableConfig | undefined =>
  syncConfig.tablesToSync.find((t) => t.name === tableName)

/**
 * Gets the configuration for a specific bucket.
 * Returns undefined if the bucket is not configured for sync.
 */
export const getBucketConfig = (bucketName: string): BucketConfig | undefined =>
  syncConfig.bucketsToSync.find((b) => b.name === bucketName)
