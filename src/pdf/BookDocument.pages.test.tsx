// FJ-WEB-06.1 page-level PDF regression suite: renders real books through
// the node build of @react-pdf (the same component the browser downloads)
// and verifies actual page counts and per-page contents with a real text
// extractor (unpdf). The buffer-size smoke checks of BookDocument.test.tsx
// could not catch an almost-empty page, which is exactly what this guards:
// a shrinking book must lose the duplicate page, never the data.
import { describe, expect, it } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { BookDocument } from './BookDocument'
import { registerBookFonts } from './registerFonts'
import { extractPdfPages, pdfContains, pdfPageContains, pdfPageCount } from './pdfText'
import { demoJournal } from '../demo/demoJournal'
import { strings } from '../i18n'
import type { Journal } from '../lib/journal'
import { buildJournalFromSavedVariables, readSavedVariables } from '../lib/savedvariables'

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
    'Straider (7 memories, one calendar day): 5 pages, no Saved Statistics page (%s)',
    async (lang) => {
      const pages = await renderPages(
        svJournal('ForeverJourney-straider.lua', 'ClassicBetaPvP:Straider'),
        lang
      )
      const tr = strings[lang]

      // cover + intro + archive + the single October chapter + end page
      expect(pages).toHaveLength(5)

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

      // archive keeps every saved value: snapshot to the second, professions,
      // zones, and the provenance note for the death counter
      expect(pdfPageContains(pages[2], tr.archiveTitle)).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveSnapshotTitle)).toBe(true)
      expect(pdfPageContains(pages[2], '25')).toBe(true)
      expect(pdfPageContains(pages[2], '182')).toBe(true)
      expect(
        pdfPageContains(pages[2], lang === 'ru' ? '2 д 3 ч 2 мин 34 с' : '2d 3h 2m 34s')
      ).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveProfessionsTitle)).toBe(true)
      expect(pdfPageContains(pages[2], '94 / 150')).toBe(true)
      expect(pdfPageContains(pages[2], 'Горное дело')).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveZonesTitle)).toBe(true)
      expect(pdfPageContains(pages[2], 'Оргриммар')).toBe(true)
      expect(pdfPageContains(pages[2], tr.archiveDeathsSourceNote)).toBe(true)

      // the chronicle chapter keeps its memories; the book ends in one page
      expect(pdfPageContains(pages[3], lang === 'ru' ? 'октября 2026' : 'October 2026')).toBe(true)
      expect(pdfPageContains(pages[3], 'Dun Morogh')).toBe(true)
      expect(pdfPageContains(pages[4], tr.endTitle)).toBe(true)

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
