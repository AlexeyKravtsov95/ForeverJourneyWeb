import { describe, expect, it } from 'vitest'
import { formatDate, monthLabel, toRoman } from './format'

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
