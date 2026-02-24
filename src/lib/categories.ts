import { getSupabaseServiceClient } from './supabase'
import { isTableNotFoundError } from './schema'
import { handleDatabaseError } from './errors'
import {
  CategoryName,
  CategoryNameRow,
  CategoryNameMap,
  mapCategoryNameRowToCategoryName,
} from '@/types/categoryName'

/**
 * Fetch all category names from the `category_name` table.
 * Maps database rows to the application CategoryName interface.
 */
export async function fetchAllCategoryNames(): Promise<CategoryName[]> {
  const supabase = getSupabaseServiceClient()

  try {
    const { data, error } = await supabase
      .from('category_name')
      .select('code, name, created_at, updated_at')

    if (error) {
      if (isTableNotFoundError(error)) {
        console.warn(
          'Category name table does not exist in database. Returning empty list.'
        )
        return []
      }
      throw new Error(`Failed to fetch category names: ${error.message}`)
    }

    return (data as CategoryNameRow[] || []).map(mapCategoryNameRowToCategoryName)
  } catch (err) {
    handleDatabaseError(err, 'fetch category names')
  }
}

/**
 * Build a map from category code to full category name.
 * Pure function with no side effects.
 */
export function buildCategoryNameMap(categoryNames: CategoryName[]): CategoryNameMap {
  return new Map(categoryNames.map((cn) => [cn.code, cn.name]))
}
