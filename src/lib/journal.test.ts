import { describe, expect, it } from 'vitest'
import {
  MAX_CHAPTER_DESCRIPTION_BYTES,
  MAX_CHAPTER_TITLE_BYTES,
  toTimestamp,
  truncateUtf8Bytes,
  utf8ByteLength,
  validateJournal,
} from './journal'

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

  it('rejects values outside the ECMAScript date range (no RangeError downstream)', () => {
    expect(toTimestamp(8_640_000_000_000_000)).toBe(8_640_000_000_000_000)
    expect(toTimestamp(8_640_000_000_000_001)).toBeUndefined()
    expect(toTimestamp(1e16)).toBeUndefined()
    expect(toTimestamp(Number.MAX_SAFE_INTEGER)).toBeUndefined()
    expect(toTimestamp('+300000-01-01T00:00:00Z')).toBeUndefined()
  })
})

describe('exportedAt normalization', () => {
  it('accepts Unix seconds, milliseconds and ISO strings', () => {
    const seconds = validateJournal({ ...minimal, exportedAt: 1_770_000_000 })
    expect(seconds.ok).toBe(true)
    if (seconds.ok) expect(seconds.journal.exportedAt).toBe(1_770_000_000_000)

    const millis = validateJournal({ ...minimal, exportedAt: 1_770_000_000_000 })
    expect(millis.ok).toBe(true)
    if (millis.ok) expect(millis.journal.exportedAt).toBe(1_770_000_000_000)

    const iso = validateJournal({ ...minimal, exportedAt: '2026-10-02T12:00:00Z' })
    expect(iso.ok).toBe(true)
    if (iso.ok) expect(iso.journal.exportedAt).toBe(Date.UTC(2026, 9, 2, 12))
  })

  it('drops invalid or out-of-range exportedAt without failing the journal', () => {
    for (const exportedAt of ['nope', -5, Number.NaN, 1e19, null]) {
      const result = validateJournal({ ...minimal, exportedAt })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.journal.exportedAt).toBeUndefined()
    }
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

  it('rejects more than MAX_MEMORIES entries (JournalExport.lua MAX_ENTRIES = 20000)', () => {
    const memories = Array.from({ length: 20_001 }, () => ({ type: 'note' }))
    expect(validateJournal({ ...minimal, memories })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
  })

  it('drops an archive block from an export payload — archives come only from SavedVariables', () => {
    const result = validateJournal({
      ...minimal,
      archive: {
        recovered: { level: 99, completedQuests: 999, playedTotal: 999_999, capturedAt: 1 },
        professions: [{ name: 'Горное дело', skillLevel: 300, maxSkillLevel: 300 }],
        zones: [{ name: 'Азшара', firstSeenAt: 1 }],
        deathsCounter: 500,
      },
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.journal.archive).toBeUndefined()
  })
})

describe('author chapters (FJ-WEB-03)', () => {
  const chapter = (overrides: Record<string, unknown> = {}) => ({
    id: 'g-1',
    title: 'Затерянные берега',
    description: 'Дни, когда карты кончились.',
    startedAt: 1_775_001_600,
    ...overrides,
  })

  it('keeps a closed chapter and normalizes its times to milliseconds', () => {
    const result = validateJournal({
      ...minimal,
      chapters: [chapter({ closedAt: 1_777_590_000 })],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.chapters).toEqual([
        {
          id: 'g-1',
          title: 'Затерянные берега',
          description: 'Дни, когда карты кончились.',
          startedAt: 1_775_001_600_000,
          closedAt: 1_777_590_000_000,
        },
      ])
    }
  })

  it('keeps an unclosed chapter without closedAt', () => {
    const result = validateJournal({ ...minimal, chapters: [chapter()] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.chapters).toHaveLength(1)
      expect(result.journal.chapters?.[0].closedAt).toBeUndefined()
    }
  })

  it('treats an interval that closes before it starts as open (broken closedAt dropped, chapter kept)', () => {
    const result = validateJournal({
      ...minimal,
      chapters: [chapter({ closedAt: 1_000 })],
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.journal.chapters?.[0].closedAt).toBeUndefined()
  })

  it('drops damaged chapters but never their memories', () => {
    const damaged = [
      chapter({ id: '   ' }), // id of spaces
      chapter({ id: 42, title: 'id не строка' }),
      chapter({ title: '' }), // empty title
      chapter({ title: '   ' }), // title of spaces
      chapter({ startedAt: 'nope' }), // no valid start
      chapter({ startedAt: 0 }), // unix zero is not a time
      'not an object',
      null,
    ]
    const result = validateJournal({
      ...minimal,
      chapters: damaged,
      memories: [
        { type: 'note', title: 'в потерянной главе', chapterId: 'g-1' },
        { type: 'note', title: 'без главы' },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.chapters).toBeUndefined()
      // the memories survive; a dangling binding is data, not an error
      expect(result.journal.memories).toHaveLength(2)
      expect(result.journal.memories[0].chapterId).toBe('g-1')
    }
  })

  it('keeps the first chapter when ids repeat (deterministic dedupe)', () => {
    const result = validateJournal({
      ...minimal,
      chapters: [chapter({ title: 'Первая' }), chapter({ title: 'Вторая' })],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.chapters).toHaveLength(1)
      expect(result.journal.chapters?.[0].title).toBe('Первая')
    }
  })

  it('rejects more than MAX_CHAPTERS chapters (Chapters.lua cap = 512)', () => {
    const chapters = Array.from({ length: 513 }, (_, index) =>
      chapter({ id: `g-${index}`, title: `Глава ${index}` })
    )
    expect(validateJournal({ ...minimal, chapters })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
  })

  it('rejects a chapters field that is not an array', () => {
    expect(validateJournal({ ...minimal, chapters: { 'g-1': chapter() } })).toMatchObject({
      ok: false,
      code: 'INVALID_SCHEMA',
    })
  })

  it('stores no chapters field at all for old exports and empty arrays', () => {
    const legacy = validateJournal(minimal)
    expect(legacy.ok).toBe(true)
    if (legacy.ok) expect('chapters' in legacy.journal).toBe(false)

    const empty = validateJournal({ ...minimal, chapters: [] })
    expect(empty.ok).toBe(true)
    if (empty.ok) expect('chapters' in empty.journal).toBe(false)
  })

  it('keeps exactly the five known fields — unknown chapter fields are not saved', () => {
    const result = validateJournal({
      ...minimal,
      chapters: [chapter({ color: 'red', order: 7, closedAt: null })],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      // closedAt: null is not a time — the chapter stays open, and the null
      // itself is not kept either
      expect(Object.keys(result.journal.chapters?.[0] ?? {}).sort()).toEqual([
        'description',
        'id',
        'startedAt',
        'title',
      ])
      expect(result.journal.chapters?.[0]).not.toHaveProperty('color')
    }
  })

  it('truncates titles to 160 and descriptions to 1200 UTF-8 bytes without splitting characters', () => {
    // 'д' is 2 UTF-8 bytes: 81 'д' = 162 bytes → capped at 160 = 80 'д'
    const longTitle = 'д'.repeat(81)
    const longDescription = 'ж'.repeat(601) // 1202 bytes → 600 survive
    expect(utf8ByteLength(longTitle)).toBe(162)
    const result = validateJournal({
      ...minimal,
      chapters: [chapter({ title: longTitle, description: longDescription })],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const kept = result.journal.chapters?.[0]
      expect(kept?.title).toBe('д'.repeat(80))
      expect(utf8ByteLength(kept?.title ?? '')).toBe(MAX_CHAPTER_TITLE_BYTES)
      expect(kept?.description).toBe('ж'.repeat(600))
      expect(utf8ByteLength(kept?.description ?? '')).toBe(MAX_CHAPTER_DESCRIPTION_BYTES)
    }
  })

  it('truncates emoji (4-byte characters) whole, never a half surrogate', () => {
    const withEmoji = '🌊'.repeat(41) // 164 bytes → 40 emoji (160 bytes) survive
    expect(truncateUtf8Bytes(withEmoji, MAX_CHAPTER_TITLE_BYTES)).toBe('🌊'.repeat(40))
    // a 2-byte character before a 4-byte one: 2+2+4 = 8 bytes fit exactly
    expect(truncateUtf8Bytes('аб🌊г', 8)).toBe('аб🌊')
    expect(truncateUtf8Bytes('аб🌊г', 7)).toBe('аб')
  })

  it('keeps a memory chapterId binding and drops an empty one', () => {
    const result = validateJournal({
      ...minimal,
      chapters: [chapter()],
      memories: [
        { type: 'note', title: 'в главе', chapterId: ' g-1 ' },
        { type: 'note', title: 'пустая связь', chapterId: '   ' },
      ],
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.journal.memories[0].chapterId).toBe('g-1')
      expect(result.journal.memories[1].chapterId).toBeUndefined()
    }
  })
})
