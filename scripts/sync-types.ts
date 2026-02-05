/**
 * TypeScript interfaces for Supabase data sync operations.
 */

/**
 * Rules for anonymizing specific field types.
 */
export type AnonymizationRule = 'name' | 'text' | 'none'

/**
 * Configuration for a single table to sync.
 */
export interface TableConfig {
  readonly name: string
  readonly piiFields: ReadonlyMap<string, AnonymizationRule>
}

/**
 * Global configuration for the sync operation.
 */
export interface SyncConfig {
  readonly tablesToSync: readonly TableConfig[]
  readonly excludedTables: readonly string[]
}

/**
 * Result of syncing a single table.
 */
export interface TableSyncResult {
  readonly tableName: string
  readonly rowsProcessed: number
  readonly success: boolean
  readonly error?: string
}

/**
 * Overall result of the sync operation.
 */
export interface SyncResult {
  readonly success: boolean
  readonly tablesProcessed: readonly TableSyncResult[]
  readonly startTime: Date
  readonly endTime: Date
  readonly error?: string
}

/**
 * Environment configuration for Supabase connections.
 */
export interface SyncEnvironment {
  readonly productionUrl: string
  readonly productionKey: string
  readonly stagingUrl: string
  readonly stagingKey: string
}
