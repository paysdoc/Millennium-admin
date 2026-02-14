import { Character, CategoryKey, CharactersByCategory, CATEGORY_ORDER } from '@/types/character'

/**
 * Get the sort index for a category. Unknown categories sort to the end.
 */
export const getCategoryIndex = (category: string): number => {
  const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number])
  return index === -1 ? CATEGORY_ORDER.length : index
}

/**
 * Compare two characters by category order, then alphabetically by name.
 */
export const compareByCategoryThenName = (a: Character, b: Character): number => {
  const indexDiff = getCategoryIndex(a.category) - getCategoryIndex(b.category)
  return indexDiff !== 0 ? indexDiff : a.name.localeCompare(b.name)
}

/**
 * Group characters by category using CATEGORY_ORDER.
 * Only includes categories that have at least one character.
 */
export const groupCharactersByCategory = (
  characters: Character[]
): CharactersByCategory =>
  CATEGORY_ORDER.reduce((grouped, category) => {
    const categoryCharacters = characters
      .filter((char) => char.category === category)
      .sort((a, b) => a.name.localeCompare(b.name))

    return categoryCharacters.length > 0
      ? grouped.set(category, categoryCharacters)
      : grouped
  }, new Map<CategoryKey, Character[]>())
