import { unstable_noStore as noStore } from 'next/cache'
import { getSupabaseClient } from './supabase'
import { isTableNotFoundError } from './schema'
import { handleDatabaseError } from './errors'
import { Connection } from '@/types/connection'

/**
 * Fetch all connections from the `connection` table.
 */
export async function fetchAllConnections(): Promise<Connection[]> {
  noStore()
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('connection')
      .select('id, char1_id, char2_id, value, why, why_short, active')

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Connection table does not exist in database. Returning empty list.'
        )
        return []
      }
      throw new Error(`Failed to fetch connections: ${error.message}`)
    }

    return (data as Connection[]) || []
  } catch (err) {
    handleDatabaseError(err, 'fetch connections')
  }
}

/**
 * Fetch connections for a specific character.
 * Returns connections where the character is either char1 or char2.
 */
export async function fetchConnectionsByCharacter(
  characterId: string
): Promise<Connection[]> {
  noStore()
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('connection')
      .select('id, char1_id, char2_id, value, why, why_short, active')
      .or(`char1_id.eq.${characterId},char2_id.eq.${characterId}`)

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Connection table does not exist in database. Returning empty list.'
        )
        return []
      }
      throw new Error(`Failed to fetch connections: ${error.message}`)
    }

    return (data as Connection[]) || []
  } catch (err) {
    handleDatabaseError(err, 'fetch connections')
  }
}
