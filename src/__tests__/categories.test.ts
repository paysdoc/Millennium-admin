import { describe, it, expect } from 'vitest'
import { buildCategoryNameMap } from '../lib/categories'
import { mapCategoryNameRowToCategoryName } from '../types/categoryName'
import type { CategoryName, CategoryNameRow } from '../types/categoryName'

describe('buildCategoryNameMap', () => {
  it('returns a Map mapping codes to names from input array', () => {
    const input: CategoryName[] = [
      { code: 'R', name: 'Royalty' },
      { code: 'S', name: 'Statesmen' },
      { code: 'P', name: 'Philosophers' },
    ]

    const result = buildCategoryNameMap(input)

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(3)
    expect(result.get('R')).toBe('Royalty')
    expect(result.get('S')).toBe('Statesmen')
    expect(result.get('P')).toBe('Philosophers')
  })

  it('returns an empty Map for an empty input array', () => {
    const result = buildCategoryNameMap([])

    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it('handles duplicate codes by keeping the last one', () => {
    const input: CategoryName[] = [
      { code: 'R', name: 'Royalty' },
      { code: 'R', name: 'Rulers' },
    ]

    const result = buildCategoryNameMap(input)

    expect(result.size).toBe(1)
    expect(result.get('R')).toBe('Rulers')
  })
})

describe('mapCategoryNameRowToCategoryName', () => {
  it('maps database row to application interface', () => {
    const row: CategoryNameRow = {
      code: 'R',
      name: 'Royalty',
      created_at: '2026-02-24T10:00:00.000Z',
      updated_at: '2026-02-24T10:00:00.000Z',
    }

    const result = mapCategoryNameRowToCategoryName(row)

    expect(result).toEqual({ code: 'R', name: 'Royalty' })
  })

  it('strips timestamp fields from the result', () => {
    const row: CategoryNameRow = {
      code: 'T',
      name: 'Towns',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    }

    const result = mapCategoryNameRowToCategoryName(row)

    expect(result).not.toHaveProperty('created_at')
    expect(result).not.toHaveProperty('updated_at')
  })
})
