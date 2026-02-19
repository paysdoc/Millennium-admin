import { getSupabaseClient } from './supabase'
import { isTableNotFoundError } from './schema'
import { handleDatabaseError } from './errors'
import { CategoryKey, CategoryName } from '@/types/character'

/**
 * Fetch all category names from the `category_name` table.
 * Returns a Map of category key to display name.
 * Returns an empty map if the table does not exist.
 */
export async function fetchCategoryNames(): Promise<Map<CategoryKey, string>> {
  const supabase = getSupabaseClient()

  try {
    const { data, error } = await supabase
      .from('category_name')
      .select('key, name')

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'category_name table does not exist in database. Returning empty map.'
        )
        return new Map()
      }
      throw new Error(`Failed to fetch category names: ${error.message}`)
    }

    const categoryNames = new Map<CategoryKey, string>()
    for (const row of (data as Pick<CategoryName, 'key' | 'name'>[]) || []) {
      categoryNames.set(row.key, row.name)
    }
    return categoryNames
  } catch (err) {
    handleDatabaseError(err, 'fetch category names')
  }
}

/**
 * Get the display name for a category key.
 * Falls back to "Category {key}" if the key is not found in the map.
 */
export function getCategoryDisplayName(
  key: CategoryKey,
  categoryNames: Map<CategoryKey, string>
): string {
  return categoryNames.get(key) ?? `Category ${key}`
}
