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

describe('Supabase client factory', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getStagingSupabaseClient', () => {
    it('throws error when SUPABASE_URL_STAGING is missing', async () => {
      process.env.SUPABASE_KEY_STAGING = 'test-key'
      delete process.env.SUPABASE_URL_STAGING

      const { getStagingSupabaseClient } = await import('../lib/supabase')
      expect(() => getStagingSupabaseClient()).toThrow(
        'Missing staging Supabase environment variables (SUPABASE_URL_STAGING, SUPABASE_KEY_STAGING)'
      )
    })

    it('throws error when SUPABASE_KEY_STAGING is missing', async () => {
      process.env.SUPABASE_URL_STAGING = 'https://test.supabase.co'
      delete process.env.SUPABASE_KEY_STAGING

      const { getStagingSupabaseClient } = await import('../lib/supabase')
      expect(() => getStagingSupabaseClient()).toThrow(
        'Missing staging Supabase environment variables (SUPABASE_URL_STAGING, SUPABASE_KEY_STAGING)'
      )
    })
  })

  describe('getProductionSupabaseClient', () => {
    it('throws error when SUPABASE_URL is missing', async () => {
      process.env.SUPABASE_KEY = 'test-key'
      delete process.env.SUPABASE_URL

      const { getProductionSupabaseClient } = await import('../lib/supabase')
      expect(() => getProductionSupabaseClient()).toThrow(
        'Missing production Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)'
      )
    })

    it('throws error when SUPABASE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_KEY

      const { getProductionSupabaseClient } = await import('../lib/supabase')
      expect(() => getProductionSupabaseClient()).toThrow(
        'Missing production Supabase environment variables (SUPABASE_URL, SUPABASE_KEY)'
      )
    })
  })

  describe('getStagingServiceClient', () => {
    it('throws error when SUPABASE_URL_STAGING is missing', async () => {
      process.env.SUPABASE_SERVICE_KEY_STAGING = 'test-service-key'
      delete process.env.SUPABASE_URL_STAGING

      const { getStagingServiceClient } = await import('../lib/supabase')
      expect(() => getStagingServiceClient()).toThrow(
        'Missing staging service Supabase environment variables (SUPABASE_URL_STAGING, SUPABASE_SERVICE_KEY_STAGING)'
      )
    })

    it('throws error when SUPABASE_SERVICE_KEY_STAGING is missing', async () => {
      process.env.SUPABASE_URL_STAGING = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_KEY_STAGING

      const { getStagingServiceClient } = await import('../lib/supabase')
      expect(() => getStagingServiceClient()).toThrow(
        'Missing staging service Supabase environment variables (SUPABASE_URL_STAGING, SUPABASE_SERVICE_KEY_STAGING)'
      )
    })
  })

  describe('getProductionServiceClient', () => {
    it('throws error when SUPABASE_URL is missing', async () => {
      process.env.SUPABASE_SERVICE_KEY = 'test-service-key'
      delete process.env.SUPABASE_URL

      const { getProductionServiceClient } = await import('../lib/supabase')
      expect(() => getProductionServiceClient()).toThrow(
        'Missing production service Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)'
      )
    })

    it('throws error when SUPABASE_SERVICE_KEY is missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_KEY

      const { getProductionServiceClient } = await import('../lib/supabase')
      expect(() => getProductionServiceClient()).toThrow(
        'Missing production service Supabase environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)'
      )
    })
  })
})
