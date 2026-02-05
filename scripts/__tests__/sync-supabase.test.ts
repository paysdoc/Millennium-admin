import { describe, it, expect, vi } from 'vitest'
import {
  hashString,
  anonymizeName,
  anonymizeText,
  anonymizeEmail,
  anonymizeField,
  anonymizeRecord,
  listBucketFiles,
  clearBucket,
} from '../sync-supabase'
import { syncConfig, isTableAllowed, getTableConfig, getBucketConfig } from '../sync-config'
import type { TableConfig, AnonymizationRule } from '../sync-types'

describe('hashString', () => {
  it('returns a number', () => {
    const result = hashString('test')

    expect(typeof result).toBe('number')
  })

  it('returns consistent hash for same input', () => {
    const input = 'consistent-input'

    const result1 = hashString(input)
    const result2 = hashString(input)

    expect(result1).toBe(result2)
  })

  it('returns different hashes for different inputs', () => {
    const result1 = hashString('input-one')
    const result2 = hashString('input-two')

    expect(result1).not.toBe(result2)
  })
})

describe('anonymizeName', () => {
  it('returns null for null input', () => {
    const result = anonymizeName(null)

    expect(result).toBeNull()
  })

  it('returns empty string for empty input', () => {
    const result = anonymizeName('')

    expect(result).toBe('')
  })

  it('returns whitespace-only string unchanged', () => {
    const result = anonymizeName('   ')

    expect(result).toBe('   ')
  })

  it('returns a fake name for valid input', () => {
    const result = anonymizeName('John Doe')

    expect(result).not.toBeNull()
    expect(result).not.toBe('John Doe')
    expect(result!.split(' ')).toHaveLength(2)
  })

  it('returns consistent fake name for same input', () => {
    const input = 'Jane Smith'

    const result1 = anonymizeName(input)
    const result2 = anonymizeName(input)

    expect(result1).toBe(result2)
  })

  it('returns different fake names for different inputs', () => {
    const result1 = anonymizeName('Alice Johnson')
    const result2 = anonymizeName('Bob Williams')

    expect(result1).not.toBe(result2)
  })
})

describe('anonymizeText', () => {
  it('returns null for null input', () => {
    const result = anonymizeText(null)

    expect(result).toBeNull()
  })

  it('returns empty string for empty input', () => {
    const result = anonymizeText('')

    expect(result).toBe('')
  })

  it('returns whitespace-only string unchanged', () => {
    const result = anonymizeText('   ')

    expect(result).toBe('   ')
  })

  it('returns anonymized text for valid input', () => {
    const result = anonymizeText('This is sensitive information.')

    expect(result).not.toBeNull()
    expect(result).not.toBe('This is sensitive information.')
    expect(result!.startsWith('[Anonymized:')).toBe(true)
  })

  it('returns consistent anonymized text for same input', () => {
    const input = 'Consistent text content'

    const result1 = anonymizeText(input)
    const result2 = anonymizeText(input)

    expect(result1).toBe(result2)
  })

  it('returns different anonymized text for different inputs', () => {
    const result1 = anonymizeText('Text one')
    const result2 = anonymizeText('Text two')

    expect(result1).not.toBe(result2)
  })
})

describe('anonymizeEmail', () => {
  it('returns null for null input', () => {
    const result = anonymizeEmail(null)

    expect(result).toBeNull()
  })

  it('returns empty string for empty input', () => {
    const result = anonymizeEmail('')

    expect(result).toBe('')
  })

  it('returns whitespace-only string unchanged', () => {
    const result = anonymizeEmail('   ')

    expect(result).toBe('   ')
  })

  it('returns a valid email format for valid input', () => {
    const result = anonymizeEmail('user@example.com')

    expect(result).not.toBeNull()
    expect(result).not.toBe('user@example.com')
    expect(result).toContain('@')
  })

  it('returns consistent fake email for same input', () => {
    const input = 'test@domain.com'

    const result1 = anonymizeEmail(input)
    const result2 = anonymizeEmail(input)

    expect(result1).toBe(result2)
  })

  it('returns different fake emails for different inputs', () => {
    const result1 = anonymizeEmail('alice@example.com')
    const result2 = anonymizeEmail('bob@example.com')

    expect(result1).not.toBe(result2)
  })

  it('generates email with expected format', () => {
    const result = anonymizeEmail('original@test.com')

    expect(result).toMatch(/^user\d+@[\w.]+$/)
  })
})

describe('anonymizeField', () => {
  it('returns null for null value regardless of rule', () => {
    expect(anonymizeField(null, 'name')).toBeNull()
    expect(anonymizeField(null, 'text')).toBeNull()
    expect(anonymizeField(null, 'email')).toBeNull()
    expect(anonymizeField(null, 'none')).toBeNull()
  })

  it('returns undefined for undefined value', () => {
    expect(anonymizeField(undefined, 'name')).toBeUndefined()
  })

  it('anonymizes name fields', () => {
    const result = anonymizeField('John Doe', 'name')

    expect(result).not.toBe('John Doe')
  })

  it('anonymizes text fields', () => {
    const result = anonymizeField('Some sensitive text', 'text')

    expect(result).not.toBe('Some sensitive text')
    expect(String(result).startsWith('[Anonymized:')).toBe(true)
  })

  it('anonymizes email fields', () => {
    const result = anonymizeField('user@example.com', 'email')

    expect(result).not.toBe('user@example.com')
    expect(String(result)).toContain('@')
  })

  it('returns non-string values unchanged for email rule', () => {
    const result = anonymizeField(123, 'email')

    expect(result).toBe(123)
  })

  it('returns value unchanged for none rule', () => {
    const result = anonymizeField('Unchanged value', 'none')

    expect(result).toBe('Unchanged value')
  })

  it('returns non-string values unchanged for name rule', () => {
    const result = anonymizeField(123, 'name')

    expect(result).toBe(123)
  })

  it('returns non-string values unchanged for text rule', () => {
    const result = anonymizeField(true, 'text')

    expect(result).toBe(true)
  })
})

describe('anonymizeRecord', () => {
  const mockTableConfig: TableConfig = {
    name: 'test_table',
    piiFields: new Map<string, AnonymizationRule>([
      ['name_field', 'name'],
      ['text_field', 'text'],
    ]),
  }

  it('anonymizes PII fields according to config', () => {
    const record = {
      id: '123',
      name_field: 'John Doe',
      text_field: 'Sensitive biography',
      other_field: 'Not PII',
    }

    const result = anonymizeRecord(record, mockTableConfig)

    expect(result.id).toBe('123')
    expect(result.name_field).not.toBe('John Doe')
    expect(result.text_field).not.toBe('Sensitive biography')
    expect(result.other_field).toBe('Not PII')
  })

  it('preserves non-PII fields unchanged', () => {
    const record = {
      id: 'abc-123',
      count: 42,
      active: true,
    }

    const result = anonymizeRecord(record, mockTableConfig)

    expect(result.id).toBe('abc-123')
    expect(result.count).toBe(42)
    expect(result.active).toBe(true)
  })

  it('handles null PII field values', () => {
    const record = {
      id: '123',
      name_field: null,
      text_field: null,
    }

    const result = anonymizeRecord(record, mockTableConfig)

    expect(result.name_field).toBeNull()
    expect(result.text_field).toBeNull()
  })

  it('copies all fields unchanged when table has no PII fields', () => {
    const noPiiConfig: TableConfig = {
      name: 'public_table',
      piiFields: new Map(),
    }
    const record = {
      id: '123',
      first_names: 'John Doe',
      biography: 'Some text content',
      other_field: 42,
    }

    const result = anonymizeRecord(record, noPiiConfig)

    expect(result).toEqual(record)
  })
})

describe('syncConfig', () => {
  it('includes character table', () => {
    const tableNames = syncConfig.tablesToSync.map((t) => t.name)

    expect(tableNames).toContain('character')
  })

  it('includes connection table', () => {
    const tableNames = syncConfig.tablesToSync.map((t) => t.name)

    expect(tableNames).toContain('connection')
  })

  it('excludes users table', () => {
    expect(syncConfig.excludedTables).toContain('users')
  })

  it('has no PII fields for character table (public historical data)', () => {
    const characterConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'character'
    )

    expect(characterConfig).toBeDefined()
    expect(characterConfig!.piiFields.size).toBe(0)
  })

  it('has no PII fields for connection table (public historical data)', () => {
    const connectionConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'connection'
    )

    expect(connectionConfig).toBeDefined()
    expect(connectionConfig!.piiFields.size).toBe(0)
  })

  it('includes game_players table', () => {
    const tableNames = syncConfig.tablesToSync.map((t) => t.name)

    expect(tableNames).toContain('game_players')
  })

  it('has no PII fields for game_players table', () => {
    const gamePlayersConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'game_players'
    )

    expect(gamePlayersConfig).toBeDefined()
    expect(gamePlayersConfig!.piiFields.size).toBe(0)
  })

  it('includes games table', () => {
    const tableNames = syncConfig.tablesToSync.map((t) => t.name)

    expect(tableNames).toContain('games')
  })

  it('has no PII fields for games table', () => {
    const gamesConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'games'
    )

    expect(gamesConfig).toBeDefined()
    expect(gamesConfig!.piiFields.size).toBe(0)
  })

  it('includes profiles table', () => {
    const tableNames = syncConfig.tablesToSync.map((t) => t.name)

    expect(tableNames).toContain('profiles')
  })

  it('has PII fields configured for profiles table', () => {
    const profilesConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'profiles'
    )

    expect(profilesConfig).toBeDefined()
    expect(profilesConfig!.piiFields.size).toBeGreaterThan(0)
  })

  it('has correct PII field anonymization rules for profiles table', () => {
    const profilesConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'profiles'
    )

    expect(profilesConfig).toBeDefined()
    expect(profilesConfig!.piiFields.get('username')).toBe('name')
    expect(profilesConfig!.piiFields.get('display_name')).toBe('name')
    expect(profilesConfig!.piiFields.get('full_name')).toBe('name')
    expect(profilesConfig!.piiFields.get('bio')).toBe('text')
    expect(profilesConfig!.piiFields.get('email')).toBe('email')
  })
})

describe('isTableAllowed', () => {
  it('returns false for excluded tables', () => {
    expect(isTableAllowed('users')).toBe(false)
  })

  it('returns true for non-excluded tables', () => {
    expect(isTableAllowed('character')).toBe(true)
    expect(isTableAllowed('connection')).toBe(true)
    expect(isTableAllowed('game_players')).toBe(true)
    expect(isTableAllowed('games')).toBe(true)
    expect(isTableAllowed('profiles')).toBe(true)
  })

  it('returns true for unknown tables', () => {
    expect(isTableAllowed('some_other_table')).toBe(true)
  })
})

describe('getTableConfig', () => {
  it('returns config for character table', () => {
    const config = getTableConfig('character')

    expect(config).toBeDefined()
    expect(config!.name).toBe('character')
  })

  it('returns config for connection table', () => {
    const config = getTableConfig('connection')

    expect(config).toBeDefined()
    expect(config!.name).toBe('connection')
  })

  it('returns config for game_players table', () => {
    const config = getTableConfig('game_players')

    expect(config).toBeDefined()
    expect(config!.name).toBe('game_players')
  })

  it('returns config for games table', () => {
    const config = getTableConfig('games')

    expect(config).toBeDefined()
    expect(config!.name).toBe('games')
  })

  it('returns config for profiles table', () => {
    const config = getTableConfig('profiles')

    expect(config).toBeDefined()
    expect(config!.name).toBe('profiles')
  })

  it('returns undefined for unknown tables', () => {
    const config = getTableConfig('unknown_table')

    expect(config).toBeUndefined()
  })

  it('returns undefined for excluded tables', () => {
    const config = getTableConfig('users')

    expect(config).toBeUndefined()
  })
})

describe('deterministic anonymization', () => {
  it('produces consistent results across multiple runs', () => {
    const testInputs = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']

    const firstRun = testInputs.map(anonymizeName)
    const secondRun = testInputs.map(anonymizeName)

    expect(firstRun).toEqual(secondRun)
  })

  it('maintains referential integrity for repeated values', () => {
    const name = 'John Smith'

    const result1 = anonymizeName(name)
    const result2 = anonymizeName(name)

    expect(result1).toBe(result2)
  })
})

describe('bucket configuration', () => {
  it('has bucketsToSync array in syncConfig', () => {
    expect(syncConfig.bucketsToSync).toBeDefined()
    expect(Array.isArray(syncConfig.bucketsToSync)).toBe(true)
  })

  it('includes character images bucket', () => {
    const bucketNames = syncConfig.bucketsToSync.map((b) => b.name)

    expect(bucketNames).toContain('character images')
  })

  it('has syncContent enabled for character images bucket', () => {
    const characterImagesBucket = syncConfig.bucketsToSync.find(
      (b) => b.name === 'character images'
    )

    expect(characterImagesBucket).toBeDefined()
    expect(characterImagesBucket!.syncContent).toBe(true)
  })
})

describe('getBucketConfig', () => {
  it('returns config for character images bucket', () => {
    const config = getBucketConfig('character images')

    expect(config).toBeDefined()
    expect(config!.name).toBe('character images')
    expect(config!.syncContent).toBe(true)
  })

  it('returns undefined for unknown buckets', () => {
    const config = getBucketConfig('unknown-bucket')

    expect(config).toBeUndefined()
  })

  it('returns undefined for empty bucket name', () => {
    const config = getBucketConfig('')

    expect(config).toBeUndefined()
  })
})

describe('listBucketFiles', () => {
  it('returns empty array for empty bucket', async () => {
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      },
    }

    const result = await listBucketFiles(mockClient as never, 'test-bucket')

    expect(result).toEqual([])
  })

  it('returns file paths for bucket with files', async () => {
    const mockFiles = [
      { name: 'image1.png' },
      { name: 'image2.jpg' },
      { name: 'folder/image3.png' },
    ]
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
        }),
      },
    }

    const result = await listBucketFiles(mockClient as never, 'test-bucket')

    expect(result).toEqual(['image1.png', 'image2.jpg', 'folder/image3.png'])
  })

  it('filters out .emptyFolderPlaceholder files', async () => {
    const mockFiles = [
      { name: 'image1.png' },
      { name: '.emptyFolderPlaceholder' },
      { name: 'image2.jpg' },
    ]
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
        }),
      },
    }

    const result = await listBucketFiles(mockClient as never, 'test-bucket')

    expect(result).toEqual(['image1.png', 'image2.jpg'])
  })

  it('handles pagination for large buckets', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ name: `file${i}.png` }))
    const secondPage = [{ name: 'file1000.png' }, { name: 'file1001.png' }]
    const listMock = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null })

    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: listMock,
        }),
      },
    }

    const result = await listBucketFiles(mockClient as never, 'test-bucket')

    expect(result).toHaveLength(1002)
    expect(listMock).toHaveBeenCalledTimes(2)
  })

  it('throws error when storage API fails', async () => {
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Storage error' },
          }),
        }),
      },
    }

    await expect(listBucketFiles(mockClient as never, 'test-bucket')).rejects.toThrow(
      'Failed to list files in test-bucket: Storage error'
    )
  })
})

describe('clearBucket', () => {
  it('handles empty bucket gracefully', async () => {
    const listMock = vi.fn().mockResolvedValue({ data: [], error: null })
    const removeMock = vi.fn()
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: listMock,
          remove: removeMock,
        }),
      },
    }

    await clearBucket(mockClient as never, 'test-bucket')

    expect(removeMock).not.toHaveBeenCalled()
  })

  it('deletes all files from bucket', async () => {
    const mockFiles = [{ name: 'file1.png' }, { name: 'file2.png' }]
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
          remove: removeMock,
        }),
      },
    }

    await clearBucket(mockClient as never, 'test-bucket')

    expect(removeMock).toHaveBeenCalledWith(['file1.png', 'file2.png'])
  })

  it('deletes files in batches for large buckets', async () => {
    const mockFiles = Array.from({ length: 150 }, (_, i) => ({ name: `file${i}.png` }))
    const removeMock = vi.fn().mockResolvedValue({ error: null })
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
          remove: removeMock,
        }),
      },
    }

    await clearBucket(mockClient as never, 'test-bucket')

    expect(removeMock).toHaveBeenCalledTimes(2)
  })

  it('throws error when remove fails', async () => {
    const mockFiles = [{ name: 'file1.png' }]
    const mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          list: vi.fn().mockResolvedValue({ data: mockFiles, error: null }),
          remove: vi.fn().mockResolvedValue({
            error: { message: 'Remove failed' },
          }),
        }),
      },
    }

    await expect(clearBucket(mockClient as never, 'test-bucket')).rejects.toThrow(
      'Failed to clear files from test-bucket: Remove failed'
    )
  })
})
