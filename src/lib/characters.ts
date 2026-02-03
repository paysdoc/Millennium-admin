import { getSupabaseClient } from './supabase'
import { isTableNotFoundError } from './schema'
import {
  Character,
  CategoryKey,
  CharactersByCategory,
  CATEGORY_ORDER,
} from '@/types/character'

export async function fetchAllCharacters(): Promise<Character[]> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('characters')
      .select('id, name, category')

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Characters table does not exist in database. Returning empty list.'
        )
        return []
      }
      throw new Error(`Failed to fetch characters: ${error.message}`)
    }

    return data || []
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to fetch')) {
      throw err
    }
    throw new Error(
      `Failed to fetch characters: ${err instanceof Error ? err.message : 'Unknown error'}`
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
