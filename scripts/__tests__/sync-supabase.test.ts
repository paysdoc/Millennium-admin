import { describe, it, expect } from 'vitest'
import {
  hashString,
  anonymizeName,
  anonymizeText,
  anonymizeField,
  anonymizeRecord,
} from '../sync-supabase'
import { syncConfig, isTableAllowed, getTableConfig } from '../sync-config'
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

describe('anonymizeField', () => {
  it('returns null for null value regardless of rule', () => {
    expect(anonymizeField(null, 'name')).toBeNull()
    expect(anonymizeField(null, 'text')).toBeNull()
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

  it('has PII field configuration for character table', () => {
    const characterConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'character'
    )

    expect(characterConfig).toBeDefined()
    expect(characterConfig!.piiFields.has('first_names')).toBe(true)
    expect(characterConfig!.piiFields.has('biography')).toBe(true)
  })

  it('has PII field configuration for connection table', () => {
    const connectionConfig = syncConfig.tablesToSync.find(
      (t) => t.name === 'connection'
    )

    expect(connectionConfig).toBeDefined()
    expect(connectionConfig!.piiFields.has('why')).toBe(true)
    expect(connectionConfig!.piiFields.has('why_short')).toBe(true)
  })
})

describe('isTableAllowed', () => {
  it('returns false for excluded tables', () => {
    expect(isTableAllowed('users')).toBe(false)
  })

  it('returns true for non-excluded tables', () => {
    expect(isTableAllowed('character')).toBe(true)
    expect(isTableAllowed('connection')).toBe(true)
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
