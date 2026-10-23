import { detectLang, type Lang } from './i18n'

export const LANG_KEY = 'fj.lang'

/** The slice of localStorage the language preference needs (easy to stub in tests). */
export interface LangStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Returns localStorage when it is usable, or null in private modes / non-browser runtimes. */
export function langStorage(): LangStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Reads the manually chosen language; null when the visitor never chose one. */
function readManualLang(storage: LangStorage | null): Lang | null {
  if (!storage) return null
  try {
    const saved = storage.getItem(LANG_KEY)
    return saved === 'en' || saved === 'ru' ? saved : null
  } catch {
    return null
  }
}

/**
 * Resolves the language for a fresh visit: a manual choice from an earlier
 * visit wins; otherwise the browser preference is re-detected every time.
 */
export function initialLang(storage: LangStorage | null): Lang {
  return readManualLang(storage) ?? detectLang()
}

/** Persists a manual language choice; the auto-detected language is never saved. */
export function saveManualLang(storage: LangStorage | null, lang: Lang): void {
  if (!storage) return
  try {
    storage.setItem(LANG_KEY, lang)
  } catch {
    // full storage or blocked writes — the choice lives only for this visit
  }
}
