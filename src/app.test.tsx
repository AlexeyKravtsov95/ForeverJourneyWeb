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
    expect(html).toContain('Уровень повышен до 20') // recorded twin translated
    expect(html).toContain('Достигнут уровень 20.')
    expect(html).toContain('ВОСПОМИНАНИЕ') // MEMORY type label in RU
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

  it('a picked character renders a full book with the archive snapshot clearly labeled historical', () => {
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
        meta={{ kind: 'savedvariables' as const, schema: sv.schemaVersion, memories: 14, archive: true }}
      />
    )
    // manual texts survive verbatim (newlines and quotes included)
    expect(html).toContain('Первая ночь в Тирисфале')
    expect(html).toContain('Первая запись.')
    expect(html).toContain('Табличка на мосту')
    // derived automatic-event text is localized like the addon's own export
    expect(html).toContain('Открыта локация: Tirisfal Glades')
    expect(html).toContain('Пал в бою — Worgen Packleader')
    expect(html).toContain('Последний удар: Rake.')
    expect(html).toContain('Утонул') // environmental death: ENVIRONMENT_TITLE_KEYS
    expect(html).toContain('Уровень повышен до 6')
    expect(html).toContain('Путешествие продолжается.') // MEMORY_DESCRIPTION_LEVEL
    expect(html).toContain('Выполнено 25 заданий')
    expect(html).toContain('Вход в подземелье: The Deadmines')
    // boss victory: encounter name verbatim, fixed localized description
    expect(html).toContain('Edwin VanCleef')
    expect(html).toContain('Сражение завершилось победой.')
    expect(html).not.toContain('Последний удар: Pyroblast.')
    // profession milestones of both kinds
    expect(html).toContain('Изучена профессия: Алхимия')
    expect(html).toContain('Алхимия: навык повышен до 150')
    expect(html).toContain('ПРОФЕССИЯ')
    // known types get the addon's RU labels; the unknown type keeps its own text
    expect(html).toContain('ОТКРЫТИЕ')
    expect(html).toContain('Смерть')
    expect(html).toContain('УРОВЕНЬ')
    expect(html).toContain('PVP DUEL')
    // equal timestamps keep the import order in the rendered book
    expect(html.indexOf('Выполнено 25 заданий')).toBeLessThan(
      html.indexOf('Открыта локация: Western Plaguelands')
    )
    // the archive shows the recoveredHistory snapshot — but only inside its
    // own clearly-labeled historical section, never as current stats
    expect(html).toContain('Архив персонажа')
    expect(html).toContain('Исторический снимок')
    expect(html).toContain(
      'Исторический снимок из SavedVariables. Значения могут не соответствовать последнему состоянию персонажа.'
    )
    // the addon's death counter (1) lives in the introduction; the archive
    // only explains where the number comes from
    expect(html).toContain('Смертей')
    expect(html).toContain(
      'Общее число смертей во вступлении — сохранённый счётчик аддона: летопись сохраняет лишь часть смертей как воспоминания.'
    )
    expect(html).not.toContain('Сохранённая статистика')
    // this file carries no professions or visited zones → sections stay hidden
    expect(html).not.toContain('Посещённые локации')
  })

  it('an empty character renders the empty chronicle; the saved zero counter lives in the introduction only', () => {
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
        meta={{ kind: 'savedvariables' as const, schema: 3, memories: 0, archive: true }}
      />
    )
    expect(html).toContain('Летопись ждёт первой записи.')
    // no snapshot in this file → its labels never appear
    expect(html).not.toContain('Квестов выполнено')
    expect(html).not.toContain('Времени в игре')
    expect(html).not.toContain('Исторический снимок')
    // stats.deaths = 0 is declared by the addon — a real zero may show as 0,
    // but in the introduction now: with no snapshot/professions/zones the
    // archive itself has nothing to show and must not render at all (the
    // toolbar badge may still mention the archival source)
    expect(html).toContain('Смертей')
    expect(html).not.toContain('sheet--archive')
    expect(html).not.toContain('Сохранённая статистика')
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

describe('Character Archive (web, FJ-WEB-06)', () => {
  const STRAIDER = 'ClassicBetaPvP:Straider'
  const straiderJournal = () => {
    const lua = readFileSync(
      new URL('../fixtures/savedvariables/ForeverJourney-straider.lua', import.meta.url),
      'utf8'
    )
    const sv = readSavedVariables(lua)
    if (sv.status !== 'ok') throw new Error('straider fixture must parse')
    const journal = buildJournalFromSavedVariables(sv, STRAIDER)
    if (!journal) throw new Error('straider journal must build')
    return journal
  }

  const renderBook = (journal: Journal, lang: 'en' | 'ru') =>
    renderToString(
      <Book
        tr={strings[lang]}
        lang={lang}
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={journal}
        meta={{ kind: 'savedvariables' as const, schema: 3, memories: 7, archive: true }}
      />
    )

  it('renders the complete Straider archive in Russian with every value in its section', () => {
    const html = renderBook(straiderJournal(), 'ru')
    // section title and the explicitly required disclaimer
    expect(html).toContain('Архив персонажа')
    expect(html).toContain('Исторический снимок')
    expect(html).toContain(
      'Исторический снимок из SavedVariables. Значения могут не соответствовать последнему состоянию персонажа.'
    )
    // snapshot: level 25, both play times exact to the second, snapshot date;
    // the quest counter moved to the Quest Registry and is not repeated here
    expect(html).toContain('25')
    expect(html).toContain('2 д 3 ч 2 мин 34 с')
    expect(html).toContain('3 ч 17 мин 7 с')
    expect(html).toContain('Время игры на уровне')
    expect(html).toContain('Дата снимка')
    // economy: the four saved figures with provenance labels and the disclaimer
    expect(html).toContain('Экономика')
    expect(html).toContain('9g 61s 79c')
    expect(html).toContain('9g 7s 20c')
    expect(html).toContain('28s 33c')
    expect(html).toContain('82s 92c')
    expect(html).toContain('Баланс на момент снимка')
    expect(html).toContain('Последний сохранённый баланс')
    expect(html).toContain('Учтённые поступления')
    expect(html).toContain('Учтённые расходы')
    expect(html).toContain('могут не отражать окончательное состояние')
    // quest registry: both saved values with the neutral mismatch note
    expect(html).toContain('Реестр заданий')
    expect(html).toContain('182')
    expect(html).toContain('209')
    expect(html).toContain('Сохранённый счётчик заданий')
    expect(html).toContain('Сохранённых ID заданий')
    expect(html).toContain(
      'Счётчик заданий и количество сохранённых ID различаются в исходном файле. Данные показаны без изменений.'
    )
    expect(html).toContain('Названия заданий в файле не сохраняются')
    // the ID list sits inside a collapsible block, all 209 of them
    expect(html).toContain('<details class="quests__details">')
    expect(html).toContain('Сохранённые ID заданий (209)')
    expect((html.match(/class="quests__id"/g) ?? []).length).toBe(209)
    expect(html).toContain('Скачать CSV')
    // professions with saved skill/maximum pairs (no invented skills)
    expect(html).toContain('Профессии')
    expect(html).toContain('Горное дело')
    expect(html).toContain('94 / 150')
    expect(html).toContain('Инженерное дело')
    expect(html).toContain('91 / 150')
    expect(html).toContain('Кулинария')
    expect(html).toContain('25 / 75')
    // six visited zones from the real mapID form, chronological in the list;
    // the numeric identifiers must never surface as zone names
    expect(html).toContain('Посещённые локации')
    expect((html.match(/zone__name/g) ?? []).length).toBe(6)
    const zoneOrder = ['Калимдор', 'Ясеневый лес', 'Азшара', 'Дуротар', 'Оргриммар', 'Степи']
    for (const name of zoneOrder) expect(html).toContain(name)
    for (let index = 1; index < zoneOrder.length; index++) {
      expect(html.indexOf(zoneOrder[index - 1])).toBeLessThan(html.indexOf(zoneOrder[index]))
    }
    expect(html).not.toContain('1447')
    expect(html).not.toContain('1440')
    expect(html).not.toContain('1411')
    expect(html).not.toContain('1454')
    // the intro already shows the overall counters (24 deaths, 7 memories);
    // the archive only explains where the death number comes from
    expect(html).toContain('24')
    expect(html).toContain('Воспоминаний')
    expect(html).not.toContain('Сохранённая статистика')
    expect(html).toContain(
      'Общее число смертей во вступлении — сохранённый счётчик аддона: летопись сохраняет лишь часть смертей как воспоминания.'
    )
    // the toolbar states the archival source
    expect(html).toContain('Архив персонажа')
  })

  it('renders the same archive in English', () => {
    const html = renderBook(straiderJournal(), 'en')
    expect(html).toContain('Character Archive')
    expect(html).toContain('Historical Snapshot')
    expect(html).toContain(
      'Historical snapshot from SavedVariables. These values may not represent the character\u2019s final state.'
    )
    expect(html).toContain('3h 17m 7s')
    expect(html).toContain('Time played at recorded level')
    expect(html).toContain('Economy')
    expect(html).toContain('Balance at snapshot')
    expect(html).toContain('Last recorded balance')
    expect(html).toContain('Tracked gains')
    expect(html).toContain('Tracked spending')
    expect(html).toContain('Saved by the addon')
    expect(html).toContain('Quest Registry')
    expect(html).toContain('Saved quest counter')
    expect(html).toContain('Saved quest IDs')
    expect(html).toContain(
      'The saved quest counter and the number of recorded IDs differ in the source file. Both values are preserved as recorded.'
    )
    expect(html).toContain('Saved quest IDs (209)')
    expect(html).toContain('Download CSV')
    expect(html).toContain('Professions')
    expect(html).toContain('Explored Locations')
    expect(html).not.toContain('Saved Statistics')
    expect(html).toContain(
      'The death total in the introduction is the addon\u2019s saved counter — the chronicle keeps only some deaths as memories.'
    )
    expect(html).toContain('2d 3h 2m 34s')
    expect(html).toContain('94 / 150')
  })

  it('different characters keep separate registries: Testpilot shows its own values only', () => {
    const lua = readFileSync(
      new URL('../fixtures/savedvariables/ForeverJourney-straider.lua', import.meta.url),
      'utf8'
    )
    const sv = readSavedVariables(lua)
    if (sv.status !== 'ok') throw new Error('straider fixture must parse')
    const journal = buildJournalFromSavedVariables(sv, 'ClassicBetaPvP:Testpilot')
    if (!journal) throw new Error('journal must build')
    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={journal}
        meta={{ kind: 'savedvariables' as const, schema: 3, memories: 1, archive: true }}
      />
    )
    // Testpilot's registry: its own 3 IDs and its mismatch note
    expect(html).toContain('12')
    expect(html).toContain('Сохранённых ID заданий')
    expect((html.match(/class="quests__id"/g) ?? []).length).toBe(3)
    expect(html).toContain('7')
    expect(html).toContain('11')
    expect(html).toContain('13')
    // its economy carries no snapshot balance — only the tracked values
    expect(html).toContain('12s 34c') // 1234 copper
    expect(html).not.toContain('Баланс на момент снимка')
    expect(html).toContain('5s') // 500 earned
    expect(html).toContain('1s') // 100 spent
    // Straider's figures must not leak into Testpilot's book
    expect(html).not.toContain('9g 61s 79c')
    expect(html).not.toContain('Сохранённые ID заданий (209)')
  })

  it('the quest registry CSV is built locally from the journal only, with no network', async () => {
    // buildQuestRegistryCsv is the exact string the download button saves:
    // valid IDs only, one column, no other characters' data, no names
    const { buildQuestRegistryCsv } = await import('./lib/archive')
    const journal = straiderJournal()
    const ids = journal.archive?.recovered?.questIDs ?? []
    expect(ids).toHaveLength(209)
    const csv = buildQuestRegistryCsv(ids)
    expect(csv.split('\n').filter(Boolean)).toEqual(['quest_id', ...ids.map(String)])
    // the character name never rides along in the data payload
    expect(csv).not.toContain('Straider')
  })

  it('a confirmed empty quest list shows 0 and the mismatch note, without a collapsible or CSV button', () => {
    // questIDs: [] — the file declared the list and it is empty; the count is
    // a real 0, not an unknown (an absent field would hide the tile instead)
    const journal: Journal = {
      format: 'FJJOURNAL',
      formatVersion: 1,
      addonVersion: '0.9.8',
      locale: '',
      character: { name: 'Straider', race: '', class: '', level: 0 },
      journey: {},
      memories: [],
      archive: {
        recovered: { completedQuests: 182, questIDs: [] },
        professions: [],
        zones: [],
      },
    }
    const html = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={journal}
        meta={{ kind: 'savedvariables' as const, schema: 3, memories: 0, archive: true }}
      />
    )
    expect(html).toContain('Реестр заданий')
    expect(html).toContain('Сохранённый счётчик заданий')
    expect(html).toContain('182')
    expect(html).toContain('Сохранённых ID заданий')
    expect(html).toContain('<span class="stat__value">0</span>')
    expect(html).toContain(
      'Счётчик заданий и количество сохранённых ID различаются в исходном файле. Данные показаны без изменений.'
    )
    // no empty collapsible list, no dead CSV button, no "(0)" toggle suffix
    expect(html).not.toContain('<details')
    expect(html).not.toContain('quests__csv')
    expect(html).not.toContain('Скачать CSV')
    expect(html).not.toContain('Сохранённые ID заданий (')
  })

  it('shows no archive section for FJBOOK1 journals (demo keeps working)', () => {
    const en = renderToString(
      <Book
        tr={strings.en}
        lang="en"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={demoJournal}
        meta={fjMeta}
      />
    )
    expect(en).toContain('My Journey') // the demo book itself renders as before
    expect(en).not.toContain('Character Archive')
    expect(en).not.toContain('Historical Snapshot')

    const ru = renderToString(
      <Book
        tr={strings.ru}
        lang="ru"
        onLangChange={() => undefined}
        onBack={() => undefined}
        journal={demoJournal}
        meta={fjMeta}
      />
    )
    expect(ru).not.toContain('Архив персонажа')
  })

  it('the landing explains the difference between the two import ways in both languages', () => {
    const en = landing('en')
    expect(en).toContain('A book from the in-game export')
    expect(en).toContain('a Character Archive with whatever the file preserved')

    const ru = landing('ru')
    expect(ru).toContain('Книга из игрового экспорта')
    expect(ru).toContain('архивом персонажа из того, что сохранилось в файле')
  })
})

describe('GROWTH-01: addon link, own-book note and the Mythweld credit', () => {
  it('Landing links the CurseForge addon page and explains what an own book needs (EN)', () => {
    const html = landing('en')
    expect(html).toContain('href="https://www.curseforge.com/wow/addons/forever-journey"')
    expect(html).toContain('Get the Forever Journey addon')
    expect(html).toContain(
      'To bind your own book you need data from the Forever Journey addon — an in-game export code or the ForeverJourney.lua file.'
    )
    expect(html).toContain('The demo journal works without the addon.')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('Landing несёт ссылку на CurseForge и пояснение про собственную книгу (RU)', () => {
    const html = landing('ru')
    expect(html).toContain('href="https://www.curseforge.com/wow/addons/forever-journey"')
    expect(html).toContain('Скачать аддон Forever Journey')
    expect(html).toContain(
      'Чтобы собрать собственную книгу, нужны данные аддона Forever Journey — экспортный код из игры или файл ForeverJourney.lua.'
    )
    expect(html).toContain('Демо-журнал работает без установки аддона.')
  })

  it('the Mythweld credit never renders before the availability probe answers', () => {
    // the render before the probe resolves (and any server markup) carries
    // no mythweld link — a dead site must never be linked
    const en = landing('en')
    expect(en).not.toContain('mythweld.com')
    expect(en).not.toContain('By Mythweld')
    const ru = landing('ru')
    expect(ru).not.toContain('Проект Mythweld')
  })
})
