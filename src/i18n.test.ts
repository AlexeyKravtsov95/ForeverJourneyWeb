import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectLang } from './i18n'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('detectLang (first visit)', () => {
  it('maps ru and all Russian regional variants to RU', () => {
    expect(detectLang({ languages: ['ru-RU', 'en-US'], language: 'ru-RU' })).toBe('ru')
    expect(detectLang({ languages: ['ru'], language: 'ru' })).toBe('ru')
    expect(detectLang({ language: 'ru-KZ' })).toBe('ru')
  })

  it('maps en-US to EN', () => {
    expect(detectLang({ languages: ['en-US', 'ru-RU'], language: 'en-US' })).toBe('en')
  })

  it('falls back to EN for unknown languages', () => {
    expect(detectLang({ languages: ['xx-YY'], language: 'xx-YY' })).toBe('en')
    expect(detectLang({ language: 'de' })).toBe('en')
  })

  it('prefers the first entry of navigator.languages over navigator.language', () => {
    expect(detectLang({ languages: ['en-US', 'ru-RU'], language: 'ru-RU' })).toBe('en')
    expect(detectLang({ languages: ['ru-RU', 'en-US'], language: 'en-US' })).toBe('ru')
  })

  it('falls back to navigator.language when navigator.languages is empty', () => {
    expect(detectLang({ languages: [], language: 'ru-RU' })).toBe('ru')
  })

  it('defaults to EN when no browser preferences exist', () => {
    expect(detectLang({})).toBe('en')
    // without an argument detectLang reads the global navigator — stub it,
    // because node itself may expose a locale-dependent one
    vi.stubGlobal('navigator', {})
    expect(detectLang(undefined)).toBe('en')
  })
})
