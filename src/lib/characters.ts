import { getSupabaseClient, getSupabaseServiceClient } from './supabase'
import { handleSupabaseQueryError, wrapDatabaseCall } from './dbErrorHandler'
import { mapAndEnrichCharacter, mapAndEnrichCharacterList } from './characterTransform'
import { Character, CharacterRow } from '@/types/character'

export { groupCharactersByCategory } from './categoryUtils'

const CHARACTER_FIELDS = 'id, name, first_names, birth_date, death_date, biography, type, link, image_link'

/**
 * Fetch all characters from the `character` table.
 */
export const fetchAllCharacters = (): Promise<Character[]> =>
  wrapDatabaseCall(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('character')
      .select(CHARACTER_FIELDS)

    if (error) {
      return handleSupabaseQueryError(error, 'fetch characters', [] as Character[])
    }

    return mapAndEnrichCharacterList((data as CharacterRow[]) || [])
  }, 'fetch characters')

/**
 * Fetch a single character by ID from the `character` table.
 */
export const fetchCharacterById = (id: string): Promise<Character | null> =>
  wrapDatabaseCall(async () => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('character')
      .select(CHARACTER_FIELDS)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      return handleSupabaseQueryError(error, 'fetch character', null)
    }

    return data ? mapAndEnrichCharacter(data as CharacterRow) : null
  }, 'fetch character')

/**
 * Update a character in the database.
 */
export const updateCharacter = (
  id: string,
  data: Partial<Omit<Character, 'id'>>
): Promise<Character> =>
  wrapDatabaseCall(async () => {
    const supabase = getSupabaseServiceClient()

    const updateData: Partial<CharacterRow> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.first_names !== undefined) updateData.first_names = data.first_names
    if (data.birth_date !== undefined) updateData.birth_date = data.birth_date
    if (data.death_date !== undefined) updateData.death_date = data.death_date
    if (data.biography !== undefined) updateData.biography = data.biography
    if (data.category !== undefined) updateData.type = data.category
    if (data.link !== undefined) updateData.link = data.link
    if (data.image_link !== undefined) updateData.image_link = data.image_link

    const { data: updatedData, error } = await supabase
      .from('character')
      .update(updateData)
      .eq('id', id)
      .select(CHARACTER_FIELDS)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        console.error('Supabase update returned no rows (PGRST116):', {
          code: error.code, message: error.message, details: error.details, hint: error.hint, characterId: id,
        })
        throw new Error('Character not found')
      }
      console.error('Supabase update error:', {
        code: error.code, message: error.message, details: error.details, characterId: id,
      })
      throw new Error(`Failed to update character: ${error.message}`)
    }

    if (!updatedData) throw new Error('Character not found')
    return mapAndEnrichCharacter(updatedData as CharacterRow)
  }, 'update character')
