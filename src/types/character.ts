/**
 * Raw database row from the `character` table.
 * This matches the actual SQL schema with the `type` column.
 */
export interface CharacterRow {
  id: string
  name: string
  first_names: string | null
  birth_date: string | null
  death_date: string | null
  biography: string | null
  type: string
  link: string | null
  image_link: string | null
}

/**
 * Application-level Character interface.
 * Maps database `type` column to `category` for compatibility with existing code.
 */
export interface Character {
  id: string
  name: string
  first_names: string | null
  birth_date: string | null
  death_date: string | null
  biography: string | null
  category: string // Mapped from database `type` column
  link: string | null
  image_link: string | null
}

export const CATEGORY_ORDER = ['R', 'S', 'P', 'I', 'M', 'N', 'A', 'B', 'C', 'D', 'T'] as const

export type CategoryKey = (typeof CATEGORY_ORDER)[number]

export type CharactersByCategory = Map<CategoryKey, Character[]>

/**
 * Convert a database row to the application Character interface.
 * Maps `type` to `category`.
 */
export function mapCharacterRowToCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    first_names: row.first_names,
    birth_date: row.birth_date,
    death_date: row.death_date,
    biography: row.biography,
    category: row.type,
    link: row.link,
    image_link: row.image_link,
  }
}
