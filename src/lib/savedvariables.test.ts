import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildJournalFromSavedVariables, readSavedVariables } from './savedvariables'
import { buildChapters } from './chapters'
import { localizeMemory } from './localize'

const fixture = (name: string) =>
  readFileSync(new URL('../../fixtures/savedvariables/' + name, import.meta.url), 'utf8')

const mustRead = (source: string) => {
  const result = readSavedVariables(source)
  if (result.status !== 'ok') throw new Error(`fixture must parse: ${result.code}`)
  return result
}

const MAIN = 'ForeverJourney.lua'
const AELIRIEN = 'Гордунни:Аэлириэн'

describe('database envelope', () => {
  it('reads schema 3 with several characters and picks only ForeverJourneyDB', () => {
    const sv = mustRead(fixture(MAIN))
    expect(sv.schemaVersion).toBe(3)
    expect(sv.characters).toHaveLength(3)
    const names = sv.characters.map((c) => c.key)
    expect(names).toEqual(['Гордунни:Аэлириэн', 'Гордунни:Мрограмар', 'Silvermoon:Thalorien'])
  })

  it('splits realm and name and summarizes memories, favorites and dates', () => {
    const sv = mustRead(fixture(MAIN))
    const aelirien = sv.characters.find((c) => c.key === AELIRIEN)
    expect(aelirien).toMatchObject({
      name: 'Аэлириэн',
      realm: 'Гордунни',
      memories: 11,
      favorites: 2,
      createdAt: 1_741_199_000 * 1000,
    })
    expect(aelirien?.firstMemoryAt).toBe(1_741_200_000 * 1000)
    expect(aelirien?.lastMemoryAt).toBe(1_741_500_000 * 1000)
  })

  it('rejects schema 2, missing database and missing characters', () => {
    const old = readSavedVariables(fixture('ForeverJourney-schema2.lua'))
    expect(old).toMatchObject({ status: 'error', code: 'UNSUPPORTED_SCHEMA', detail: '2' })

    const other = readSavedVariables(fixture('ForeverJourney-otherdb.lua'))
    expect(other).toMatchObject({ status: 'error', code: 'DB_NOT_FOUND' })

    const none = readSavedVariables(
      'ForeverJourneyDB = { ["schemaVersion"] = 3, ["characters"] = { } }'
    )
    expect(none).toMatchObject({ status: 'error', code: 'NO_CHARACTERS' })

    const missing = readSavedVariables(
      'ForeverJourneyDB = { ["characters"] = { ["A:B"] = { } } }'
    )
    expect(missing).toMatchObject({ status: 'error', code: 'UNSUPPORTED_SCHEMA', detail: 'missing' })
  })

  it('special keys cannot shadow schemaVersion, characters or memories', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["__proto__"] = { ["schemaVersion"] = 99, ["characters"] = { ["Fake:Ghost"] = { } } },',
      '\t["constructor"] = { ["memories"] = { } },',
      '\t["characters"] = { ["Real:Hero"] = { ["createdAt"] = 100, ["memories"] = { { ["type"] = "ZONE" } } } },',
      '}',
    ].join('\n')
    const sv = mustRead(source)
    expect(sv.schemaVersion).toBe(3)
    expect(sv.characters.map((c) => c.key)).toEqual(['Real:Hero'])
    const journal = buildJournalFromSavedVariables(sv, 'Real:Hero')
    expect(journal?.memories).toHaveLength(1)
  })

  it('rejects a broken file and a malicious file without executing anything', () => {
    const broken = readSavedVariables(fixture('ForeverJourney-broken.lua'))
    expect(broken).toMatchObject({ status: 'error', code: 'PARSE_ERROR' })

    const malicious = readSavedVariables(fixture('ForeverJourney-malicious.lua'))
    expect(malicious).toMatchObject({ status: 'error', code: 'PARSE_ERROR' })
  })

  it('rejects an empty file', () => {
    expect(readSavedVariables('')).toMatchObject({ status: 'error', code: 'EMPTY_INPUT' })
  })
})

describe('journal conversion', () => {
  const sv = mustRead(fixture(MAIN))

  it('converts one character only — no cross-character merging', () => {
    const journal = buildJournalFromSavedVariables(sv, 'Silvermoon:Thalorien')
    expect(journal).not.toBeNull()
    expect(journal?.character.name).toBe('Thalorien')
    expect(journal?.memories).toHaveLength(3)
    expect(journal?.memories.every((m) => m.source === 'RECORDED')).toBe(true)
    // unknown character key yields null
    expect(buildJournalFromSavedVariables(sv, 'Nope:Nobody')).toBeNull()
  })

  it('imports every memory, chronologically sorted with stable order for equal times', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    expect(journal?.memories).toHaveLength(11)
    const times = journal?.memories.map((m) => m.timestamp ?? Number.POSITIVE_INFINITY)
    expect(times).toEqual([...(times ?? [])].sort((a, b) => a - b))
    // the two entries with timestamp 1741400000 keep file order: QUEST_MILESTONE first
    const equal = journal?.memories.filter((m) => m.timestamp === 1_741_400_000 * 1000)
    expect(equal).toHaveLength(2)
    expect(equal?.[0].type).toBe('QUEST_MILESTONE')
    expect(equal?.[1].type).toBe('ZONE')
    // the undated entry goes last
    expect(journal?.memories[10].timestamp).toBeUndefined()
    expect(journal?.memories[10].title).toBe('Запись без даты')
  })

  it('preserves manual memories verbatim: title, note, personal note with escapes', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const manual = journal?.memories.find((m) => m.type === 'MANUAL_MEMORY' && m.favorite)
    expect(manual).toMatchObject({
      source: 'USER',
      title: 'Первая ночь в Тирисфале',
      description: expect.stringContaining('Туман стелился по земле'),
      personalNote: 'Первая запись.\nВторая строка с "кавычками" и слэшем \\ назад.',
      favorite: true,
      location: 'Подгород',
    })
  })

  it('rebuilds automatic event text from verified data fields (Memories.lua templates)', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const byTitle = (title: string) => journal?.memories.find((m) => m.title === title)

    // ZONE: data.zoneName
    expect(byTitle('Discovered Tirisfal Glades')).toMatchObject({
      source: 'RECORDED',
      typeLabel: 'Zone discovered',
      description: 'A new place became part of your journey.',
    })
    // ZONE without data.zoneName falls back to location.name
    expect(byTitle('Discovered Western Plaguelands')).toMatchObject({
      location: 'Western Plaguelands',
      description: 'A new place became part of your journey.',
    })
    // DEATH: killerName plus the killing spell when stored
    expect(byTitle('Fell in battle — Worgen Packleader')).toMatchObject({
      typeLabel: 'Death',
      description: 'Final blow: Rake.',
    })
    // LEVEL: data.level
    expect(byTitle('Reached Level 6')).toMatchObject({
      description: 'Reached level 6.',
    })
    // QUEST_MILESTONE: quest counter
    expect(byTitle('25 quests completed')).toMatchObject({
      description: 'Another important questing milestone has been reached.',
    })
    // INSTANCE: data.instanceName
    expect(byTitle('Entered The Deadmines')).toMatchObject({
      description: 'Another chapter of your journey lies within.',
    })
    // saved display text always wins over anything derived from data
    expect(byTitle('Victory in the Deadmines')).toMatchObject({
      description: 'The battle ended in victory.', // NOT "Final blow: Pyroblast."
    })
  })

  it('derives nothing when the data is missing or has no confirmed template', () => {
    // environmental death without a killer name: no enemy may be invented
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["memories"] = {',
      '\t\t\t\t{ ["type"] = "DEATH", ["data"] = { ["environmentalType"] = "FALL" } },',
      '\t\t\t\t{ ["type"] = "ZONE", ["data"] = { } },',
      '\t\t\t\t{ ["type"] = "LEVEL", ["data"] = { ["level"] = "many" } },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.memories).toHaveLength(3)
    for (const memory of journal?.memories ?? []) {
      expect(memory.title).toBe('')
      expect(memory.description).toBe('')
    }
    // achievement has no confirmed template either — neutral label only
    const thalorien = buildJournalFromSavedVariables(sv, 'Silvermoon:Thalorien')
    const achievement = thalorien?.memories.find((m) => m.type === 'ACHIEVEMENT')
    expect(achievement).toMatchObject({ title: '', description: '', typeLabel: 'Achievement' })
  })

  it('localizes derived system text to Russian and never touches authored text', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const view = (title: string) => {
      const memory = journal?.memories.find((m) => m.title === title)
      if (!memory) throw new Error(`missing ${title}`)
      return localizeMemory(memory, 'ru')
    }
    expect(view('Discovered Tirisfal Glades')).toMatchObject({
      title: 'Открыта зона: Tirisfal Glades',
      description: 'Новое место стало частью твоего путешествия.',
    })
    expect(view('Fell in battle — Worgen Packleader')).toMatchObject({
      title: 'Пал в бою — Worgen Packleader',
      description: 'Последний удар: Rake.',
    })
    expect(view('Reached Level 6')).toMatchObject({
      title: 'Достигнут 6-й уровень',
      description: 'Достигнут уровень 6.',
    })
    expect(view('25 quests completed')).toMatchObject({
      title: 'Выполнено заданий: 25',
      description: 'Достигнут ещё один важный этап выполнения заданий.',
    })
    expect(view('Entered The Deadmines')).toMatchObject({
      title: 'Вход в подземелье: The Deadmines',
      description: 'Впереди новая глава твоего путешествия.',
    })
    // authored titles of manual notes and unknown types stay verbatim
    expect(view('Победа в дуэли: Рогнар').title).toBe('Победа в дуэли: Рогнар')
    expect(view('Первая ночь в Тирисфале').title).toBe('Первая ночь в Тирисфале')
  })

  it('shows unknown types through their own text, humanized', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const duel = journal?.memories.find((m) => m.type === 'PVP_DUEL')
    expect(duel?.typeLabel).toBe('PVP DUEL') // underscores → spaces, original casing kept
    expect(duel?.title).toBe('Победа в дуэли: Рогнар')
    expect(duel?.personalNote).toBe('Еле успел блок.')
  })

  it('maps journey facts: createdAt → startedAt, stats.deaths → deaths', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    expect(journal?.journey.startedAt).toBe(1_741_199_000 * 1000)
    expect(journal?.journey.deaths).toBe(1)
    // live quest/play counters are not part of SavedVariables — they stay absent
    expect(journal?.journey.completedQuests).toBeUndefined()
    expect(journal?.journey.totalPlayed).toBeUndefined()
    expect(journal?.character).toEqual({ name: 'Аэлириэн', race: '', class: '', level: 0 })
  })

  it('keeps recoveredHistory as a historical snapshot, never as current stats', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    expect(journal?.journey.recovered).toEqual({
      capturedAt: 1_741_199_000 * 1000,
      completedQuests: 3,
      playedTotal: 7200,
      level: 1,
    })
    // the snapshot must not leak into the live-stat fields the book renders
    expect(journal?.journey.completedQuests).toBeUndefined()
    expect(journal?.journey.totalPlayed).toBeUndefined()

    // no recoveredHistory at all → the field stays absent
    const plain = buildJournalFromSavedVariables(sv, 'Silvermoon:Thalorien')
    expect(plain?.journey.recovered).toBeUndefined()

    // partial snapshot: only the fields actually present are known;
    // played.total = 0 is a known zero, not an unknown
    const partial = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true, ["played"] = { ["total"] = 0 } },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const partialJournal = buildJournalFromSavedVariables(mustRead(partial), 'R:N')
    expect(partialJournal?.journey.recovered).toEqual({ playedTotal: 0 })

    // junk shapes yield nothing rather than wrong numbers
    const junk = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = "not a table",',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const junkJournal = buildJournalFromSavedVariables(mustRead(junk), 'R:N')
    expect(junkJournal?.journey.recovered).toBeUndefined()
  })

  it('carries the import order through buildChapters (SavedVariables → Journal → Chapters)', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    if (!journal) throw new Error('journal must build')
    const chapters = buildChapters(journal.memories, 'ru', 'Воспоминания без даты')
    const march = chapters.find((chapter) =>
      chapter.memories.some((m) => m.timestamp === 1_741_400_000 * 1000)
    )
    expect(march).toBeDefined()
    const equal = march?.memories.filter((m) => m.timestamp === 1_741_400_000 * 1000) ?? []
    // file order survives the whole chain: QUEST_MILESTONE was written first
    expect(equal.map((m) => m.title)).toEqual([
      '25 quests completed',
      'Discovered Western Plaguelands',
    ])
    // undated memories form the trailing chapter
    expect(chapters[chapters.length - 1].label).toBe('Воспоминания без даты')
  })

  it('falls back to counting DEATH memories when the counter is absent', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["memories"] = {',
      '\t\t\t\t{ ["type"] = "DEATH", ["timestamp"] = 100 },',
      '\t\t\t\t{ ["type"] = "DEATH", ["timestamp"] = 200 },',
      '\t\t\t\t{ ["type"] = "LEVEL", ["timestamp"] = 300 },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.journey.deaths).toBe(2)
    expect(journal?.journey.startedAt).toBeUndefined()
  })

  it('renders an empty character as an empty chronicle', () => {
    const journal = buildJournalFromSavedVariables(sv, 'Гордунни:Мрограмар')
    expect(journal?.memories).toEqual([])
    // stats.deaths = 0 is declared by the addon — it is a real zero, not a guess
    expect(journal?.journey.deaths).toBe(0)
  })

  it('drops memories without any usable content', () => {
    const source =
      'ForeverJourneyDB = { ["schemaVersion"] = 3, ["characters"] = { ["R:N"] = { ["memories"] = { { ["type"] = "ZONE" }, 42, "junk" } } } }'
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.memories).toHaveLength(1) // only the typed record survives
  })
})

describe('regression guards', () => {
  it('keeps timestamps in the journal model as normalized milliseconds', () => {
    const sv = mustRead(fixture(MAIN))
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const first = journal?.memories.find((m) => m.type === 'ZONE' && m.timestamp !== undefined)
    expect(first?.timestamp).toBe(1_741_200_000 * 1000)
    expect(Number.isInteger(first?.timestamp as number)).toBe(true)
  })
})
