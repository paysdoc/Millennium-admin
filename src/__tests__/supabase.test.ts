import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isBucketAlreadyExistsError,
  isBucketNotFoundError,
  isTableNotFoundError,
} from '../lib/schema'

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

describe('isBucketNotFoundError', () => {
  it('returns true for bucket not found error', () => {
    const error = { message: 'Bucket not found' }
    expect(isBucketNotFoundError(error)).toBe(true)
  })

  it('returns true for resource not found error', () => {
    const error = { message: 'The resource was not found' }
    expect(isBucketNotFoundError(error)).toBe(true)
  })

  it('returns false for permission denied error', () => {
    const error = { message: 'permission denied for bucket' }
    expect(isBucketNotFoundError(error)).toBe(false)
  })

  it('returns false for already exists error', () => {
    const error = { message: 'The resource already exists' }
    expect(isBucketNotFoundError(error)).toBe(false)
  })

  it('returns false for generic error', () => {
    const error = { message: 'Something went wrong' }
    expect(isBucketNotFoundError(error)).toBe(false)
  })
})

describe('isBucketAlreadyExistsError', () => {
  it('returns true for already exists error', () => {
    const error = { message: 'The resource already exists' }
    expect(isBucketAlreadyExistsError(error)).toBe(true)
  })

  it('returns true for bucket already exists error', () => {
    const error = { message: 'Bucket already exists' }
    expect(isBucketAlreadyExistsError(error)).toBe(true)
  })

  it('returns false for bucket not found error', () => {
    const error = { message: 'Bucket not found' }
    expect(isBucketAlreadyExistsError(error)).toBe(false)
  })

  it('returns false for permission denied error', () => {
    const error = { message: 'permission denied for bucket' }
    expect(isBucketAlreadyExistsError(error)).toBe(false)
  })

  it('returns false for generic error', () => {
    const error = { message: 'Something went wrong' }
    expect(isBucketAlreadyExistsError(error)).toBe(false)
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
