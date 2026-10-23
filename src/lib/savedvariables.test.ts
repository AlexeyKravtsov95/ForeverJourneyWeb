import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildJournalFromSavedVariables, readSavedVariables } from './savedvariables'

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
      memories: 10,
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
    expect(journal?.memories).toHaveLength(10)
    const times = journal?.memories.map((m) => m.timestamp ?? Number.POSITIVE_INFINITY)
    expect(times).toEqual([...(times ?? [])].sort((a, b) => a - b))
    // the two entries with timestamp 1741400000 keep file order: QUEST_MILESTONE first
    const equal = journal?.memories.filter((m) => m.timestamp === 1_741_400_000 * 1000)
    expect(equal).toHaveLength(2)
    expect(equal?.[0].type).toBe('QUEST_MILESTONE')
    expect(equal?.[1].type).toBe('ZONE')
    // the undated entry goes last
    expect(journal?.memories[9].timestamp).toBeUndefined()
    expect(journal?.memories[9].title).toBe('Запись без даты')
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

  it('keeps automatic events raw: known labels, no invented text', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const zone = journal?.memories.find((m) => m.type === 'ZONE' && m.title === '')
    expect(zone).toMatchObject({ source: 'RECORDED', typeLabel: 'Zone discovered' })
    // data fields are not turned into fake descriptions
    expect(zone?.description).toBe('')

    const death = journal?.memories.find((m) => m.type === 'DEATH')
    expect(death?.typeLabel).toBe('Death')

    // a memory that already carries title/description keeps them untouched
    const victory = journal?.memories.find((m) => m.type === 'VICTORY')
    expect(victory).toMatchObject({
      title: 'Entered The Deadmines',
      description: 'The battle ended in victory.',
    })
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
    // quests and play time are not in SavedVariables — they must stay absent
    expect(journal?.journey.completedQuests).toBeUndefined()
    expect(journal?.journey.totalPlayed).toBeUndefined()
    expect(journal?.character).toEqual({ name: 'Аэлириэн', race: '', class: '', level: 0 })
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
