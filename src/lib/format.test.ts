import { describe, expect, it } from 'vitest'
import {
  coverDateRange,
  formatDate,
  formatDateRange,
  formatPlayed,
  formatPlayedExact,
  monthLabel,
  toRoman,
} from './format'
import type { Journal } from './journal'

describe('format', () => {
  it('formats valid dates in both languages', () => {
    expect(formatDate(Date.UTC(2026, 9, 21), 'en')).toContain('2026')
    expect(formatDate(Date.UTC(2026, 9, 21), 'ru')).toContain('2026')
    expect(monthLabel(Date.UTC(2026, 9, 1), 'en').toLowerCase()).toContain('october')
  })

  it('never throws on NaN, Infinity or zero (no RangeError from Intl)', () => {
    for (const lang of ['en', 'ru'] as const) {
      expect(() => formatDate(Number.NaN, lang)).not.toThrow()
      expect(() => formatDate(Number.POSITIVE_INFINITY, lang)).not.toThrow()
      expect(() => formatDate(Number.NEGATIVE_INFINITY, lang)).not.toThrow()
      expect(() => formatDate(0, lang)).not.toThrow()
      expect(() => formatDate(8_640_000_000_000_001, lang)).not.toThrow()
      expect(() => monthLabel(Number.NaN, lang)).not.toThrow()
      expect(() => monthLabel(Number.POSITIVE_INFINITY, lang)).not.toThrow()
    }
    expect(formatDate(Number.NaN, 'en')).toBe('')
    expect(formatDate(Number.POSITIVE_INFINITY, 'ru')).toBe('')
    expect(monthLabel(Number.NaN, 'en')).toBe('')
  })

  it('converts chapter numbers to Roman numerals', () => {
    expect(toRoman(1)).toBe('I')
    expect(toRoman(4)).toBe('IV')
    expect(toRoman(9)).toBe('IX')
    expect(toRoman(49)).toBe('XLIX')
    expect(toRoman(2026)).toBe('MMXXVI')
    expect(toRoman(3999)).toBe('MMMCMXCIX')
    expect(toRoman(0)).toBe('0')
    expect(toRoman(-1)).toBe('-1')
  })
})

describe('formatPlayed', () => {
  it('formats time played in Russian units', () => {
    expect(formatPlayed(424_800, 'ru')).toBe('4 д 22 ч') // 4d 22h
    expect(formatPlayed(19_800, 'ru')).toBe('5 ч 30 мин') // 5h 30m
    expect(formatPlayed(2_700, 'ru')).toBe('45 мин')
    expect(formatPlayed(864_000, 'ru')).toBe('10 д')
    expect(formatPlayed(0, 'ru')).toBe('0 мин')
  })

  it('keeps the compact English format', () => {
    expect(formatPlayed(424_800, 'en')).toBe('4d 22h')
    expect(formatPlayed(19_800, 'en')).toBe('5h 30m')
    expect(formatPlayed(2_700, 'en')).toBe('45m')
    expect(formatPlayed(0, 'en')).toBe('0m')
  })
})

describe('formatPlayedExact (archive snapshot, FJ-WEB-06.1)', () => {
  it('keeps every unit down to the second — the Straider value', () => {
    expect(formatPlayedExact(183_754, 'ru')).toBe('2 д 3 ч 2 мин 34 с')
    expect(formatPlayedExact(183_754, 'en')).toBe('2d 3h 2m 34s')
  })

  it('renders a valid zero as zero', () => {
    expect(formatPlayedExact(0, 'ru')).toBe('0 с')
    expect(formatPlayedExact(0, 'en')).toBe('0s')
  })

  it('never rounds the seconds away', () => {
    // exact minutes drop the empty seconds unit; a remainder never disappears
    expect(formatPlayedExact(3_600, 'en')).toBe('1h')
    expect(formatPlayedExact(3_661, 'en')).toBe('1h 1m 1s')
    expect(formatPlayedExact(86_400, 'ru')).toBe('1 д')
  })

  it('shows values under a minute correctly', () => {
    expect(formatPlayedExact(34, 'ru')).toBe('34 с')
    expect(formatPlayedExact(34, 'en')).toBe('34s')
    expect(formatPlayedExact(1, 'en')).toBe('1s')
  })

  it('refuses to pass invalid values off as zero', () => {
    expect(formatPlayedExact(Number.NaN, 'en')).toBe('')
    expect(formatPlayedExact(Number.POSITIVE_INFINITY, 'ru')).toBe('')
    expect(formatPlayedExact(-1, 'en')).toBe('')
    expect(formatPlayedExact(-0.5, 'ru')).toBe('')
  })
})

describe('formatDateRange (cover dates, FJ-WEB-06.1)', () => {
  // mid-day UTC timestamps: the same calendar day for any realistic runner
  // timezone (CI is UTC, dev machines are within a few hours of it)
  const morning = Date.UTC(2026, 9, 10, 6, 30)
  const evening = Date.UTC(2026, 9, 10, 13, 40)
  const otherDay = Date.UTC(2026, 9, 21, 12)

  it('shows one date when both timestamps share a calendar day (same day, different times)', () => {
    expect(formatDateRange(morning, evening, 'en')).toBe('October 10, 2026')
    expect(formatDateRange(morning, evening, 'ru')).toBe('10 октября 2026 г.')
  })

  it('shows a range for different days', () => {
    expect(formatDateRange(morning, otherDay, 'en')).toBe('October 10, 2026 — October 21, 2026')
    expect(formatDateRange(morning, otherDay, 'ru')).toBe(
      '10 октября 2026 г. — 21 октября 2026 г.'
    )
  })

  it('shows the single date that exists', () => {
    expect(formatDateRange(otherDay, undefined, 'en')).toBe('October 21, 2026')
    expect(formatDateRange(undefined, otherDay, 'ru')).toBe('21 октября 2026 г.')
  })

  it('shows nothing without valid dates', () => {
    expect(formatDateRange(undefined, undefined, 'en')).toBe('')
    expect(formatDateRange(Number.NaN, Number.NaN, 'ru')).toBe('')
    expect(formatDateRange(Number.POSITIVE_INFINITY, otherDay, 'en')).toBe('October 21, 2026')
    expect(formatDateRange(8_640_000_000_000_001, undefined, 'ru')).toBe('')
  })
})

describe('coverDateRange (journal → cover, FJ-WEB-06.1)', () => {
  const base: Journal = {
    format: 'FJJOURNAL',
    formatVersion: 1,
    addonVersion: '',
    locale: '',
    character: { name: 'Straider', race: '', class: '', level: 0 },
    journey: {},
    memories: [
      {
        type: 'ZONE',
        typeLabel: '',
        source: 'RECORDED',
        title: '',
        description: '',
        personalNote: '',
        favorite: false,
        timestamp: Date.UTC(2026, 9, 10, 6, 20),
        location: '',
      },
      {
        type: 'DEATH',
        typeLabel: '',
        source: 'RECORDED',
        title: '',
        description: '',
        personalNote: '',
        favorite: false,
        timestamp: Date.UTC(2026, 9, 10, 13, 40),
        location: '',
      },
    ],
  }

  it('one-day journey: journey start and last memory collapse into a single date', () => {
    const journal: Journal = {
      ...base,
      journey: { startedAt: Date.UTC(2026, 9, 10, 5, 30) },
    }
    expect(coverDateRange(journal, 'ru')).toBe('10 октября 2026 г.')
    expect(coverDateRange(journal, 'en')).toBe('October 10, 2026')
  })

  it('multi-day journey keeps the range', () => {
    const journal: Journal = {
      ...base,
      journey: { startedAt: Date.UTC(2026, 8, 2, 5, 30) },
    }
    expect(coverDateRange(journal, 'en')).toBe('September 2, 2026 — October 10, 2026')
  })

  it('falls back to memories when the journey start is unknown, and to export time without memories', () => {
    expect(coverDateRange(base, 'en')).toBe('October 10, 2026') // memories only, one day
    const noMemories: Journal = {
      ...base,
      memories: [],
      exportedAt: Date.UTC(2026, 9, 11, 12),
      journey: { startedAt: Date.UTC(2026, 9, 10, 5, 30) },
    }
    expect(coverDateRange(noMemories, 'ru')).toBe('10 октября 2026 г. — 11 октября 2026 г.')
    expect(coverDateRange({ ...noMemories, journey: {} }, 'en')).toBe('October 11, 2026')
  })
})
