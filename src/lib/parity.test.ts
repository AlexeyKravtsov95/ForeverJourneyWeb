// Parity with the real Lua addon handlers (final review round).
//
// ADDON_REFERENCE below is the specification: for every event type it holds
// the raw memory record exactly as the addon's handlers save it
// (Memories.lua, BossVictoryMilestones.lua, ProfessionMilestones.lua,
// QuestMilestones.lua) and the display text those handlers produce
// (GetDisplayTitle/GetDisplayDescription), in English and in the RU rendering
// the game shows. The table is written from the addon spec and shared by both
// tests — it does NOT depend on the site converter, so the converter is
// measured against the addon, not against itself.
//
// Test 1 runs each record through the real SavedVariables pipeline
// (readSavedVariables + buildJournalFromSavedVariables) and compares with the
// reference, EN directly and RU through localizeMemory.
//
// Test 2 builds an FJBOOK1 journal FROM THE REFERENCE (never from converter
// output), pushes it through the real FJBOOK1 pipeline (reference exporter →
// importJournal: parts, Adler-32, base64, JSON, validation) and verifies both
// pipelines produce identical normalized events in identical order.
//
// Fields physically absent from SavedVariables are excluded from the
// comparison and documented here and in docs/FJ-WEB-05.md:
// - character.race / character.class / character.level (no live values in SV);
// - journey.completedQuests / journey.totalPlayed (no live counters in SV;
//   recoveredHistory is a historical snapshot and is never a current value);
// - addonVersion / locale / exportedAt (export envelope, not event data).
import { describe, expect, it } from 'vitest'
import { encodeJournalCode } from './encode'
import { importJournal } from './fjbook'
import { buildJournalFromSavedVariables, readSavedVariables } from './savedvariables'
import { localizeMemory } from './localize'
import type { Journal, JournalMemory } from './journal'

/** Raw memory.data as the addon saves it — plain JSON for readability. */
interface RawRecord {
  type: string
  source?: string
  data?: Record<string, unknown>
  title?: string
  personalNote?: string
  favorite?: boolean
  location?: string
}

interface ExpectedText {
  title: string
  description: string
  typeLabel: string
}

interface ReferenceCase extends RawRecord {
  name: string
  en: ExpectedText
  ru: ExpectedText
}

/** Memories.lua ENVIRONMENT_TITLE_KEYS — every environmental cause has its own title. */
const ENVIRONMENTAL_REFERENCE: Array<[string, string, string]> = [
  // [environmentalType, EN title, RU title]
  ['DROWNING', 'Drowned', 'Утонул'],
  ['FALLING', 'Fell from a great height', 'Упал с большой высоты'],
  ['FATIGUE', 'Succumbed to fatigue', 'Изнемог от усталости'],
  ['FIRE', 'Burned to death', 'Сгорел заживо'],
  ['LAVA', 'Consumed by lava', 'Погиб в лаве'],
  ['SLIME', 'Dissolved in slime', 'Растворился в слизи'],
]

const SETBACKS = {
  en: 'Every journey has its setbacks.',
  ru: 'На пути каждого героя случаются поражения.',
}

const ADDON_REFERENCE: ReferenceCase[] = [
  {
    name: 'zone discovery',
    type: 'ZONE',
    source: 'RECORDED',
    location: 'Тирисфальские леса',
    data: { zoneName: 'Tirisfal Glades' },
    en: {
      title: 'Discovered Tirisfal Glades',
      description: 'A new place became part of your journey.',
      typeLabel: 'Zone discovered',
    },
    ru: {
      title: 'Открыта зона: Tirisfal Glades',
      description: 'Новое место стало частью твоего путешествия.',
      typeLabel: 'Зона открыта',
    },
  },
  {
    name: 'level up',
    type: 'LEVEL',
    source: 'RECORDED',
    data: { level: 6 },
    en: {
      title: 'Reached Level 6',
      description: 'Your journey continues.', // MEMORY_DESCRIPTION_LEVEL
      typeLabel: 'Level up',
    },
    ru: {
      title: 'Достигнут 6-й уровень',
      description: 'Путешествие продолжается.',
      typeLabel: 'Новый уровень',
    },
  },
  {
    name: 'instance entered',
    type: 'INSTANCE',
    source: 'RECORDED',
    location: 'Мертвые копи',
    data: { instanceName: 'The Deadmines' },
    en: {
      title: 'Entered The Deadmines',
      description: 'Another chapter of your journey lies within.',
      typeLabel: 'Instance',
    },
    ru: {
      title: 'Вход в подземелье: The Deadmines',
      description: 'Впереди новая глава твоего путешествия.',
      typeLabel: 'Подземелье',
    },
  },
  {
    name: 'death by killer with the killing spell',
    type: 'DEATH',
    source: 'RECORDED',
    location: 'Серебряный бор',
    data: { killerName: 'Worgen Packleader', killerNameRaw: 'Worgen Packleader', spellName: 'Rake' },
    en: {
      title: 'Fell in battle — Worgen Packleader',
      description: 'Final blow: Rake.',
      typeLabel: 'Death',
    },
    ru: {
      title: 'Пал в бою — Worgen Packleader',
      description: 'Последний удар: Rake.',
      typeLabel: 'Смерть',
    },
  },
  {
    name: 'death by killer without a spell',
    type: 'DEATH',
    source: 'RECORDED',
    data: { killerName: 'Murloc Tidehunter' },
    en: {
      title: 'Fell in battle — Murloc Tidehunter',
      description: SETBACKS.en,
      typeLabel: 'Death',
    },
    ru: {
      title: 'Пал в бою — Murloc Tidehunter',
      description: SETBACKS.ru,
      typeLabel: 'Смерть',
    },
  },
  {
    name: 'death with only a spellID — no name may be invented',
    type: 'DEATH',
    source: 'RECORDED',
    data: { killerName: 'Forest Spider', spellID: 12345 },
    en: {
      title: 'Fell in battle — Forest Spider',
      description: SETBACKS.en, // spellID alone cannot name the spell
      typeLabel: 'Death',
    },
    ru: {
      title: 'Пал в бою — Forest Spider',
      description: SETBACKS.ru,
      typeLabel: 'Смерть',
    },
  },
  ...ENVIRONMENTAL_REFERENCE.map<ReferenceCase>(([kind, enTitle, ruTitle]) => ({
    name: `environmental death: ${kind}`,
    type: 'DEATH',
    source: 'RECORDED',
    location: 'Тернистая долина',
    data: { cause: 'ENVIRONMENTAL', environmentalType: kind },
    en: { title: enTitle, description: SETBACKS.en, typeLabel: 'Death' },
    ru: { title: ruTitle, description: SETBACKS.ru, typeLabel: 'Смерть' },
  })),
  {
    name: 'death without a killer and without an environmental cause',
    type: 'DEATH',
    source: 'RECORDED',
    data: {},
    en: { title: 'Fell in battle', description: SETBACKS.en, typeLabel: 'Death' },
    ru: { title: 'Пал в бою', description: SETBACKS.ru, typeLabel: 'Смерть' },
  },
  {
    name: 'quest milestone',
    type: 'QUEST_MILESTONE',
    source: 'RECORDED',
    location: 'Тирисфальские леса',
    data: { quests: 25 },
    en: {
      title: '25 quests completed',
      description: 'Another important questing milestone has been reached.',
      typeLabel: 'Quest milestone',
    },
    ru: {
      title: 'Выполнено заданий: 25',
      description: 'Достигнут ещё один важный этап выполнения заданий.',
      typeLabel: 'Этап заданий',
    },
  },
  {
    name: 'boss victory with an encounter name',
    type: 'BOSS_VICTORY',
    source: 'RECORDED',
    location: 'Мертвые копи',
    // spellName is deliberately present: the boss handler ignores it
    data: { encounterName: 'Edwin VanCleef', spellName: 'Pyroblast' },
    en: {
      title: 'Edwin VanCleef',
      description: 'The battle ended in victory.',
      typeLabel: 'Victory',
    },
    ru: {
      title: 'Edwin VanCleef',
      description: 'Битва завершилась победой.',
      typeLabel: 'Победа',
    },
  },
  {
    name: 'boss victory without an encounter name',
    type: 'BOSS_VICTORY',
    source: 'RECORDED',
    data: {},
    en: {
      title: 'Unknown boss',
      description: 'The battle ended in victory.',
      typeLabel: 'Victory',
    },
    ru: {
      title: 'Неизвестный босс',
      description: 'Битва завершилась победой.',
      typeLabel: 'Победа',
    },
  },
  {
    name: 'profession milestone: learned',
    type: 'PROFESSION_MILESTONE',
    source: 'RECORDED',
    location: 'Подгород',
    data: { kind: 'LEARNED', professionName: 'Алхимия', skillLine: 'alchemy', skillLevel: 1 },
    en: {
      title: 'Learned profession: Алхимия',
      description: 'A new profession became part of the journey.',
      typeLabel: 'Profession milestone',
    },
    ru: {
      title: 'Изучена профессия: Алхимия',
      description: 'Новая профессия стала частью путешествия.',
      typeLabel: 'Этап профессии',
    },
  },
  {
    name: 'profession milestone: skill reached',
    type: 'PROFESSION_MILESTONE',
    source: 'RECORDED',
    location: 'Подгород',
    data: {
      kind: 'MILESTONE',
      professionName: 'Алхимия',
      skillLine: 'alchemy',
      skillLevel: 150,
      milestone: 'Journeyman',
    },
    en: {
      title: 'Алхимия reached skill 150',
      description: 'A new profession milestone has been reached.',
      typeLabel: 'Profession milestone',
    },
    ru: {
      title: 'Алхимия: навык 150',
      description: 'Достигнут новый этап профессии.',
      typeLabel: 'Этап профессии',
    },
  },
  {
    name: 'manual memory keeps authored text verbatim',
    type: 'MANUAL_MEMORY',
    source: 'USER',
    location: 'Подгород',
    favorite: true,
    personalNote: 'Первая запись.\nВторая строка с "кавычками".',
    data: { title: 'Первая ночь в Тирисфале', note: 'Туман стелился по земле.' },
    en: {
      title: 'Первая ночь в Тирисфале',
      description: 'Туман стелился по земле.',
      typeLabel: 'Journal entry',
    },
    ru: {
      title: 'Первая ночь в Тирисфале',
      description: 'Туман стелился по земле.',
      typeLabel: 'Запись в дневнике',
    },
  },
  {
    name: 'unknown type keeps its own saved text',
    type: 'PVP_DUEL',
    source: 'RECORDED',
    location: 'Подгород',
    personalNote: 'Еле успел блок.',
    data: { opponent: 'Рогнар', result: 'win' },
    title: 'Победа в дуэли: Рогнар',
    en: {
      title: 'Победа в дуэли: Рогнар',
      description: '',
      typeLabel: 'PVP DUEL',
    },
    ru: {
      title: 'Победа в дуэли: Рогнар',
      description: '',
      typeLabel: 'PVP DUEL',
    },
  },
]

// ---------- Lua source synthesis (the raw side, before any conversion) ----------

function luaString(text: string): string {
  return (
    '"' +
    text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') +
    '"'
  )
}

function luaValue(value: unknown): string {
  if (typeof value === 'string') return luaString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') {
    const fields = Object.entries(value as Record<string, unknown>).map(
      ([key, item]) => `[${luaString(key)}] = ${luaValue(item)}`
    )
    return fields.length ? `{\n${fields.join(',\n')},\n}` : '{ }'
  }
  return 'nil'
}

function recordToLua(record: RawRecord, timestamp: number): string {
  const full = {
    type: record.type,
    ...(record.source !== undefined ? { source: record.source } : {}),
    timestamp,
    ...(record.location !== undefined ? { location: record.location } : {}),
    ...(record.favorite ? { favorite: true } : {}),
    ...(record.personalNote !== undefined ? { personalNote: record.personalNote } : {}),
    ...(record.data !== undefined ? { data: record.data } : {}),
    ...(record.title !== undefined ? { title: record.title } : {}),
  }
  return `\t\t\t\t${luaValue(full)},`
}

function buildLua(records: RawRecord[]): string {
  const lines = ['ForeverJourneyDB = {', '\t["schemaVersion"] = 3,', '\t["characters"] = {', '\t\t["Гордунни:Эталон"] = {', '\t\t\t["createdAt"] = 1741000000,', '\t\t\t["memories"] = {']
  records.forEach((record, index) => lines.push(recordToLua(record, 1_741_000_000 + index * 1000)))
  lines.push('\t\t\t},', '\t\t},', '\t},', '}')
  return lines.join('\n')
}

function convert(records: RawRecord[]): JournalMemory[] {
  const sv = readSavedVariables(buildLua(records))
  if (sv.status !== 'ok') throw new Error(`SavedVariables import failed: ${sv.code}`)
  const journal = buildJournalFromSavedVariables(sv, 'Гордунни:Эталон')
  if (!journal) throw new Error('journal must build')
  return journal.memories
}

// ---------- tests ----------

describe('addon handler reference (EN + RU)', () => {
  for (const reference of ADDON_REFERENCE) {
    it(`converts "${reference.name}" exactly like the addon`, () => {
      const [memory] = convert([reference])
      // English display text
      expect(memory.title).toBe(reference.en.title)
      expect(memory.description).toBe(reference.en.description)
      expect(memory.typeLabel).toBe(reference.en.typeLabel)
      // Russian display text through the localization layer
      const ru = localizeMemory(memory, 'ru')
      expect(ru.title).toBe(reference.ru.title)
      expect(ru.description).toBe(reference.ru.description)
      expect(ru.typeLabel).toBe(reference.ru.typeLabel)
      // English through the same layer must stay as converted
      const en = localizeMemory(memory, 'en')
      expect(en.title).toBe(reference.en.title)
      expect(en.description).toBe(reference.en.description)
    })
  }
})

describe('import parity: FJBOOK1 vs SavedVariables (reference-grounded)', () => {
  it('both pipelines produce the reference events, identically and in order', () => {
    // the FJBOOK1 journal is built FROM THE REFERENCE — never from converter
    // output — so the comparison proves both pipelines against the addon
    const referenceMemories: JournalMemory[] = ADDON_REFERENCE.map((reference, index) => ({
      type: reference.type,
      typeLabel: reference.en.typeLabel,
      source: reference.source ?? '',
      title: reference.en.title,
      description: reference.en.description,
      personalNote: reference.personalNote ?? '',
      favorite: reference.favorite === true,
      timestamp: (1_741_000_000 + index * 1000) * 1000,
      location: reference.location ?? '',
    }))
    const fjbookJournal: Journal = {
      format: 'FJJOURNAL',
      formatVersion: 1,
      addonVersion: '',
      locale: '',
      character: { name: 'Эталон', race: '', class: '', level: 0 },
      journey: { startedAt: 1_741_000_000, deaths: 0, completedQuests: 0, totalPlayed: 0 },
      memories: referenceMemories,
    }

    const code = encodeJournalCode(fjbookJournal, { partSize: 120, checksumStyle: 'hex-upper' })
    const imported = importJournal(code)
    if (imported.status !== 'ok') {
      const detail = imported.status === 'error' ? imported.code : imported.status
      throw new Error(`FJBOOK1 import failed: ${detail}`)
    }
    const converted = convert(ADDON_REFERENCE)

    expect(converted).toHaveLength(imported.journal.memories.length)
    const FIELDS = [
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
    imported.journal.memories.forEach((expected, index) => {
      const actual = converted[index]
      for (const field of FIELDS) {
        expect(actual[field]).toBe(expected[field])
      }
      // identical RU/EN rendering after localization
      expect(localizeMemory(actual, 'ru')).toEqual(localizeMemory(expected, 'ru'))
      expect(localizeMemory(actual, 'en')).toEqual(localizeMemory(expected, 'en'))
    })
  })
})
