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
// real addon system templates (parameterized titles, auto descriptions) plus
// authored manual notes. Rendered once in English and once in Russian, it
// shows the RU book translating system events while keeping player text,
// zone/NPC/spell names and unknown templates in the original. Built here
// (not a fixture) on purpose: it is a rendering sample, not an
// import-pipeline case.
function buildStraiderJournal(): Journal {
  const zones = [
    'Dun Morogh',
    'Loch Modan',
    'Wetlands',
    'Duskwood',
    'Stranglethorn Vale',
    'Burning Steppes',
  ]
  const enemies = ['Stonesplinter Trogg', 'Murloc Nightcrawler', 'Blackrock Raider']
  const spells = ['Pyroblast', 'Frostbolt', 'Fire Blast']
  const instances = ['Deadmines', 'The Stockade', 'Shadowfang Keep']
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
  let quests = 0
  let deathCount = 0
  let noteCount = 0
  for (let index = 0; index < 59; index++) {
    const zone = zones[index % zones.length]
    switch (index % 9) {
      case 0:
        memories.push(
          entry(index, {
            type: 'zone',
            typeLabel: 'Zone',
            source: 'zone',
            title: `Discovered ${zone}`,
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
            title: `Reached Level ${level}`,
            description: `Reached level ${level}.`,
          })
        )
        break
      case 2: {
        const isFinalBlow = deathCount % 2 === 0
        memories.push(
          entry(index, {
            type: 'death',
            typeLabel: 'Death',
            source: 'death',
            title: `Fell in battle — ${enemies[deathCount % enemies.length]}`,
            description: isFinalBlow
              ? `Final blow: ${spells[deathCount % spells.length]}.`
              : 'Every journey has its setbacks.',
            ...(deathCount === 0 ? { personalNote: 'Первая смерть — обидно до сих пор.' } : {}),
          })
        )
        deathCount += 1
        break
      }
      case 3:
        // no known title template for victories — the title stays original
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
            title: `Entered ${instances[Math.floor(index / 9) % instances.length]}`,
            description: 'Another chapter of your journey lies within.',
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
        quests += 50
        memories.push(
          entry(index, {
            type: 'quest',
            typeLabel: 'Quest Milestone',
            source: 'quest',
            title: `${quests} quests completed`,
            description: 'Another important questing milestone has been reached.',
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
      default: {
        // manual (player-written) entries keep their title/description
        // verbatim in every language — even when they look like templates
        noteCount += 1
        const reviewerCase = noteCount === 1
        memories.push(
          entry(index, {
            type: 'note',
            typeLabel: 'Journal Entry',
            source: 'manual',
            title: reviewerCase ? 'Level 20' : 'Notes from the road',
            description: reviewerCase
              ? 'Your journey continues.'
              : 'Slept under the stars again. The road is long, and that is fine.',
          })
        )
        break
      }
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
