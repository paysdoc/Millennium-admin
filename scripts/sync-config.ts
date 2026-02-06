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
  piiFieldEntries: ReadonlyArray<readonly [string, AnonymizationRule]>,
  generatedColumns: readonly string[] = []
): TableConfig => ({
  name,
  piiFields: new Map(piiFieldEntries),
  generatedColumns,
})

/**
 * Creates a BucketConfig for storage bucket sync.
 */
const createBucketConfig = (name: string, syncContent: boolean): BucketConfig => ({
  name,
  syncContent,
})

/**
 * Profiles table configuration.
 * Contains user profile data - requires PII anonymization.
 */
const profilesTable = createTableConfig(
  'profiles',
  [
    ['username', 'name'],
    ['display_name', 'name'],
    ['full_name', 'name'],
    ['bio', 'text'],
    ['email', 'email'],
  ],
  ['created_at', 'updated_at']
)

/**
 * Character table configuration.
 * Contains historical public data - no PII anonymization needed.
 */
const characterTable = createTableConfig('character', [])

/**
 * Games table configuration.
 * Contains game data - no PII anonymization needed.
 */
const gamesTable = createTableConfig('games', [], ['created_at'])

/**
 * Connection table configuration.
 * Contains historical public data - no PII anonymization needed.
 */
const connectionTable = createTableConfig('connection', [])

/**
 * Game players table configuration.
 * Contains game player relationship data - no PII anonymization needed.
 */
const gamePlayersTable = createTableConfig('game_players', [], ['created_at'])

/**
 * Character images bucket configuration.
 * Contains public historical character portraits - no anonymization needed.
 */
const characterImagesBucket = createBucketConfig('character_images', true)

/**
 * Main sync configuration.
 *
 * - tablesToSync: Tables that will be copied from production to staging
 * - excludedTables: Tables explicitly excluded from sync (e.g., users for privacy)
 *
 * IMPORTANT: tablesToSync is ordered by foreign key dependencies (parents first).
 * During sync, tables are cleared in REVERSE order (children first) and inserted
 * in FORWARD order (parents first) to avoid FK constraint violations.
 *
 * Dependency chain:
 *   profiles    ← games.created_by, game_players.player_id
 *   character   ← connection.char1_id, connection.char2_id
 *   games       ← game_players.game_id
 *
 * When adding new tables, place them after all their parent tables.
 */
export const syncConfig: SyncConfig = {
  tablesToSync: [
    profilesTable,
    characterTable,
    gamesTable,
    connectionTable,
    gamePlayersTable,
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
