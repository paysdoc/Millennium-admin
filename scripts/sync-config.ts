/**
 * Configuration for Supabase data synchronization.
 * Defines which tables to sync and how to anonymize PII fields.
 */

import type { SyncConfig, TableConfig, AnonymizationRule } from './sync-types'

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
 * Character table configuration.
 * PII fields: first_names (personal names), biography (may contain personal info)
 */
const characterTable = createTableConfig('character', [
  ['first_names', 'name'],
  ['biography', 'text'],
])

/**
 * Connection table configuration.
 * PII fields: why and why_short may contain personal information about relationships
 */
const connectionTable = createTableConfig('connection', [
  ['why', 'text'],
  ['why_short', 'text'],
])

/**
 * Main sync configuration.
 *
 * - tablesToSync: Tables that will be copied from production to staging
 * - excludedTables: Tables explicitly excluded from sync (e.g., users for privacy)
 */
export const syncConfig: SyncConfig = {
  tablesToSync: [characterTable, connectionTable],
  excludedTables: ['users'],
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
