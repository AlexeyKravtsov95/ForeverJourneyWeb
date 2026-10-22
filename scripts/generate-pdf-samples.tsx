// Generates sample books with the SAME React components the browser uses on
// Download PDF (@react-pdf/renderer node build). Produces docs/pdf-samples/
// client-*.pdf for every scenario of FJ-WEB-02 (0 / demo / 59 / 80 / 500
// memories + an entry longer than a page) and prints generation timings.
// Usage: npm run pdf:samples   (after npm run generate:codes for fixtures)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToBuffer } from '@react-pdf/renderer'

import { BookDocument } from '../src/pdf/BookDocument'
import { registerBookFonts } from '../src/pdf/registerFonts'
import { strings } from '../src/i18n'
import { demoJournal } from '../src/demo/demoJournal'
import { importJournal, type Journal } from '../src/lib/fjbook'
import type { JournalMemory } from '../src/lib/journal'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/pdf-samples')

const fontPath = (name: string) =>
  fileURLToPath(new URL(`../src/pdf/fonts/${name}`, import.meta.url))

registerBookFonts({
  regular: fontPath('PT_Serif-Web-Regular.ttf'),
  italic: fontPath('PT_Serif-Web-Italic.ttf'),
  bold: fontPath('PT_Serif-Web-Bold.ttf'),
  boldItalic: fontPath('PT_Serif-Web-BoldItalic.ttf'),
})

function fixtureJournal(file: string): Journal {
  const code = readFileSync(resolve(ROOT, 'fixtures', file), 'utf8')
  const result = importJournal(code)
  if (result.status !== 'ok') throw new Error(`${file} did not import: ${result.code}`)
  return result.journal
}

// FJ-WEB-02.1 localization showcase: a Straider-style enUS journal with the
// addon's system event templates (types, auto-generated titles and
// descriptions). Rendered once in English and once in Russian, it shows the
// RU book translating system events while keeping player text and zone names
// in the original. Built here (not a fixture) on purpose: it is a rendering
// sample, not an import-pipeline case.
function buildStraiderJournal(): Journal {
  const zones = [
    'Dun Morogh',
    'Loch Modan',
    'Wetlands',
    'Duskwood',
    'Stranglethorn Vale',
    'Burning Steppes',
  ]
  const day = (index: number) => Date.UTC(2026, 0, 2, 12) + index * 3 * 86_400_000
  const entry = (index: number, over: Partial<JournalMemory>): JournalMemory => ({
    type: 'memory',
    typeLabel: 'Memory',
    source: 'milestone',
    title: '',
    description: 'Your journey continues.',
    personalNote: '',
    favorite: false,
    timestamp: day(index),
    location: zones[index % zones.length],
    ...over,
  })

  const memories: JournalMemory[] = []
  let level = 8
  for (let index = 0; index < 59; index++) {
    const zone = zones[index % zones.length]
    switch (index % 9) {
      case 0:
        memories.push(
          entry(index, {
            type: 'zone',
            typeLabel: 'Zone',
            source: 'zone',
            title: zone,
            description: 'A new place became part of your journey.',
          })
        )
        break
      case 1:
        level += 1
        memories.push(
          entry(index, {
            type: 'level',
            typeLabel: 'Level Up',
            source: 'level',
            title: `Level ${level}`,
            description: `Reached level ${level}.`,
          })
        )
        break
      case 2:
        memories.push(
          entry(index, {
            type: 'death',
            typeLabel: 'Death',
            source: 'death',
            title: 'Slain on the road',
            description: 'Every journey has its setbacks.',
            personalNote: 'Первая смерть — обидно до сих пор.',
          })
        )
        break
      case 3:
        memories.push(
          entry(index, {
            type: 'victory',
            typeLabel: 'Victory',
            source: 'boss',
            title: 'Boss defeated',
            description: 'The battle ended in victory.',
          })
        )
        break
      case 4:
        memories.push(
          entry(index, {
            type: 'instance',
            typeLabel: 'Instance',
            source: 'instance',
            title: 'Deadmines cleared',
            description: 'Your journey continues.',
          })
        )
        break
      case 5:
        memories.push(
          entry(index, {
            type: 'memory',
            typeLabel: 'Memory',
            source: 'milestone',
            title: 'A quiet evening by the fire',
            description: 'Your journey continues.',
          })
        )
        break
      case 6:
        memories.push(
          entry(index, {
            type: 'quest',
            typeLabel: 'Quest Milestone',
            source: 'quest',
            title: '250 quests completed',
            description: 'Your journey continues.',
          })
        )
        break
      case 7:
        memories.push(
          entry(index, {
            type: 'achievement',
            typeLabel: 'Achievement',
            source: 'achievement',
            title: 'Explorer of the Eastern Kingdoms',
            description: 'A new place became part of your journey.',
            favorite: index === 25,
          })
        )
        break
      default:
        // player-written text: stays in the original language in every book
        memories.push(
          entry(index, {
            type: 'note',
            typeLabel: 'Journal Entry',
            source: 'manual',
            title: 'Notes from the road',
            description: 'Slept under the stars again. The road is long, and that is fine.',
          })
        )
        break
    }
  }

  return {
    format: 'FJJOURNAL',
    formatVersion: 1,
    addonVersion: '0.9.3',
    locale: 'enUS',
    exportedAt: Date.UTC(2026, 5, 30, 12),
    character: { name: 'Straider', race: 'Blood Elf', class: 'Mage', level: 80 },
    journey: {
      startedAt: Date.UTC(2026, 0, 1, 12),
      deaths: 6,
      completedQuests: 253,
      totalPlayed: 424_800, // 4d 22h / 4 д 22 ч
    },
    memories,
  }
}

const scenarios: Array<{ name: string; journal: Journal; lang: 'en' | 'ru' }> = [
  { name: 'client-demo-book', journal: demoJournal, lang: 'en' },
  { name: 'client-journal-empty', journal: fixtureJournal('sample-empty.txt'), lang: 'ru' },
  { name: 'client-journal-59', journal: fixtureJournal('journal-59.txt'), lang: 'ru' },
  { name: 'client-journal-80', journal: fixtureJournal('journal-80.txt'), lang: 'ru' },
  { name: 'client-journal-long-entry', journal: fixtureJournal('journal-long.txt'), lang: 'ru' },
  { name: 'client-journal-500', journal: fixtureJournal('journal-500.txt'), lang: 'ru' },
  // FJ-WEB-02.1: the same 59-memory enUS journal (system event templates)
  // rendered in both languages — EN book and its localized RU twin.
  { name: 'client-localization-en', journal: buildStraiderJournal(), lang: 'en' },
  { name: 'client-localization-ru', journal: buildStraiderJournal(), lang: 'ru' },
]

mkdirSync(OUT, { recursive: true })
for (const { name, journal, lang } of scenarios) {
  const started = Date.now()
  const buffer = await renderToBuffer(
    <BookDocument journal={journal} tr={strings[lang]} lang={lang} />
  )
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  writeFileSync(resolve(OUT, `${name}.pdf`), buffer)
  console.log(
    `${name}.pdf — ${Math.round(buffer.length / 1024)} KB, ` +
      `${journal.memories.length} memories, generated in ${seconds}s`
  )
}
