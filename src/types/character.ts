export interface Character {
  id: string
  name: string
  category: string
}

export const CATEGORY_ORDER = ['R', 'S', 'P', 'I', 'M', 'N', 'A', 'B', 'C', 'D', 'T'] as const

export type CategoryKey = (typeof CATEGORY_ORDER)[number]

export type CharactersByCategory = Map<CategoryKey, Character[]>
