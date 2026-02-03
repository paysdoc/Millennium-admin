import { getSupabaseClient } from './supabase'

export interface TableInfo {
  table_name: string
}

export interface ColumnInfo {
  column_name: string
  data_type: string
  is_nullable: string
}

/**
 * Fetch list of tables in the public schema.
 * Note: This may not work directly via PostgREST as information_schema
 * is typically not exposed. Returns empty array on failure.
 */
export async function fetchTableList(): Promise<string[]> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_public_tables')

    if (error) {
      console.warn('Failed to fetch table list via RPC:', error.message)
      return []
    }

    return (data as TableInfo[])?.map((t) => t.table_name) || []
  } catch {
    console.warn('Table list query not available')
    return []
  }
}

/**
 * Fetch columns for a specific table.
 * Note: This may not work directly via PostgREST. Returns empty array on failure.
 */
export async function fetchTableColumns(
  tableName: string
): Promise<ColumnInfo[]> {
  try {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.rpc('get_table_columns', {
      p_table_name: tableName,
    })

    if (error) {
      console.warn(
        `Failed to fetch columns for ${tableName} via RPC:`,
        error.message
      )
      return []
    }

    return (data as ColumnInfo[]) || []
  } catch {
    console.warn(`Column query for ${tableName} not available`)
    return []
  }
}

/**
 * Check if a specific table exists in the database.
 * Uses a pragmatic approach: attempts a simple query and checks for table-not-found errors.
 */
export async function tableExists(tableName: string): Promise<boolean> {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from(tableName).select('*').limit(0)

    if (error) {
      if (
        error.message.includes('Could not find the table') ||
        (error.message.includes('relation') &&
          error.message.includes('does not exist'))
      ) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

/**
 * Check if an error indicates a table was not found.
 */
export function isTableNotFoundError(error: { message: string }): boolean {
  return (
    error.message.includes('Could not find the table') ||
    (error.message.includes('relation') &&
      error.message.includes('does not exist'))
  )
}
