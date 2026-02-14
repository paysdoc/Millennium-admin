import { isTableNotFoundError } from './schema'

interface SupabaseError {
  message: string
  code?: string
  details?: string
  hint?: string
}

/**
 * Handle a Supabase query error by checking for table-not-found
 * and returning a fallback value, or throwing a descriptive error.
 */
export const handleSupabaseQueryError = <T>(
  error: SupabaseError,
  context: string,
  fallback: T
): T => {
  if (isTableNotFoundError(error)) {
    console.warn(`${context} table does not exist in database. Returning fallback.`)
    return fallback
  }
  throw new Error(`Failed to ${context}: ${error.message}`)
}

/**
 * Wrap a database call with standardized error re-throwing.
 * Catches errors and re-throws with a consistent message format,
 * while preserving already-formatted error messages.
 */
export const wrapDatabaseCall = async <T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> => {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Failed to')) {
      throw err
    }
    if (err instanceof Error && err.message === 'Character not found') {
      throw err
    }
    throw new Error(
      `Failed to ${context}: ${err instanceof Error ? err.message : 'Unknown error'}`
    )
  }
}
