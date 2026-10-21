import { useEffect, useState } from 'react'
import { detectLang, strings, type Lang } from './i18n'
import Landing from './components/Landing'
import Book from './components/Book'
import type { Journal } from './lib/journal'
import type { ImportMeta } from './lib/fjbook'

type View = { kind: 'landing' } | { kind: 'book'; journal: Journal; meta: ImportMeta }

const LANG_KEY = 'fj.lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'ru') return saved
  } catch {
    // private browsing — fall back to detection
  }
  return detectLang()
}

export default function App() {
  const [lang, setLang] = useState<Lang>(initialLang)
  const [view, setView] = useState<View>({ kind: 'landing' })

  useEffect(() => {
    document.documentElement.lang = lang
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      // storage unavailable — language just won't persist
    }
  }, [lang])

  const tr = strings[lang]

  return (
    <div className="app">
      {view.kind === 'landing' ? (
        <Landing
          tr={tr}
          lang={lang}
          onLangChange={setLang}
          onImported={(journal, meta) => setView({ kind: 'book', journal, meta })}
        />
      ) : (
        <Book
          tr={tr}
          lang={lang}
          onLangChange={setLang}
          journal={view.journal}
          meta={view.meta}
          onBack={() => setView({ kind: 'landing' })}
        />
      )}
    </div>
  )
}
