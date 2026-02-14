import { getSupabaseClient } from './supabase'
import { handleSupabaseQueryError, wrapDatabaseCall } from './dbErrorHandler'
import { Connection } from '@/types/connection'

const CONNECTION_FIELDS = 'id, char1_id, char2_id, value, why, why_short, active'

/**
 * Fetch all connections from the `connection` table.
 */
export const fetchAllConnections = (): Promise<Connection[]> =>
  wrapDatabaseCall(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('connection')
      .select(CONNECTION_FIELDS)

    if (error) {
      return handleSupabaseQueryError(error, 'fetch connections', [] as Connection[])
    }

    return (data as Connection[]) || []
  }, 'fetch connections')

/**
 * Fetch connections for a specific character.
 */
export const fetchConnectionsByCharacter = (characterId: string): Promise<Connection[]> =>
  wrapDatabaseCall(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('connection')
      .select(CONNECTION_FIELDS)
      .or(`char1_id.eq.${characterId},char2_id.eq.${characterId}`)

    if (error) {
      return handleSupabaseQueryError(error, 'fetch connections', [] as Connection[])
    }

    return (data as Connection[]) || []
  }, 'fetch connections')
