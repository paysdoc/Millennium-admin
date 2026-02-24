/**
 * Raw database row from the `category_name` table.
 * This matches the actual SQL schema managed by Supabase migrations.
 */
export interface CategoryNameRow {
  code: string
  name: string
  created_at: string
  updated_at: string
}

/**
 * Application-level CategoryName interface.
 * Simplified from the database row for use in the application layer.
 */
export interface CategoryName {
  code: string
  name: string
}

/**
 * Maps code to full category name.
 */
export type CategoryNameMap = Map<string, string>

/**
 * Convert a database row to the application CategoryName interface.
 */
export function mapCategoryNameRowToCategoryName(row: CategoryNameRow): CategoryName {
  return {
    code: row.code,
    name: row.name,
  }
}
