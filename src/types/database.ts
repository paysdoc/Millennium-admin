/**
 * Central database types file that consolidates all table models.
 * Re-exports types for convenient imports.
 */

export type {
  Character,
  CharacterRow,
  CategoryKey,
  CategoryName,
  CharactersByCategory,
} from './character'

export { CATEGORY_ORDER, mapCharacterRowToCharacter } from './character'

export type { Connection } from './connection'
