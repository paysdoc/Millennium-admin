import { getSupabaseClient } from './supabase'
import { isTableNotFoundError } from './schema'
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
    return (data as CharacterRow[] || []).map(mapCharacterRowToCharacter)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to fetch')) {
      throw err
    }
    throw new Error(
      `Failed to fetch characters: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
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

    return mapCharacterRowToCharacter(data as CharacterRow)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to fetch')) {
      throw err
    }
    throw new Error(
      `Failed to fetch character: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}

export function groupCharactersByCategory(
  characters: Character[]
): CharactersByCategory {
  const grouped = new Map<CategoryKey, Character[]>()

  for (const category of CATEGORY_ORDER) {
    const categoryCharacters = characters
      .filter((char) => char.category === category)
      .sort((a, b) => a.name.localeCompare(b.name))

    if (categoryCharacters.length > 0) {
      grouped.set(category, categoryCharacters)
    }
  }

  return grouped
}
