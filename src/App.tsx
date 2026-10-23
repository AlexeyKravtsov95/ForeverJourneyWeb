import { useEffect, useState } from 'react'
import { strings, type Lang } from './i18n'
import { initialLang, langStorage, saveManualLang } from './langPreference'
import Landing from './components/Landing'
import Book from './components/Book'
import type { Journal } from './lib/journal'
import type { ImportMeta } from './lib/fjbook'

type View = { kind: 'landing' } | { kind: 'book'; journal: Journal; meta: ImportMeta }

export default function App() {
  const [lang, setLang] = useState<Lang>(() => initialLang(langStorage()))
  const [view, setView] = useState<View>({ kind: 'landing' })

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // Only a manual switch is persisted — the auto-detected language must not
  // pin the app and shadow later browser-language changes on future visits.
  function changeLang(next: Lang) {
    setLang(next)
    saveManualLang(langStorage(), next)
  }

  const tr = strings[lang]

  return (
    <div className="app">
      {view.kind === 'landing' ? (
        <Landing
          tr={tr}
          lang={lang}
          onLangChange={changeLang}
          onImported={(journal, meta) => setView({ kind: 'book', journal, meta })}
        />
      ) : (
        <Book
          tr={tr}
          lang={lang}
          onLangChange={changeLang}
          journal={view.journal}
          meta={view.meta}
          onBack={() => setView({ kind: 'landing' })}
        />
      )}
    </div>
  )
}
