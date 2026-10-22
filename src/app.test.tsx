import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import Book from './components/Book'
import Landing from './components/Landing'
import { buildDemoCode, demoJournal } from './demo/demoJournal'
import { strings } from './i18n'
import { importJournal, type ImportMeta } from './lib/fjbook'
import type { Journal } from './lib/journal'

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

  it('Book in Russian localizes system events and keeps player text verbatim', () => {
    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={demoJournal}
        meta={meta}
      />
    )
    expect(html).toContain('Зона открыта')
    expect(html).toContain('Запись в дневнике')
    expect(html).toContain('Уровень 5')
    expect(html).toContain('Достигнут уровень 5.')
    expect(html).toContain('Достигнут максимальный уровень.')
    // player-written text is never translated, even on system event types
    expect(html).toContain('Первое море')
    expect(html).toContain('The trees here lean away from the sea')
    // authored titles of manual notes stay verbatim in the Russian book too
    expect(html).toContain('Autumn in Duskwood')
    // localized time format and a single period after the Russian year
    // (the calendar day depends on the reader's timezone, so match any June day)
    expect(html).toContain('5 д 18 ч')
    expect(html).toMatch(/Путешествие Aelirien началось \d{1,2} июня 2026 г\./)
    expect(html).not.toContain('..')
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

// the real addon's manual-memory markers (MANUAL_MEMORY/USER) against an
// automatic RECORDED event with the same template-looking text
const markerJournal: Journal = {
  ...demoJournal,
  memories: [
    {
      type: 'MANUAL_MEMORY',
      typeLabel: 'MEMORY',
      source: 'USER',
      title: 'Reached Level 20',
      description: 'Your journey continues.',
      personalNote: '',
      favorite: false,
      timestamp: Date.UTC(2026, 4, 5, 12),
      location: 'Undercity',
    },
    {
      type: 'LEVEL',
      typeLabel: 'LEVEL',
      source: 'RECORDED',
      title: 'Reached Level 20',
      description: 'Reached level 20.',
      personalNote: '',
      favorite: false,
      timestamp: Date.UTC(2026, 4, 6, 12),
      location: 'Undercity',
    },
  ],
}

describe('manual memory markers (web preview)', () => {
  it('RU preview keeps the manual text verbatim and translates the recorded twin', () => {
    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={markerJournal}
        meta={meta}
      />
    )
    expect(html).toContain('Reached Level 20') // manual title kept
    expect(html).toContain('Your journey continues.') // manual description kept
    expect(html).toContain('Достигнут 20-й уровень') // recorded twin translated
    expect(html).toContain('Достигнут уровень 20.')
    expect(html).toContain('Воспоминание') // MEMORY type label in RU
  })

  it('EN preview keeps everything as imported', () => {
    const html = renderToString(
      <Book
        tr={strings.en}
        lang="en"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={markerJournal}
        meta={meta}
      />
    )
    expect(html).toContain('Reached Level 20')
    expect(html).toContain('Your journey continues.')
    expect(html).toContain('MEMORY')
  })
})
