import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import App from './App'
import Book from './components/Book'
import CharacterPicker from './components/CharacterPicker'
import Landing from './components/Landing'
import { buildDemoCode, demoJournal } from './demo/demoJournal'
import { strings } from './i18n'
import { importJournal } from './lib/fjbook'
import type { Journal } from './lib/journal'
import { buildJournalFromSavedVariables, readSavedVariables } from './lib/savedvariables'

const fjMeta = { kind: 'fjbook' as const, parts: 4 }

const fixtureLua = () =>
  readFileSync(new URL('../fixtures/savedvariables/ForeverJourney.lua', import.meta.url), 'utf8')

const landing = (lang: 'en' | 'ru') =>
  renderToString(
    <Landing
      tr={strings[lang]}
      lang={lang}
      onLangChange={() => undefined}
      onImported={() => undefined}
      onSavedVariables={() => undefined}
    />
  )

describe('rendering', () => {
  it('Landing shows the brand, subtitle, import and demo controls in English', () => {
    const html = landing('en')
    expect(html).toContain('Forever Journey')
    expect(html).toContain('Turn your adventures into a story worth keeping')
    expect(html).toContain('Import Journal')
    expect(html).toContain('Try Demo Journal')
  })

  it('Landing renders fully in Russian', () => {
    const html = landing('ru')
    expect(html).toContain('Импортировать журнал')
    expect(html).toContain('Демо-журнал')
  })

  it('Landing offers both import ways with the SavedVariables path instruction', () => {
    const html = landing('en')
    expect(html).toContain('Import SavedVariables')
    expect(html).toContain('Paste export code')
    expect(html).toContain('WTF/Account/&lt;ACCOUNT&gt;/SavedVariables/ForeverJourney.lua')
    expect(html).toContain('/reload')
    expect(html).toContain('type="file"')
  })

  it('Landing показывает оба способа и путь к файлу на русском', () => {
    const html = landing('ru')
    expect(html).toContain('Импортировать SavedVariables')
    expect(html).toContain('Вставить экспортный код')
    expect(html).toContain('WTF/Account/&lt;ACCOUNT&gt;/SavedVariables/ForeverJourney.lua')
  })

  it('Book renders cover, introduction and memories with Cyrillic notes', () => {
    const html = renderToString(
      <Book
        tr={strings.en}
        lang="en"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={demoJournal}
        meta={fjMeta}
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
        meta={fjMeta}
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App initial language', () => {
  it('renders the Russian landing on a first visit with a Russian browser', () => {
    vi.stubGlobal('navigator', { languages: ['ru-RU', 'en-US'], language: 'ru-RU' })
    const html = renderToString(<App />)
    expect(html).toContain('Импортировать журнал')
  })

  it('renders in English and does not crash when localStorage is unavailable', () => {
    // simulate a runtime without storage (the node test env has none either)
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
    vi.stubGlobal('localStorage', undefined)
    const html = renderToString(<App />)
    expect(html).toContain('Import Journal')
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
        meta={fjMeta}
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
        meta={fjMeta}
      />
    )
    expect(html).toContain('Reached Level 20')
    expect(html).toContain('Your journey continues.')
    expect(html).toContain('MEMORY')
  })
})

describe('SavedVariables import (UI)', () => {
  const readFixture = () => readSavedVariables(fixtureLua())
  const aelirienKey = 'Гордунни:Аэлириэн'

  it('CharacterPicker lists every character with realm, counts and dates', () => {
    const sv = readFixture()
    if (sv.status !== 'ok') throw new Error('fixture must parse')
    expect(sv.characters).toHaveLength(3)
    const html = renderToString(
      <CharacterPicker
        tr={strings.ru}
        lang="ru"
        sv={sv}
        fileName="ForeverJourney.lua"
        onLangChange={() => undefined}
        onPick={() => undefined}
        onCancel={() => undefined}
      />
    )
    expect(html).toContain('Выберите персонажа')
    expect(html).toContain('Аэлириэн')
    expect(html).toContain('Мрограмар')
    expect(html).toContain('Thalorien')
    expect(html).toContain('Гордунни')
    expect(html).toContain('Silvermoon')
    expect(html).toContain('воспоминаний: 14')
  })

  it('CharacterPicker in English mirrors the Russian view', () => {
    const sv = readFixture()
    if (sv.status !== 'ok') throw new Error('fixture must parse')
    const html = renderToString(
      <CharacterPicker
        tr={strings.en}
        lang="en"
        sv={sv}
        fileName="ForeverJourney.lua"
        onLangChange={() => undefined}
        onPick={() => undefined}
        onCancel={() => undefined}
      />
    )
    expect(html).toContain('Choose a character')
    expect(html).toContain('14 memories')
    expect(html).toContain('2 favorite(s)')
  })

  it('a picked character renders a full book with hidden unknown stats', () => {
    const sv = readFixture()
    if (sv.status !== 'ok') throw new Error('fixture must parse')
    const journal = buildJournalFromSavedVariables(sv, aelirienKey)
    if (!journal) throw new Error('journal must build')
    expect(journal.character.name).toBe('Аэлириэн')
    expect(journal.memories).toHaveLength(14)

    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={journal}
        meta={{ kind: 'savedvariables' as const, schema: sv.schemaVersion, memories: 14 }}
      />
    )
    // manual texts survive verbatim (newlines and quotes included)
    expect(html).toContain('Первая ночь в Тирисфале')
    expect(html).toContain('Первая запись.')
    expect(html).toContain('Табличка на мосту')
    // derived automatic-event text is localized like the addon's own export
    expect(html).toContain('Открыта зона: Tirisfal Glades')
    expect(html).toContain('Пал в бою — Worgen Packleader')
    expect(html).toContain('Последний удар: Rake.')
    expect(html).toContain('Утонул') // environmental death: ENVIRONMENT_TITLE_KEYS
    expect(html).toContain('Достигнут 6-й уровень')
    expect(html).toContain('Путешествие продолжается.') // MEMORY_DESCRIPTION_LEVEL
    expect(html).toContain('Выполнено заданий: 25')
    expect(html).toContain('Вход в подземелье: The Deadmines')
    // boss victory: encounter name verbatim, fixed localized description
    expect(html).toContain('Edwin VanCleef')
    expect(html).toContain('Битва завершилась победой.')
    expect(html).not.toContain('Последний удар: Pyroblast.')
    // profession milestones of both kinds
    expect(html).toContain('Изучена профессия: Алхимия')
    expect(html).toContain('Алхимия: навык 150')
    expect(html).toContain('Этап профессии')
    // known types get RU labels; the unknown type keeps its own text
    expect(html).toContain('Зона открыта')
    expect(html).toContain('Смерть')
    expect(html).toContain('Новый уровень')
    expect(html).toContain('PVP DUEL')
    // equal timestamps keep the import order in the rendered book
    expect(html.indexOf('Выполнено заданий: 25')).toBeLessThan(
      html.indexOf('Открыта зона: Western Plaguelands')
    )
    // SavedVariables has no live level/race/class/quests/play time — no fake
    // zeros, and the recoveredHistory snapshot is not shown as current stats
    expect(html).not.toContain('Квестов выполнено')
    expect(html).not.toContain('Времени в игре')
    expect(html).not.toContain('Уровень</span>')
    // the addon's own death counter is shown
    expect(html).toContain('Смертей')
  })

  it('an empty character renders the empty chronicle without fake stats', () => {
    const sv = readFixture()
    if (sv.status !== 'ok') throw new Error('fixture must parse')
    const journal = buildJournalFromSavedVariables(sv, 'Гордунни:Мрограмар')
    if (!journal) throw new Error('journal must build')
    expect(journal.memories).toHaveLength(0)
    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={journal}
        meta={{ kind: 'savedvariables' as const, schema: 3, memories: 0 }}
      />
    )
    expect(html).toContain('Летопись ждёт первой записи.')
    // stats.deaths = 0 in the file → the addon counter says zero, it may show 0
    expect(html).not.toContain('Квестов выполнено')
    expect(html).not.toContain('Времени в игре')
  })

  it('the whole SavedVariables pipeline runs without touching the network', async () => {
    const explodingFetch = () => {
      throw new Error('network access during SavedVariables import')
    }
    vi.stubGlobal('fetch', explodingFetch)
    const sv = readSavedVariables(fixtureLua())
    if (sv.status !== 'ok') throw new Error('fixture must parse')
    const journal = buildJournalFromSavedVariables(sv, aelirienKey)
    expect(journal).not.toBeNull()
    expect(journal?.memories.length).toBe(14)
  })
})
