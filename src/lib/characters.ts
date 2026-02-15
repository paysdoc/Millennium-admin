import { getSupabaseClient, getSupabaseServiceClient, getSupabaseStorageUrl } from './supabase'
import { isTableNotFoundError } from './schema'
import { handleDatabaseError } from './errors'
import {
  Character,
  CharacterRow,
  CategoryKey,
  CharactersByCategory,
  CATEGORY_ORDER,
  mapCharacterRowToCharacter,
} from '@/types/character'

/**
 * Fetch all characters from the `character` table.
 * Maps database rows to the application Character interface.
 */
export async function fetchAllCharacters(): Promise<Character[]> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('character')
      .select(
        'id, name, first_names, birth_date, death_date, biography, type, link, image_link'
      )

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Character table does not exist in database. Returning empty list.'
        )
        return []
      }
      throw new Error(`Failed to fetch characters: ${error.message}`)
    }

    // Map database rows to application Character interface
    return (data as CharacterRow[] || []).map(mapCharacterRowToCharacter).map(
      (character) => ({ ...character, image_link: getSupabaseStorageUrl(character.image_link) })
    )
  } catch (err) {
    handleDatabaseError(err, 'fetch characters')
  }
}

/**
 * Fetch a single character by ID from the `character` table.
 * Returns null if the character is not found.
 */
export async function fetchCharacterById(id: string): Promise<Character | null> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('character')
      .select(
        'id, name, first_names, birth_date, death_date, biography, type, link, image_link'
      )
      .eq('id', id)
      .single()

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Character table does not exist in database. Returning null.'
        )
        return null
      }
      if (error.code === 'PGRST116') {
        // No rows returned - character not found
        return null
      }
      throw new Error(`Failed to fetch character: ${error.message}`)
    }

    if (!data) {
      return null
    }

    const character = mapCharacterRowToCharacter(data as CharacterRow)
    return { ...character, image_link: getSupabaseStorageUrl(character.image_link) }
  } catch (err) {
    handleDatabaseError(err, 'fetch character')
  }
}

/**
 * Update a character in the database.
 * Accepts a partial Character object and updates the corresponding fields.
 * Maps application `category` back to database `type` column.
 */
export async function updateCharacter(
  id: string,
  data: Partial<Omit<Character, 'id'>>
): Promise<Character> {
  const supabase = getSupabaseServiceClient()

  // Map application fields to database fields
  const updateData: Partial<CharacterRow> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.first_names !== undefined) updateData.first_names = data.first_names
  if (data.birth_date !== undefined) updateData.birth_date = data.birth_date
  if (data.death_date !== undefined) updateData.death_date = data.death_date
  if (data.biography !== undefined) updateData.biography = data.biography
  if (data.category !== undefined) updateData.type = data.category
  if (data.link !== undefined) updateData.link = data.link
  if (data.image_link !== undefined) updateData.image_link = data.image_link

  try {
    const { data: updatedData, error } = await supabase
      .from('character')
      .update(updateData)
      .eq('id', id)
      .select(
        'id, name, first_names, birth_date, death_date, biography, type, link, image_link'
      )
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        console.error('Supabase update returned no rows (PGRST116):', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          characterId: id,
        })
        throw new Error('Character not found')
      }
      console.error('Supabase update error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        characterId: id,
      })
      throw new Error(`Failed to update character: ${error.message}`)
    }

    if (!updatedData) {
      throw new Error('Character not found')
    }

    return mapCharacterRowToCharacter(updatedData as CharacterRow)
  } catch (err) {
    handleDatabaseError(err, 'update character')
  }
}

export function groupCharactersByCategory(
  characters: Character[]
): CharactersByCategory {
  return CATEGORY_ORDER.reduce((grouped, category) => {
    const categoryCharacters = characters
      .filter((char) => char.category === category)
      .sort((a, b) => a.name.localeCompare(b.name))

    if (categoryCharacters.length > 0) {
      grouped.set(category, categoryCharacters)
    }

    return grouped
  }, new Map<CategoryKey, Character[]>())
}
