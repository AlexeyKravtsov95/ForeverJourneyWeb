import { describe, expect, it } from 'vitest'
import { toTimestamp, validateJournal } from './journal'

const minimal = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  character: { name: 'Тест' },
  memories: [],
}

describe('toTimestamp', () => {
  it('normalizes epoch seconds, milliseconds and ISO strings', () => {
    expect(toTimestamp(1_770_000_000)).toBe(1_770_000_000_000)
    expect(toTimestamp(1_770_000_000_000)).toBe(1_770_000_000_000)
    expect(toTimestamp('2026-06-14T18:30:00Z')).toBe(Date.UTC(2026, 5, 14, 18, 30))
  })

  it('returns undefined for invalid values', () => {
    expect(toTimestamp(0)).toBeUndefined()
    expect(toTimestamp(-5)).toBeUndefined()
    expect(toTimestamp('not a date')).toBeUndefined()
    expect(toTimestamp(null)).toBeUndefined()
  })
})

describe('validateJournal', () => {
  it('accepts a minimal journal and fills safe defaults', () => {
    const result = validateJournal(minimal)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.character.name).toBe('Тест')
      expect(result.journal.journey.deaths).toBe(0)
      expect(result.journal.memories).toEqual([])
    }
  })

  it('keeps the empty journal valid', () => {
    const result = validateJournal({ ...minimal, memories: [] })
    expect(result.ok).toBe(true)
  })

  it('rejects wrong inner format and version', () => {
    expect(validateJournal({ ...minimal, format: 'OTHER' })).toMatchObject({
      ok: false,
      code: 'WRONG_FORMAT',
    })
    expect(validateJournal({ ...minimal, formatVersion: 2 })).toMatchObject({
      ok: false,
      code: 'UNSUPPORTED_VERSION',
    })
  })

  it('rejects structural damage', () => {
    expect(validateJournal(null)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' })
    expect(validateJournal('string')).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' })
    expect(validateJournal({ ...minimal, character: {} })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
    expect(validateJournal({ ...minimal, memories: 'nope' })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
  })

  it('skips non-object memories and keeps valid ones', () => {
    const result = validateJournal({
      ...minimal,
      memories: [{ type: 'note', title: 'Запись' }, 42, null, 'junk'],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.memories).toHaveLength(1)
      expect(result.journal.memories[0].title).toBe('Запись')
    }
  })

  it('truncates oversized fields', () => {
    const result = validateJournal({
      ...minimal,
      memories: [{ title: 'x'.repeat(25_000) }],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.memories[0].title).toHaveLength(20_000)
    }
  })

  it('rejects more than MAX_MEMORIES entries', () => {
    const memories = Array.from({ length: 10_001 }, () => ({ type: 'note' }))
    expect(validateJournal({ ...minimal, memories })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
  })
})
