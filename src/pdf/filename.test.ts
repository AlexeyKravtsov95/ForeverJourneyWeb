import { describe, expect, it } from 'vitest'
import { pdfFileName, sanitizeCharacterName } from './filename'

describe('sanitizeCharacterName', () => {
  it('keeps letters, digits, spaces, dashes and underscores', () => {
    expect(sanitizeCharacterName('Aelirien')).toBe('Aelirien')
    expect(sanitizeCharacterName('Стальногрив 2.0_beta')).toBe('Стальногрив 2.0_beta')
  })

  it('strips Windows-reserved and path characters', () => {
    expect(sanitizeCharacterName('A<b>c:d"e/f\\g|h?i*j')).toBe('Abcdefghij')
  })

  it('folds newlines and tabs into single spaces', () => {
    expect(sanitizeCharacterName('Рагнар\nЛодброк\t\tthe\tOld')).toBe('Рагнар Лодброк the Old')
  })

  it('drops trailing dots and spaces (Windows would drop them silently)', () => {
    expect(sanitizeCharacterName('Shadow. ')).toBe('Shadow')
    expect(sanitizeCharacterName('.')).toBe('')
  })

  it('keeps other Unicode punctuation such as ellipsis', () => {
    expect(sanitizeCharacterName('Тень…')).toBe('Тень…')
  })

  it('caps the name at 80 characters', () => {
    const long = 'A'.repeat(200)
    expect(sanitizeCharacterName(long)).toHaveLength(80)
  })

  it('returns empty string for control-character-only input', () => {
    expect(sanitizeCharacterName('\u0000\u0001\u0002')).toBe('')
  })
})

describe('pdfFileName', () => {
  it('builds ForeverJourney_<CharacterName>.pdf', () => {
    expect(pdfFileName('Aelirien')).toBe('ForeverJourney_Aelirien.pdf')
    expect(pdfFileName('Эйтригг')).toBe('ForeverJourney_Эйтригг.pdf')
  })

  it('sanitizes unsafe names into safe file names', () => {
    expect(pdfFileName('Con:quest ?of Azeroth')).toBe('ForeverJourney_Conquest of Azeroth.pdf')
  })

  it('falls back when nothing safe remains', () => {
    expect(pdfFileName('///')).toBe('ForeverJourney_Book.pdf')
    expect(pdfFileName('   ')).toBe('ForeverJourney_Book.pdf')
  })
})
