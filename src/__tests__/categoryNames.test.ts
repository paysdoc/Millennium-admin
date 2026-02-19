import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CategoryKey } from '../types/character'

// Mock Supabase client
const mockSelect = vi.fn()
const mockFrom = vi.fn(() => ({ select: mockSelect }))
vi.mock('../lib/supabase', () => ({
  getSupabaseClient: () => ({ from: mockFrom }),
}))

describe('fetchCategoryNames', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a Map of category keys to names', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { key: 'R', name: 'Royalty' },
        { key: 'S', name: 'Statesmen' },
      ],
      error: null,
    })

    const { fetchCategoryNames } = await import('../lib/categoryNames')
    const result = await fetchCategoryNames()

    expect(result).toBeInstanceOf(Map)
    expect(result.get('R' as CategoryKey)).toBe('Royalty')
    expect(result.get('S' as CategoryKey)).toBe('Statesmen')
    expect(result.size).toBe(2)
  })

  it('returns empty map when table does not exist', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: "Could not find the table 'public.category_name' in the schema cache" },
    })

    const { fetchCategoryNames } = await import('../lib/categoryNames')
    const result = await fetchCategoryNames()

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('throws for non-table-not-found errors', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for table category_name' },
    })

    const { fetchCategoryNames } = await import('../lib/categoryNames')
    await expect(fetchCategoryNames()).rejects.toThrow('Failed to fetch category names')
  })
})

describe('getCategoryDisplayName', () => {
  it('returns the name from the map for known keys', async () => {
    const { getCategoryDisplayName } = await import('../lib/categoryNames')
    const categoryNames = new Map<CategoryKey, string>([
      ['R', 'Royalty'],
      ['S', 'Statesmen'],
    ])

    expect(getCategoryDisplayName('R', categoryNames)).toBe('Royalty')
    expect(getCategoryDisplayName('S', categoryNames)).toBe('Statesmen')
  })

  it('falls back to "Category {key}" for unknown keys', async () => {
    const { getCategoryDisplayName } = await import('../lib/categoryNames')
    const categoryNames = new Map<CategoryKey, string>()

    expect(getCategoryDisplayName('R', categoryNames)).toBe('Category R')
    expect(getCategoryDisplayName('T', categoryNames)).toBe('Category T')
  })
})
