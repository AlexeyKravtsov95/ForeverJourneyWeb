import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import Book from './components/Book'
import Landing from './components/Landing'
import { buildDemoCode, demoJournal } from './demo/demoJournal'
import { strings } from './i18n'
import { importJournal, type ImportMeta } from './lib/fjbook'

const meta: ImportMeta = { parts: 4, decodedBytes: 4096, checksum: 1 }

describe('rendering', () => {
  it('Landing shows the brand, subtitle, import and demo controls in English', () => {
    const html = renderToString(
      <Landing tr={strings.en} lang="en" onLangChange={() => undefined} onImported={() => undefined} />
    )
    expect(html).toContain('Forever Journey')
    expect(html).toContain('Turn your adventures into a story worth keeping')
    expect(html).toContain('Import Journal')
    expect(html).toContain('Try Demo Journal')
  })

  it('Landing renders fully in Russian', () => {
    const html = renderToString(
      <Landing tr={strings.ru} lang="ru" onLangChange={() => undefined} onImported={() => undefined} />
    )
    expect(html).toContain('Импортировать журнал')
    expect(html).toContain('Демо-журнал')
  })

  it('Book renders cover, introduction and memories with Cyrillic notes', () => {
    const html = renderToString(
      <Book
        tr={strings.en}
        lang="en"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={demoJournal}
        meta={meta}
      />
    )
    expect(html).toContain('My Journey')
    expect(html).toContain(demoJournal.character.name)
    expect(html).toContain(demoJournal.memories[0].title as string)
    expect(html).toContain('Первое море')
    expect(html).toContain('The journey continues')
  })
})

describe('demo journal', () => {
  it('builds a multi-part FJBOOK1 code that imports through the real pipeline', () => {
    const result = importJournal(buildDemoCode())
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.parts).toBeGreaterThan(1)
      expect(result.journal.memories).toHaveLength(demoJournal.memories.length)
      expect(result.journal.character.name).toBe(demoJournal.character.name)
    }
  })
})
