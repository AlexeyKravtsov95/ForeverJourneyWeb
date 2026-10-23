import { afterEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, initialLang, langStorage, saveManualLang, type LangStorage } from './langPreference'

/** In-memory localStorage stand-in so tests never touch real browser storage. */
function memoryStorage(initial: Record<string, string> = {}): LangStorage {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

/** Simulates the browser preferences detectLang() reads on a fresh visit. */
function stubNavigator(languages: string[], language = languages[0]): void {
  vi.stubGlobal('navigator', { languages, language })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('first visit (no manual choice yet)', () => {
  it('resolves RU for a ru-RU browser', () => {
    stubNavigator(['ru-RU', 'en-US'])
    expect(initialLang(memoryStorage())).toBe('ru')
  })

  it('resolves EN for an en-US browser', () => {
    stubNavigator(['en-US', 'ru-RU'])
    expect(initialLang(memoryStorage())).toBe('en')
  })

  it('resolves EN for an unknown browser language', () => {
    stubNavigator(['xx-YY'])
    expect(initialLang(memoryStorage())).toBe('en')
  })

  it('never persists the auto-detected language', () => {
    stubNavigator(['ru-RU'])
    const storage = memoryStorage()
    const setItem = vi.spyOn(storage, 'setItem')

    expect(initialLang(storage)).toBe('ru')
    expect(setItem).not.toHaveBeenCalled()
    expect(storage.getItem(LANG_KEY)).toBeNull()
  })

  it('re-detects on every visit, so a browser-language change takes effect', () => {
    // first visit with a Russian browser, nothing saved
    stubNavigator(['ru-RU'])
    expect(initialLang(memoryStorage())).toBe('ru')

    // browser language switched to English — still no manual choice anywhere
    stubNavigator(['en-US'])
    expect(initialLang(memoryStorage())).toBe('en')
  })
})

describe('manual choice', () => {
  it('is saved on switch and restored on the next visit', () => {
    stubNavigator(['en-US'])
    const storage = memoryStorage()

    saveManualLang(storage, 'ru')
    expect(storage.getItem(LANG_KEY)).toBe('ru')

    // a later visit with a different browser language keeps the choice
    stubNavigator(['en-US'])
    expect(initialLang(storage)).toBe('ru')
  })

  it('wins over the browser language', () => {
    stubNavigator(['ru-RU'])
    expect(initialLang(memoryStorage({ [LANG_KEY]: 'en' }))).toBe('en')

    stubNavigator(['en-US'])
    expect(initialLang(memoryStorage({ [LANG_KEY]: 'ru' }))).toBe('ru')
  })

  it('ignores garbage values and falls back to detection', () => {
    stubNavigator(['ru-RU'])
    expect(initialLang(memoryStorage({ [LANG_KEY]: 'de' }))).toBe('ru')
  })
})

describe('unavailable localStorage', () => {
  it('still resolves a language when storage is null', () => {
    stubNavigator(['ru-RU'])
    expect(initialLang(null)).toBe('ru')
  })

  it('does not crash when saving with storage null', () => {
    expect(() => saveManualLang(null, 'ru')).not.toThrow()
  })

  it('does not crash when reads throw', () => {
    stubNavigator(['ru-RU'])
    const storage: LangStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    }
    expect(initialLang(storage)).toBe('ru')
  })

  it('does not crash when writes throw (quota exceeded / private mode)', () => {
    const storage: LangStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(() => saveManualLang(storage, 'ru')).not.toThrow()
  })

  it('langStorage() reports no storage outside the browser', () => {
    // the node test environment has no localStorage at all
    expect(langStorage()).toBeNull()
  })
})
