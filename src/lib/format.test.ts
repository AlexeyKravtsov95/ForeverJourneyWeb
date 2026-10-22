import { describe, expect, it } from 'vitest'
import { formatDate, formatPlayed, monthLabel, toRoman } from './format'

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
