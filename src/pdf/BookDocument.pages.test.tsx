// FJ-WEB-06.1 page-level PDF regression suite: renders real books through
// the node build of @react-pdf (the same component the browser downloads)
// and verifies actual page counts and per-page contents with a real text
// extractor (unpdf). The buffer-size smoke checks of BookDocument.test.tsx
// could not catch an almost-empty page, which is exactly what this guards:
// a shrinking book must lose the duplicate page, never the data.
import { describe, expect, it } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { renderToString } from 'react-dom/server'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { BookDocument } from './BookDocument'
import { registerBookFonts } from './registerFonts'
import { extractPdfPages, pdfContains, pdfPageContains, pdfPageCount } from './pdfText'
import { demoJournal } from '../demo/demoJournal'
import { strings } from '../i18n'
import type { Journal } from '../lib/journal'
import { buildJournalFromSavedVariables, readSavedVariables } from '../lib/savedvariables'
import Book from '../components/Book'

const fontPath = (name: string) => fileURLToPath(new URL(`./fonts/${name}`, import.meta.url))

registerBookFonts({
  regular: fontPath('PT_Serif-Web-Regular.ttf'),
  italic: fontPath('PT_Serif-Web-Italic.ttf'),
  bold: fontPath('PT_Serif-Web-Bold.ttf'),
  boldItalic: fontPath('PT_Serif-Web-BoldItalic.ttf'),
})

const RENDER_TIMEOUT = 120_000

function svJournal(file: string, characterKey: string): Journal {
  const lua = readFileSync(new URL(`../../fixtures/savedvariables/${file}`, import.meta.url), 'utf8')
  const sv = readSavedVariables(lua)
  if (sv.status !== 'ok') throw new Error(`${file} must parse`)
  const journal = buildJournalFromSavedVariables(sv, characterKey)
  if (!journal) throw new Error(`journal for ${characterKey} must build`)
  return journal
}

async function renderPages(journal: Journal, lang: 'en' | 'ru'): Promise<string[]> {
  const buffer = await renderToBuffer(
    <BookDocument journal={journal} tr={strings[lang]} lang={lang} />
  )
  return extractPdfPages(buffer)
}

// Synthetic journals for archive layout scenarios: built directly on the
// validated model, exactly what buildJournalFromSavedVariables produces.
const journalWithArchive = (archive: Journal['archive']): Journal => ({
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '0.9.8',
  locale: '',
  character: { name: 'Straider', race: '', class: '', level: 0 },
  journey: {},
  memories: [],
  ...(archive ? { archive } : {}),
})

describe('BookDocument pages (FJ-WEB-06.1)', () => {
  it.each(['ru', 'en'] as const)(
    'Straider (7 memories, one calendar day): 6 pages, archive spans two, no Saved Statistics page (%s)',
    async (lang) => {
      const pages = await renderPages(
        svJournal('ForeverJourney-straider.lua', 'ClassicBetaPvP:Straider'),
        lang
      )
      const tr = strings[lang]

      // cover + intro + two archive pages (snapshot/economy/registry, then
      // professions/zones) + the single October chapter + end page
      expect(pages).toHaveLength(6)

      // cover: the name and ONE date — a same-day journey never renders
      // "10 октября 2026 г. — 10 октября 2026 г." twice-over
      expect(pdfPageContains(pages[0], 'Straider')).toBe(true)
      const coverDate = lang === 'ru' ? '10 октября 2026 г.' : 'October 10, 2026'
      expect(pdfPageCount(pages[0], coverDate)).toBe(1)

      // introduction owns the overall counters now: 24 deaths, 7 memories
      expect(pdfPageContains(pages[1], tr.introTitle)).toBe(true)
      expect(pdfPageContains(pages[1], tr.statDeaths)).toBe(true)
      expect(pdfPageContains(pages[1], '24')).toBe(true)
      expect(pdfPageContains(pages[1], tr.statMemories)).toBe(true)
      expect(pdfPageContains(pages[1], '7')).toBe(true)

      // first archive page: the snapshot (with the exact time at the recorded
      // level), the four economy figures, and the quest registry summary
      expect(pdfPageContains(pages[2], tr.archiveTitle)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveSnapshotTitle)).toBe(true)
      expect(pdfPageContains(pages[2], '25')).toBe(true)
      expect(
        pdfPageContains(pages[2], lang === 'ru' ? '2 д 3 ч 2 мин 34 с' : '2d 3h 2m 34s')
      ).toBe(true)
      expect(
        pdfPageContains(pages[2], lang === 'ru' ? '3 ч 17 мин 7 с' : '3h 17m 7s')
      ).toBe(true)
      expect(pdfPageContains(pages[2], tr.archivePlayedAtLevel)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomyTitle)).toBe(true)
      expect(pdfPageContains(pages[2], '9g 61s 79c')).toBe(true)
      expect(pdfPageContains(pages[2], '9g 7s 20c')).toBe(true)
      expect(pdfPageContains(pages[2], '28s 33c')).toBe(true)
      expect(pdfPageContains(pages[2], '82s 92c')).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomySnapshotBalance)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomyLastBalance)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomyGains)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomySpending)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveEconomyNote)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveQuestsTitle)).toBe(true)
      expect(pdfPageContains(pages[2], '182')).toBe(true)
      expect(pdfPageContains(pages[2], '209')).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveQuestCounter)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveQuestIdsCount)).toBe(true)
      // the counter/ID disagreement is spelled out, exactly once
      expect(pdfPageContains(pages[2], tr.archiveQuestMismatchNote)).toBe(true)
      // the raw IDs themselves are NOT printed — the web view and the CSV own them
      expect(pdfPageContains(pages[2], '235')).toBe(false)
      expect(pdfPageContains(pages[2], '264')).toBe(false)

      // second archive page: professions, zones and the counter note — a
      // follow-up page with real content, not a near-empty overflow
      expect(pdfPageContains(pages[3], tr.archiveProfessionsTitle)).toBe(true)
      expect(pdfPageContains(pages[3], '94 / 150')).toBe(true)
      expect(pdfPageContains(pages[3], 'Горное дело')).toBe(true)
      expect(pdfPageContains(pages[3], tr.archiveZonesTitle)).toBe(true)
      expect(pdfPageContains(pages[3], 'Оргриммар')).toBe(true)
      expect(pdfPageContains(pages[3], tr.archiveDeathsSourceNote)).toBe(true)

      // the chronicle chapter keeps its memories; the book ends in one page
      expect(pdfPageContains(pages[4], lang === 'ru' ? 'октября 2026' : 'October 2026')).toBe(true)
      expect(pdfPageContains(pages[4], 'Dun Morogh')).toBe(true)
      expect(pdfPageContains(pages[5], tr.endTitle)).toBe(true)

      // the duplicate Saved Statistics page is gone — in either language,
      // on any page
      expect(
        pdfContains(pages, lang === 'ru' ? 'Сохранённая статистика' : 'Saved Statistics')
      ).toBe(false)
    },
    RENDER_TIMEOUT
  )

  it(
    'FJBOOK1 demo journal (EN): multi-day cover range, no archive pages',
    async () => {
      const pages = await renderPages(demoJournal, 'en')

      // multi-day journey keeps the range on the cover: two dates joined by
      // an em-dash (the exact days are the runner's local calendar, so the
      // structural shape is asserted — two year stamps, one dash between)
      expect(pdfPageCount(pages[0], '2026')).toBe(2)
      expect(pdfPageContains(pages[0], '2026 —')).toBe(true)

      // FJBOOK1 never carries an archive — and none is invented
      expect(pdfContains(pages, 'Character Archive')).toBe(false)
      expect(pdfContains(pages, 'Historical Snapshot')).toBe(false)
      expect(pdfPageContains(pages[1], 'Introduction')).toBe(true)
      expect(pdfContains(pages, 'The journey continues')).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'empty SavedVariables character (RU): no archive page, counters stay in the introduction',
    async () => {
      const pages = await renderPages(svJournal('ForeverJourney.lua', 'Гордунни:Мрограмар'), 'ru')

      // cover + intro + empty chronicle + end — the archive has no content
      // (snapshot/professions/zones all absent), so it renders no page
      expect(pages).toHaveLength(4)
      expect(pdfContains(pages, 'Архив персонажа')).toBe(false)
      expect(pdfPageContains(pages[1], 'Смертей')).toBe(true)
      expect(pdfContains(pages, 'Летопись ждёт первой записи.')).toBe(true)
    },
    RENDER_TIMEOUT
  )

  it(
    'snapshot-only archive (RU): one archive page, no professions/zones blocks',
    async () => {
      const pages = await renderPages(svJournal('ForeverJourney.lua', 'Гордунни:Аэлириэн'), 'ru')

      expect(pdfContains(pages, 'Архив персонажа')).toBe(true)
      expect(pdfContains(pages, 'Исторический снимок')).toBe(true)
      // partially filled archive: the missing blocks never appear
      expect(pdfContains(pages, 'Профессии')).toBe(false)
      expect(pdfContains(pages, 'Посещённые локации')).toBe(false)
      // and the saved death counter is explained, not duplicated
      expect(pdfContains(pages, strings.ru.archiveDeathsSourceNote)).toBe(true)
      expect(pdfContains(pages, 'Сохранённая статистика')).toBe(false)
    },
    RENDER_TIMEOUT
  )

  it(
    'large archive with long names (RU): zones may span pages, nothing is cut',
    async () => {
      const longZoneNames = Array.from(
        { length: 60 },
        (_, index) => `Внутренние земли Проклятого леса восточного континента, маршрут №${index + 1}`
      )
      const journal = journalWithArchive({
        recovered: { level: 60, playedTotal: 1_234_567 },
        professions: [
          {
            name: 'Алхимия трансмутаций и настоев восточных королевств',
            skillLevel: 300,
            maxSkillLevel: 300,
          },
        ],
        zones: longZoneNames.map((name, index) => ({
          name,
          firstSeenAt: Date.UTC(2026, 9, 10, 6) + index * 60_000,
        })),
      })

      const pages = await renderPages(journal, 'ru')

      // the zone list overflows a single A4 page — multiple pages are fine,
      // but every entry must survive (no truncation of long names)
      expect(pages.length).toBeGreaterThan(6)
      for (const name of longZoneNames) {
        expect(pdfContains(pages, name)).toBe(true)
      }
      expect(pdfContains(pages, 'Алхимия трансмутаций и настоев восточных королевств')).toBe(true)
      expect(pdfContains(pages, '14 д 6 ч 56 мин 7 с')).toBe(true) // 1234567 s exactly
      // the heading appears once — it is not re-rendered per overflow page
      const headingPages = pages.filter((page) => pdfPageContains(page, 'Посещённые локации'))
      expect(headingPages).toHaveLength(1)
    },
    RENDER_TIMEOUT
  )
})

describe('BookDocument pages — author chapters (FJ-WEB-03)', () => {
  const STORYTELLER = 'Гордунни:Сказитель'
  const storytellerJournal = () =>
    svJournal('ForeverJourney-chapters.lua', STORYTELLER)

  // the merged section sequence: one March month section, two author chapters,
  // the May month section (dangling binding fell back to it) and the undated
  // section — the empty chapter g-3 renders nothing
  const SECTION_LABELS = [
    'март 2026',
    'Затерянные берега',
    'Тени Сумеречного леса',
    'май 2026',
    'Воспоминания без даты',
  ]

  it(
    'Сказитель (RU): every section starts a fresh page, the description follows the title as text',
    async () => {
      const pages = await renderPages(storytellerJournal(), 'ru')
      const tr = strings.ru

      // cover + intro + five section pages + end page; no archive — the
      // fixture carries no snapshot, no professions and no tracked money
      expect(pages).toHaveLength(8)

      // roman numbering continues across the merged sections
      expect(pdfPageContains(pages[2], 'ГЛАВА I')).toBe(true)
      expect(pdfPageContains(pages[3], 'ГЛАВА II')).toBe(true)
      expect(pdfPageContains(pages[4], 'ГЛАВА III')).toBe(true)

      // the closed chapter: title, then the multi-line description right
      // after it — extractable Cyrillic text, not an image
      expect(pdfPageContains(pages[3], 'Затерянные берега')).toBe(true)
      expect(pdfPageContains(pages[3], 'Дни, когда карты кончились и начался прибой')).toBe(true)
      expect(pdfPageContains(pages[3], 'Вторая строка — проверить перенос строк в описании')).toBe(true)
      // the open chapter renders the same way
      expect(pdfPageContains(pages[4], 'Тени Сумеречного леса')).toBe(true)
      expect(pdfPageContains(pages[4], 'Открытая глава: закрытия ещё не было')).toBe(true)

      // the dangling binding fell back to its month section — not lost
      expect(pdfPageContains(pages[5], 'май 2026')).toBe(true)
      expect(pdfPageContains(pages[5], 'Запись без главы')).toBe(true)
      expect(pdfPageContains(pages[6], tr.undatedChapter)).toBe(true)
      expect(pdfPageContains(pages[6], 'Совсем без даты')).toBe(true)
      expect(pdfPageContains(pages[7], tr.endTitle)).toBe(true)

      // the empty author chapter renders nothing anywhere
      expect(pdfContains(pages, 'Пустая глава')).toBe(false)
      expect(pdfContains(pages, 'Создана заранее')).toBe(false)

      // every memory survived: all nine titles are extractable text (system
      // titles in their RU rendering, player text verbatim)
      for (const title of [
        'Первый костёр на западном берегу',
        'Открыта локация: Tirisfal Glades',
        'Открыта локация: Lost Coast',
        'Пал в бою — Murloc Tidehunter',
        'Тени между сосен',
        'Запись без даты в главе',
        'Запись без главы',
        'Совсем без даты',
        'Уровень повышен до 11',
      ]) {
        expect(pdfContains(pages, title)).toBe(true)
      }
    },
    RENDER_TIMEOUT
  )

  it(
    'web book and PDF carry the same sections in the same order (parity)',
    async () => {
      const journal = storytellerJournal()
      const html = renderToString(
        <Book
          tr={strings.ru}
          lang="ru"
          onLangChange={() => undefined}
          onBack={() => undefined}
          journal={journal}
          meta={{ kind: 'savedvariables', schema: 3, memories: 9, archive: false }}
        />
      )
      const pages = await renderPages(journal, 'ru')

      // in the web book the section titles appear in this exact order…
      const htmlPositions = SECTION_LABELS.map((label) => html.indexOf(label))
      expect(htmlPositions.every((position) => position >= 0)).toBe(true)
      expect([...htmlPositions].sort((a, b) => a - b)).toEqual(htmlPositions)

      // …and in the PDF each section opens its own page, in the same order
      const pdfPages = SECTION_LABELS.map(
        (label) => pages.findIndex((page) => pdfPageContains(page, label))
      )
      expect(pdfPages.every((pageIndex) => pageIndex >= 0)).toBe(true)
      expect([...pdfPages].sort((a, b) => a - b)).toEqual(pdfPages)
      expect(new Set(pdfPages).size).toBe(SECTION_LABELS.length)

      // and the player's chapter texts match word for word in both renderings
      for (const text of ['Затерянные берега', 'Дни, когда карты кончились', 'Тени Сумеречного леса']) {
        expect(html).toContain(text)
        expect(pdfContains(pages, text)).toBe(true)
      }
    },
    RENDER_TIMEOUT
  )

  // ---- FJ-WEB-03 review: interval-resolved membership (no chapterId in the
  // file) and the month split around an author chapter, in the real PDF ----

  it(
    'Хронист (RU): realistic SavedVariables without chapterId — June splits around the chapter',
    async () => {
      const journal = svJournal('ForeverJourney-chapters.lua', 'Гордунни:Хронист')
      const html = renderToString(
        <Book
          tr={strings.ru}
          lang="ru"
          onLangChange={() => undefined}
          onBack={() => undefined}
          journal={journal}
          meta={{ kind: 'savedvariables', schema: 3, memories: 7, archive: false }}
        />
      )
      const pages = await renderPages(journal, 'ru')
      const tr = strings.ru

      // cover + intro + июнь(I) + «Дороги июня»(II) + июнь(III) +
      // «После солнцеворота»(IV) + без даты(V) + end — no archive page
      expect(pages).toHaveLength(8)
      expect(pdfPageContains(pages[2], 'ГЛАВА I')).toBe(true)
      expect(pdfPageContains(pages[2], 'июнь 2026')).toBe(true)
      expect(pdfPageContains(pages[3], 'ГЛАВА II')).toBe(true)
      expect(pdfPageContains(pages[3], 'Дороги июня')).toBe(true)
      // the description follows the title as extractable Cyrillic text
      expect(pdfPageContains(pages[3], 'От стены Стромгарда до плотины Лок Модана')).toBe(true)
      expect(pdfPageContains(pages[4], 'ГЛАВА III')).toBe(true)
      expect(pdfPageContains(pages[4], 'июнь 2026')).toBe(true) // the SAME month, its second section
      expect(pdfPageContains(pages[5], 'ГЛАВА IV')).toBe(true)
      expect(pdfPageContains(pages[5], 'После солнцеворота')).toBe(true)
      expect(pdfPageContains(pages[6], tr.undatedChapter)).toBe(true)
      expect(pdfPageContains(pages[7], tr.endTitle)).toBe(true)

      // nothing lost or duplicated: all seven memories, in both renderings
      const allTitles = [
        'Двадцатидневка до глав',
        'Открыта локация: Loch Modan', // Jun 10 00:00 == startedAt → inside
        'Плотина в тумане',
        'Пал в бою — Kobold Geomancer', // Jun 20 12:00 == closedAt → outside
        'Дорога домой без главы',
        'Начало длинного июля',
        'Без числа',
      ]
      for (const title of allTitles) {
        expect(pdfContains(pages, title)).toBe(true)
        expect(html).toContain(title)
      }

      // parity: the section sequence in the web book and in the PDF pages
      // matches, walking past repeated month labels with a cursor
      const labels = ['июнь 2026', 'Дороги июня', 'июнь 2026', 'После солнцеворота', tr.undatedChapter]
      let htmlCursor = 0
      let pageCursor = 0
      for (const label of labels) {
        const at = html.indexOf(label, htmlCursor)
        expect(at).toBeGreaterThanOrEqual(0)
        expect(at).toBeGreaterThanOrEqual(htmlCursor)
        htmlCursor = at + label.length
        const pageIndex = pages.findIndex((page, index) => index >= pageCursor && pdfPageContains(page, label))
        expect(pageIndex).toBeGreaterThanOrEqual(pageCursor)
        pageCursor = pageIndex
      }
    },
    RENDER_TIMEOUT
  )
})

// ---- FJ-WEB-08: chapterId = false (addon 0.9.0 mass moves) — the excluded
// memories must stay in their month sections in the real PDF ----

describe('BookDocument pages — chapter exclusions (FJ-WEB-08)', () => {
  it(
    'Архивист (RU): excluded memories stay in month sections, web and PDF agree',
    async () => {
      const journal = svJournal('ForeverJourney-chapters.lua', 'Гордунни:Архивист')
      const html = renderToString(
        <Book
          tr={strings.ru}
          lang="ru"
          onLangChange={() => undefined}
          onBack={() => undefined}
          journal={journal}
          meta={{ kind: 'savedvariables', schema: 3, memories: 8, archive: false }}
        />
      )
      const pages = await renderPages(journal, 'ru')
      const tr = strings.ru

      // cover + intro + [июль, Первый свод, июль, Второй свод, июль] + end
      expect(pages).toHaveLength(8)
      expect(pdfPageContains(pages[2], 'ГЛАВА I')).toBe(true)
      expect(pdfPageContains(pages[3], 'ГЛАВА II')).toBe(true)
      expect(pdfPageContains(pages[3], 'Первый свод')).toBe(true)
      expect(pdfPageContains(pages[4], 'ГЛАВА III')).toBe(true)
      expect(pdfPageContains(pages[5], 'ГЛАВА IV')).toBe(true)
      expect(pdfPageContains(pages[5], 'Второй свод')).toBe(true)
      expect(pdfPageContains(pages[6], 'ГЛАВА V')).toBe(true)
      expect(pdfPageContains(pages[7], tr.endTitle)).toBe(true)

      // the July 3 exclusion (timestamp inside a:1's interval) sits in the
      // middle month section together with the second exclusion and the
      // dangling binding — never inside «Первый свод»
      expect(pdfPageContains(pages[4], 'Вырезано из свода')).toBe(true)
      expect(pdfPageContains(pages[4], 'Ссылка в никуда')).toBe(true)
      expect(pdfPageContains(pages[4], 'Тоже вырезано')).toBe(true)
      expect(pdfPageContains(pages[3], 'Вырезано из свода')).toBe(false)
      // the re-bound memory joined «Второй свод» despite its earlier timestamp
      expect(pdfPageContains(pages[5], 'Перенесено вперёд')).toBe(true)
      // the exclusion from the OPEN chapter was not captured by it
      expect(pdfPageContains(pages[6], 'Вырезано из открытой')).toBe(true)
      expect(pdfPageContains(pages[5], 'Вырезано из открытой')).toBe(false)

      // every memory of the mass move is present in both renderings
      for (const title of [
        'До всяких сводов',
        'Вырезано из свода',
        'Само легло в свод',
        'Перенесено вперёд',
        'Ссылка в никуда',
        'Тоже вырезано',
        'Вырезано из открытой',
        'Хвост открытого свода',
      ]) {
        expect(pdfContains(pages, title)).toBe(true)
        expect(html).toContain(title)
      }

      // parity: the section sequence in the web book and in the PDF pages
      // matches, walking past the repeated July labels with a cursor
      const labels = ['июль 2026', 'Первый свод', 'июль 2026', 'Второй свод', 'июль 2026']
      let htmlCursor = 0
      let pageCursor = 0
      for (const label of labels) {
        const at = html.indexOf(label, htmlCursor)
        expect(at).toBeGreaterThanOrEqual(0)
        expect(at).toBeGreaterThanOrEqual(htmlCursor)
        htmlCursor = at + label.length
        const pageIndex = pages.findIndex(
          (page, index) => index >= pageCursor && pdfPageContains(page, label)
        )
        expect(pageIndex).toBeGreaterThanOrEqual(pageCursor)
        pageCursor = pageIndex
      }
    },
    RENDER_TIMEOUT
  )
})
