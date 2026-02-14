import { getSupabaseStorageUrl } from './supabase'
import { Character, CharacterRow, mapCharacterRowToCharacter } from '@/types/character'

/**
 * Enrich a single character with a resolved image URL.
 */
export const enrichCharacterWithImageUrl = (character: Character): Character => ({
  ...character,
  image_link: getSupabaseStorageUrl(character.image_link),
})

/**
 * Map a database row to a Character and enrich with image URL.
 */
export const mapAndEnrichCharacter = (row: CharacterRow): Character =>
  enrichCharacterWithImageUrl(mapCharacterRowToCharacter(row))

/**
 * Map database rows to Characters and enrich all with image URLs.
 */
export const mapAndEnrichCharacterList = (rows: CharacterRow[]): Character[] =>
  rows.map(mapAndEnrichCharacter)
