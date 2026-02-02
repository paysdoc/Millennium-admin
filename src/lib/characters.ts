import { supabase } from './supabase'
import {
  Character,
  CategoryKey,
  CharactersByCategory,
  CATEGORY_ORDER,
} from '@/types/character'

export async function fetchAllCharacters(): Promise<Character[]> {
  const { data, error } = await supabase
    .from('characters')
    .select('id, name, category')

  if (error) {
    throw new Error(`Failed to fetch characters: ${error.message}`)
  }

  return data || []
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
