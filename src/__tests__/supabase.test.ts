import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isTableNotFoundError } from '../lib/schema'

describe('isTableNotFoundError', () => {
  it('returns true for schema cache error', () => {
    const error = { message: "Could not find the table 'public.character' in the schema cache" }
    expect(isTableNotFoundError(error)).toBe(true)
  })

  it('returns true for relation does not exist error', () => {
    const error = { message: 'relation "public.character" does not exist' }
    expect(isTableNotFoundError(error)).toBe(true)
  })

  it('returns false for permission denied error', () => {
    const error = { message: 'permission denied for table character' }
    expect(isTableNotFoundError(error)).toBe(false)
  })

  it('returns false for constraint violation error', () => {
    const error = { message: 'duplicate key value violates unique constraint' }
    expect(isTableNotFoundError(error)).toBe(false)
  })

  it('returns false for generic error', () => {
    const error = { message: 'Something went wrong' }
    expect(isTableNotFoundError(error)).toBe(false)
  })
})

describe('getSupabaseClient', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('throws error when SUPABASE_URL is missing', async () => {
    process.env.SUPABASE_KEY = 'test-key'
    delete process.env.SUPABASE_URL

    const { getSupabaseClient } = await import('../lib/supabase')
    expect(() => getSupabaseClient()).toThrow(
      'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)'
    )
  })

  it('throws error when SUPABASE_KEY is missing', async () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    delete process.env.SUPABASE_KEY

    const { getSupabaseClient } = await import('../lib/supabase')
    expect(() => getSupabaseClient()).toThrow(
      'Missing Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)'
    )
  })
})
