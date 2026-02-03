/**
 * Schema utilities for database operations.
 *
 * NOTE: This application now uses static TypeScript models instead of dynamic
 * schema discovery. See src/types/character.ts and src/types/connection.ts
 * for the static data models.
 *
 * The utility functions below are retained for error handling purposes.
 */

/**
 * Check if an error indicates a table was not found.
 * Used for graceful error handling when tables don't exist.
 */
export function isTableNotFoundError(error: { message: string }): boolean {
  return (
    error.message.includes('Could not find the table') ||
    (error.message.includes('relation') &&
      error.message.includes('does not exist'))
  )
}
