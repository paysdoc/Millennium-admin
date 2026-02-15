/**
 * Shared error handling utilities for database operations.
 * Consolidates the repeated try-catch re-throw pattern from characters.ts and connections.ts.
 */

/**
 * Handles errors from database operations by re-throwing known errors
 * and wrapping unknown errors with a descriptive message.
 *
 * @param err - The caught error
 * @param operation - Description of the failed operation (e.g., "fetch characters")
 * @throws Always throws — either the original error or a wrapped one
 */
export function handleDatabaseError(err: unknown, operation: string): never {
  if (err instanceof Error && err.message.startsWith('Failed to')) {
    throw err
  }
  if (err instanceof Error && err.message === 'Character not found') {
    throw err
  }
  throw new Error(
    `Failed to ${operation}: ${err instanceof Error ? err.message : 'Unknown error'}`
  )
}
