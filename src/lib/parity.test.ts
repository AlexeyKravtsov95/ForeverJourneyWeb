// Parity of the two import ways (review round 3): the same logical journal
// events are described twice — as a hand-written FJBOOK1 journal pushed
// through the site's reference exporter and the real importJournal()
// pipeline, and as the synthetic SavedVariables fixture parsed by
// readSavedVariables() + buildJournalFromSavedVariables(). After
// normalization both journals must carry identical events in identical order,
// and localizeMemory() must render both identically for RU and EN.
//
// Fields physically absent from SavedVariables are excluded from the
// comparison and documented here and in docs/FJ-WEB-05.md:
// - character.race / character.class / character.level (no live values in SV);
// - journey.completedQuests / journey.totalPlayed (no live counters in SV;
//   recoveredHistory is a historical snapshot and is never a current value);
// - addonVersion / locale / exportedAt (export envelope, not event data).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { encodeJournalCode } from './encode'
import { importJournal } from './fjbook'
import { buildJournalFromSavedVariables, readSavedVariables } from './savedvariables'
import { localizeMemory } from './localize'
import type { Journal, JournalMemory } from './journal'

const s = (unix: number) => unix // the addon export carries Unix seconds

// The display events the SavedVariables fixture describes, exactly as the
// importer is expected to rebuild them (derivation rules included).
const expectedMemories: JournalMemory[] = [
  {
    type: 'ZONE',
    typeLabel: 'Zone discovered',
    source: 'RECORDED',
    title: 'Discovered Tirisfal Glades',
    description: 'A new place became part of your journey.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_200_000),
    location: 'Тирисфальские леса',
  },
  {
    type: 'MANUAL_MEMORY',
    typeLabel: 'Journal entry',
    source: 'USER',
    title: 'Первая ночь в Тирисфале',
    description:
      'Туман стелился по земле, а в воздухе пахло прелой листвой и чем-то ещё, неуловимо-печальным.',
    personalNote: 'Первая запись.\nВторая строка с "кавычками" и слэшем \\ назад.',
    favorite: true,
    timestamp: s(1_741_206_000),
    location: 'Подгород',
  },
  {
    type: 'DEATH',
    typeLabel: 'Death',
    source: 'RECORDED',
    title: 'Fell in battle — Drowning',
    description: 'Every journey has its setbacks.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_250_000),
    location: 'Озеро Лордамер',
  },
  {
    type: 'DEATH',
    typeLabel: 'Death',
    source: 'RECORDED',
    title: 'Fell in battle — Worgen Packleader',
    description: 'Final blow: Rake.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_290_000),
    location: 'Серебряный бор',
  },
  {
    type: 'LEVEL',
    typeLabel: 'Level up',
    source: 'RECORDED',
    title: 'Reached Level 6',
    description: 'Your journey continues.', // MEMORY_DESCRIPTION_LEVEL
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_300_000),
    location: 'Серебряный бор',
  },
  {
    type: 'MANUAL_MEMORY',
    typeLabel: 'Journal entry',
    source: 'USER',
    title: 'Табличка на мосту',
    description: '«Смотри под ноги — мост шаткий». Кто-то выцарапал это ножом.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_310_000),
    location: 'Подгород',
  },
  {
    type: 'QUEST_MILESTONE',
    typeLabel: 'Quest milestone',
    source: 'RECORDED',
    title: '25 quests completed',
    description: 'Another important questing milestone has been reached.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_400_000),
    location: 'Тирисфальские леса',
  },
  {
    type: 'ZONE',
    typeLabel: 'Zone discovered',
    source: 'RECORDED',
    title: 'Discovered Western Plaguelands',
    description: 'A new place became part of your journey.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_400_000),
    location: 'Western Plaguelands',
  },
  {
    type: 'INSTANCE',
    typeLabel: 'Instance',
    source: 'RECORDED',
    title: 'Entered The Deadmines',
    description: 'Another chapter of your journey lies within.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_420_000),
    location: 'Мертвые копи',
  },
  {
    type: 'PVP_DUEL',
    typeLabel: 'PVP DUEL',
    source: 'RECORDED',
    title: 'Победа в дуэли: Рогнар',
    description: '',
    personalNote: 'Еле успел блок.',
    favorite: true,
    timestamp: s(1_741_450_000),
    location: 'Подгород',
  },
  {
    type: 'BOSS_VICTORY',
    typeLabel: 'Victory',
    source: 'RECORDED',
    title: 'Edwin VanCleef', // data.encounterName
    description: 'Final blow: Pyroblast.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_500_000),
    location: 'Мертвые копи',
  },
  {
    type: 'PROFESSION_MILESTONE',
    typeLabel: 'Profession milestone',
    source: 'RECORDED',
    title: 'Major Mana Potion', // LEARNED names the thing learned
    description: 'Your journey continues.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_600_000),
    location: 'Подгород',
  },
  {
    type: 'PROFESSION_MILESTONE',
    typeLabel: 'Profession milestone',
    source: 'RECORDED',
    title: 'Алхимия', // MILESTONE names the profession
    description: 'Your journey continues.',
    personalNote: '',
    favorite: false,
    timestamp: s(1_741_700_000),
    location: 'Подгород',
  },
  {
    type: 'MANUAL_MEMORY',
    typeLabel: 'Journal entry',
    source: 'USER',
    title: 'Запись без даты',
    description: 'Когда это было — уже не помню.',
    personalNote: '',
    favorite: false,
    location: 'Лордерон',
  },
]

const fjbookJournal: Journal = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '',
  locale: '',
  character: { name: 'Аэлириэн', race: '', class: '', level: 0 },
  journey: { startedAt: s(1_741_199_000), deaths: 1, completedQuests: 0, totalPlayed: 0 },
  memories: expectedMemories,
}

const COMPARED_FIELDS = [
  'type',
  'typeLabel',
  'source',
  'title',
  'description',
  'personalNote',
  'favorite',
  'timestamp',
  'location',
] as const

function importBoth(): { fj: Journal; sv: Journal } {
  const code = encodeJournalCode(fjbookJournal, { partSize: 120, checksumStyle: 'hex-upper' })
  const imported = importJournal(code)
  if (imported.status !== 'ok') {
    const detail = imported.status === 'error' ? imported.code : imported.status
    throw new Error(`FJBOOK1 import failed: ${detail}`)
  }
  const lua = readFileSync(
    new URL('../../fixtures/savedvariables/ForeverJourney.lua', import.meta.url),
    'utf8'
  )
  const sv = readSavedVariables(lua)
  if (sv.status !== 'ok') throw new Error(`SavedVariables import failed: ${sv.code}`)
  const journal = buildJournalFromSavedVariables(sv, 'Гордунни:Аэлириэн')
  if (!journal) throw new Error('SavedVariables journal must build')
  return { fj: imported.journal, sv: journal }
}

describe('import parity: FJBOOK1 vs SavedVariables', () => {
  it('produces identical normalized events in identical order', () => {
    const { fj, sv } = importBoth()
    expect(sv.character.name).toBe(fj.character.name)
    expect(sv.journey.startedAt).toBe(fj.journey.startedAt)
    expect(sv.journey.deaths).toBe(fj.journey.deaths)
    // quests / played time are excluded: no live values in SavedVariables
    expect(sv.memories).toHaveLength(fj.memories.length)
    fj.memories.forEach((expected, index) => {
      const actual = sv.memories[index]
      for (const field of COMPARED_FIELDS) {
        expect(actual[field]).toBe(expected[field])
      }
    })
  })

  for (const lang of ['en', 'ru'] as const) {
    it(`renders both ways identically after localization (${lang.toUpperCase()})`, () => {
      const { fj, sv } = importBoth()
      fj.memories.forEach((expected, index) => {
        expect(localizeMemory(sv.memories[index], lang)).toEqual(localizeMemory(expected, lang))
      })
    })
  }
})
