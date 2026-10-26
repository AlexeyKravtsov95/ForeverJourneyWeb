import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildJournalFromSavedVariables, readSavedVariables } from './savedvariables'
import { buildArchiveView } from './archive'
import { buildChapters } from './chapters'
import { localizeMemory } from './localize'
import { strings } from '../i18n'

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

  it('sorts mixed Cyrillic/Latin keys with explicit ru collation regardless of the runtime locale', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["Ясельный:Ярл"] = { },',
      '\t\t["Auberdine:Alpha"] = { },',
      '\t\t["Гордунни:Мрограмар"] = { },',
      '\t\t["Silvermoon:Thalorien"] = { },',
      '\t\t["Гордунни:Аэлириэн"] = { },',
      '\t},',
      '}',
    ].join('\n')
    const sv = mustRead(source)
    // ru collation keeps the whole Cyrillic block before the Latin block, so
    // this exact order holds on ru-RU and en-US runners alike. With the runtime
    // default locale the two blocks swap and this expectation fails.
    expect(sv.characters.map((c) => c.key)).toEqual([
      'Гордунни:Аэлириэн',
      'Гордунни:Мрограмар',
      'Ясельный:Ярл',
      'Auberdine:Alpha',
      'Silvermoon:Thalorien',
    ])
  })

  it('splits realm and name and summarizes memories, favorites and dates', () => {
    const sv = mustRead(fixture(MAIN))
    const aelirien = sv.characters.find((c) => c.key === AELIRIEN)
    expect(aelirien).toMatchObject({
      name: 'Аэлириэн',
      realm: 'Гордунни',
      memories: 14,
      favorites: 2,
      createdAt: 1_741_199_000 * 1000,
    })
    expect(aelirien?.firstMemoryAt).toBe(1_741_200_000 * 1000)
    expect(aelirien?.lastMemoryAt).toBe(1_741_700_000 * 1000)
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
    expect(journal?.memories).toHaveLength(14)
    const times = journal?.memories.map((m) => m.timestamp ?? Number.POSITIVE_INFINITY)
    expect(times).toEqual([...(times ?? [])].sort((a, b) => a - b))
    // the two entries with timestamp 1741400000 keep file order: QUEST_MILESTONE first
    const equal = journal?.memories.filter((m) => m.timestamp === 1_741_400_000 * 1000)
    expect(equal).toHaveLength(2)
    expect(equal?.[0].type).toBe('QUEST_MILESTONE')
    expect(equal?.[1].type).toBe('ZONE')
    // the undated entry goes last
    expect(journal?.memories[13].timestamp).toBeUndefined()
    expect(journal?.memories[13].title).toBe('Запись без даты')
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

  it('rebuilds automatic event text following the real addon handlers', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    const byTitle = (title: string) => journal?.memories.find((m) => m.title === title)

    // ZONE: data.zoneName
    expect(byTitle('Discovered Tirisfal Glades')).toMatchObject({
      source: 'RECORDED',
      typeLabel: 'DISCOVERY',
      description: 'A new place became part of your journey.',
    })
    // ZONE without data.zoneName falls back to location.name
    expect(byTitle('Discovered Western Plaguelands')).toMatchObject({
      location: 'Western Plaguelands',
      description: 'A new place became part of your journey.',
    })
    // DEATH by killer: killerName plus the killing spell (data.spellName)
    expect(byTitle('Fell in battle — Worgen Packleader')).toMatchObject({
      typeLabel: 'Death',
      description: 'Final blow: Rake.',
    })
    // DEATH by environment: data.cause == "ENVIRONMENTAL" — the cause has its
    // own title (ENVIRONMENT_TITLE_KEYS), not "Fell in battle — Drowning"
    expect(byTitle('Drowned')).toMatchObject({
      description: 'Every journey has its setbacks.',
    })
    // LEVEL: MEMORY_DESCRIPTION_LEVEL is the generic constant
    expect(byTitle('Reached Level 6')).toMatchObject({
      description: 'Your journey continues.',
    })
    // QUEST_MILESTONE: quest counter
    expect(byTitle('25 quests completed')).toMatchObject({
      description: 'Another important questing milestone has been reached.',
    })
    // INSTANCE: data.instanceName
    expect(byTitle('Entered The Deadmines')).toMatchObject({
      description: 'Another chapter of your journey lies within.',
    })
    // BOSS_VICTORY: title is data.encounterName; the description is fixed —
    // the killing-blow restoration does not apply to this type
    const boss = journal?.memories.find((m) => m.type === 'BOSS_VICTORY')
    expect(boss).toMatchObject({
      typeLabel: 'Victory',
      title: 'Edwin VanCleef',
      description: 'The battle ended in victory.',
    })
    // PROFESSION_MILESTONE LEARNED names the profession…
    const learned = journal?.memories.filter((m) => m.type === 'PROFESSION_MILESTONE')
    expect(learned).toHaveLength(2)
    expect(learned?.[0]).toMatchObject({
      typeLabel: 'PROFESSION',
      title: 'Learned profession: Алхимия',
      description: 'A new profession became part of the journey.',
    })
    // …MILESTONE prefers data.milestone over data.skillLevel (tonumber order)
    expect(learned?.[1]).toMatchObject({
      typeLabel: 'PROFESSION',
      title: 'Алхимия reached skill 150', // milestone = 150 wins over skillLevel = 160
      description: 'A new profession milestone has been reached.',
    })
  })

  it('saved display text always wins over anything derived from data', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["memories"] = {',
      '\t\t\t\t{ ["type"] = "ZONE", ["title"] = "Своё название", ["description"] = "Своё описание", ["data"] = { ["zoneName"] = "Duskwood" } },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.memories[0]).toMatchObject({ title: 'Своё название', description: 'Своё описание' })
  })

  it('every death gets the addon title: exact environmental keys or the fallbacks', () => {
    // an unknown environmental type has its own fallback title, and deaths
    // without any known cause get the generic one
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["memories"] = {',
      '\t\t\t\t{ ["type"] = "DEATH", ["data"] = { ["cause"] = "ENVIRONMENTAL", ["environmentalType"] = "QUICKSAND" } },',
      '\t\t\t\t{ ["type"] = "DEATH", ["data"] = { } },',
      '\t\t\t\t{ ["type"] = "DEATH", ["data"] = { ["spellID"] = 12345 } },',
      '\t\t\t\t{ ["type"] = "DEATH", ["data"] = { ["cause"] = "ENVIRONMENTAL", ["environmentalType"] = "LAVA", ["killerName"] = "Murloc" } },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.memories).toHaveLength(4)
    const titles = journal?.memories.map((m) => m.title)
    expect(titles).toEqual(['Lost to the environment', 'Fell in battle', 'Fell in battle', 'Perished in lava'])
    for (const memory of journal?.memories ?? []) {
      expect(memory.description).toBe('Every journey has its setbacks.')
    }
  })

  it('derives nothing when the data is missing, unknown or has no confirmed template', () => {
    // an empty zone, a non-numeric level, an unknown profession kind and a
    // profession without a name — none of these may produce invented text;
    // the MILESTONE number defaulting to 0 is addon behavior, not invention
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["memories"] = {',
      '\t\t\t\t{ ["type"] = "ZONE", ["data"] = { } },',
      '\t\t\t\t{ ["type"] = "LEVEL", ["data"] = { ["level"] = "many" } },',
      '\t\t\t\t{ ["type"] = "PROFESSION_MILESTONE", ["data"] = { ["kind"] = "MYSTERY" } },',
      '\t\t\t\t{ ["type"] = "PROFESSION_MILESTONE", ["data"] = { ["kind"] = "MILESTONE", ["skillLevel"] = 90 } },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.memories).toHaveLength(4)
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
      title: 'Открыта локация: Tirisfal Glades',
      description: 'Новое место стало частью твоего пути.',
    })
    expect(view('Fell in battle — Worgen Packleader')).toMatchObject({
      title: 'Пал в бою — Worgen Packleader',
      description: 'Последний удар: Rake.',
    })
    expect(view('Reached Level 6')).toMatchObject({
      title: 'Уровень повышен до 6',
      description: 'Путешествие продолжается.',
    })
    expect(view('25 quests completed')).toMatchObject({
      title: 'Выполнено 25 заданий',
      description: 'Достигнута новая важная веха в путешествии.',
    })
    expect(view('Entered The Deadmines')).toMatchObject({
      title: 'Вход в подземелье: The Deadmines',
      description: 'Впереди ещё одна глава путешествия.',
    })
    // environmental death title comes from ENVIRONMENT_TITLE_KEYS, exact RU
    expect(view('Drowned')).toMatchObject({
      title: 'Утонул',
      description: 'Даже поражения становятся частью истории.',
    })
    // boss encounter name stays verbatim; the description is the fixed string
    expect(view('Edwin VanCleef')).toMatchObject({
      typeLabel: 'Победа',
      title: 'Edwin VanCleef',
      description: 'Сражение завершилось победой.',
    })
    // profession templates of both kinds
    expect(view('Learned profession: Алхимия')).toMatchObject({
      title: 'Изучена профессия: Алхимия',
      description: 'Новая профессия стала частью путешествия.',
    })
    expect(view('Алхимия reached skill 150')).toMatchObject({
      title: 'Алхимия: навык повышен до 150',
      description: 'Достигнута новая профессиональная веха.',
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

  it('keeps recoveredHistory as a historical snapshot inside the archive, never as current stats', () => {
    const journal = buildJournalFromSavedVariables(sv, AELIRIEN)
    expect(journal?.archive?.recovered).toEqual({
      capturedAt: 1_741_199_000 * 1000,
      completedQuests: 3,
      playedTotal: 7200,
      level: 1,
    })
    // the snapshot must not leak into the live-stat fields the book renders
    expect(journal?.journey.completedQuests).toBeUndefined()
    expect(journal?.journey.totalPlayed).toBeUndefined()

    // no recoveredHistory at all → the archive carries only the other blocks
    const plain = buildJournalFromSavedVariables(sv, 'Silvermoon:Thalorien')
    expect(plain?.archive?.recovered).toBeUndefined()

    // an uninitialized snapshot carries default values, not data — skip it
    const uninitialized = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = false, ["completedQuests"] = { ["count"] = 900 } },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    expect(
      buildJournalFromSavedVariables(mustRead(uninitialized), 'R:N')?.archive?.recovered
    ).toBeUndefined()

    // missing initialized flag counts as not initialized
    const noFlag = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["played"] = { ["total"] = 100 } },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    expect(buildJournalFromSavedVariables(mustRead(noFlag), 'R:N')?.archive?.recovered).toBeUndefined()

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
    expect(partialJournal?.archive?.recovered).toEqual({ playedTotal: 0 })

    // play time is seconds and must not be capped by the quest counter limit:
    // a veteran account snapshot can exceed a million seconds
    const veteran = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true, ["capturedAt"] = 1741000000,',
      '\t\t\t\t["completedQuests"] = { ["count"] = 2500 }, ["played"] = { ["total"] = 18000000 },',
      '\t\t\t\t["level"] = 70 },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const veteranJournal = buildJournalFromSavedVariables(mustRead(veteran), 'R:N')
    expect(veteranJournal?.archive?.recovered).toEqual({
      capturedAt: 1_741_000_000 * 1000,
      completedQuests: 2500,
      playedTotal: 18_000_000,
      level: 70,
    })

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
    expect(junkJournal?.archive?.recovered).toBeUndefined()
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

describe('character archive (FJ-WEB-06)', () => {
  const STRAIDER = 'ClassicBetaPvP:Straider'
  const straiderFixture = () => mustRead(fixture('ForeverJourney-straider.lua'))

  it('builds the full Straider archive: snapshot, professions, zones, saved counter', () => {
    const journal = buildJournalFromSavedVariables(straiderFixture(), STRAIDER)
    if (!journal) throw new Error('straider journal must build')

    // chronicle: exactly 7 memories — 4 ZONE + 3 DEATH, nothing synthesized
    expect(journal.memories).toHaveLength(7)
    expect(journal.memories.filter((m) => m.type === 'ZONE')).toHaveLength(4)
    expect(journal.memories.filter((m) => m.type === 'DEATH')).toHaveLength(3)

    // saved death counter is the addon's own 24 — not the 3 chronicle events
    expect(journal.journey.deaths).toBe(24)
    expect(journal.archive?.deathsCounter).toBe(24)

    // snapshot values exactly as archived; currentLevel (11827 s at level) is
    // play time at the current level and never becomes the character level;
    // questIDs (209 unique) and the snapshot money balance ride along
    expect(journal.archive?.recovered?.capturedAt).toBe(
      Math.floor(Date.UTC(2026, 9, 10, 5, 35) / 1000) * 1000
    )
    expect(journal.archive?.recovered?.completedQuests).toBe(182)
    expect(journal.archive?.recovered?.playedTotal).toBe(183_754)
    expect(journal.archive?.recovered?.playedCurrentLevel).toBe(11_827)
    expect(journal.archive?.recovered?.level).toBe(25)
    expect(journal.archive?.recovered?.moneyBalance).toBe(96_179)
    expect(journal.archive?.recovered?.questIDs).toHaveLength(209)
    expect(journal.archive?.recovered?.questIDs?.slice(0, 4)).toEqual([8, 25, 235, 264])
    expect(new Set(journal.archive?.recovered?.questIDs ?? []).size).toBe(209)
    expect(journal.character.level).toBe(0) // no live level in SavedVariables

    // tracked money is kept outside the snapshot, exactly as saved
    expect(journal.archive?.money).toEqual({ earned: 2_833, current: 90_720, spent: 8_292 })

    // three professions with saved skill and maximum
    expect(journal.archive?.professions).toEqual([
      { name: 'Горное дело', skillLevel: 94, maxSkillLevel: 150 },
      { name: 'Инженерное дело', skillLevel: 91, maxSkillLevel: 150 },
      { name: 'Кулинария', skillLevel: 25, maxSkillLevel: 75 },
    ])

    // six visited zones in the real mapID form — deliberately not equal to the
    // four ZONE events of the chronicle; identifiers never surface as names
    expect(journal.archive?.zones).toHaveLength(6)
    const byName = new Map((journal.archive?.zones ?? []).map((zone) => [zone.name, zone]))
    expect(byName.get('Калимдор')?.firstSeenAt).toBe(1_791_612_000 * 1000)
    expect(byName.get('Ясеневый лес')?.firstSeenAt).toBe(1_791_612_003 * 1000)
    expect(byName.get('Азшара')?.firstSeenAt).toBe(1_791_616_004 * 1000)
    expect(byName.get('Дуротар')?.firstSeenAt).toBe(1_791_616_024 * 1000)
    expect(byName.get('Оргриммар')?.firstSeenAt).toBe(1_791_616_025 * 1000)
    expect(byName.get('Степи')?.firstSeenAt).toBe(1_791_617_013 * 1000)
    for (const zone of journal.archive?.zones ?? []) {
      expect(/^\d+$/.test(zone.name)).toBe(false) // a mapID must never leak as a name
    }

    // the shared archive view lists the zones chronologically with their dates
    const view = buildArchiveView(journal, strings.ru, 'ru')
    expect(view?.zones?.items.map((zone) => zone.name)).toEqual([
      'Калимдор',
      'Ясеневый лес',
      'Азшара',
      'Дуротар',
      'Оргриммар',
      'Степи',
    ])
  })

  it('questIDs never become memories and currentLevel never becomes a level', () => {
    const journal = buildJournalFromSavedVariables(straiderFixture(), STRAIDER)
    // 12 questIDs in the snapshot + 7 real memories = still exactly 7
    expect(journal?.memories).toHaveLength(7)
    expect(journal?.memories.every((memory) => memory.type === 'ZONE' || memory.type === 'DEATH')).toBe(true)
    expect(journal?.archive?.recovered?.level).toBe(25)
  })

  it('archives of different characters never mix', () => {
    const journal = buildJournalFromSavedVariables(straiderFixture(), 'ClassicBetaPvP:Testpilot')
    if (!journal) throw new Error('journal must build')
    expect(journal.character.name).toBe('Testpilot')
    expect(journal.memories).toHaveLength(1)
    expect(journal.archive?.recovered).toEqual({
      capturedAt: Math.floor(Date.UTC(2026, 6, 14) / 1000) * 1000,
      completedQuests: 12,
      questIDs: [7, 11, 13],
      playedTotal: 3600,
      playedCurrentLevel: 1800,
      level: 10,
    })
    // Testpilot's own tracked money — never Straider's figures
    expect(journal.archive?.money).toEqual({ earned: 500, current: 1234, spent: 100 })
    expect(journal.archive?.professions).toEqual([
      { name: 'Кожевничество', skillLevel: 45, maxSkillLevel: 75 },
    ])
    expect(journal.archive?.zones).toEqual([
      { name: 'Дун Морог', firstSeenAt: Math.floor(Date.UTC(2026, 6, 14) / 1000) * 1000 },
    ])
  })

  it('an uninitialized snapshot drops its professions too', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = false,',
      '\t\t\t\t["professions"] = { { ["name"] = "Горное дело", ["skillLevel"] = 94, ["maxSkillLevel"] = 150 } } },',
      '\t\t\t["visitedZones"] = { ["Дун Морог"] = 1780401600 },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.archive?.recovered).toBeUndefined()
    expect(journal?.archive?.professions).toEqual([])
    // zones are tracked independently of the snapshot and stay
    expect(journal?.archive?.zones).toEqual([{ name: 'Дун Морог', firstSeenAt: 1_780_401_600 * 1000 }])
  })

  it('professions survive only with a name; invalid numbers are dropped, not zeroed', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true,',
      '\t\t\t\t["professions"] = {',
      '\t\t\t\t\t{ ["skillLevel"] = 94 },',
      '\t\t\t\t\t{ ["name"] = "Травничество" },',
      '\t\t\t\t\t{ ["name"] = "Портняжное дело", ["skillLevel"] = -5, ["maxSkillLevel"] = 0 },',
      '\t\t\t\t\t{ ["name"] = "Наложение чар", ["skillLevel"] = 200.7, ["maxSkillLevel"] = 300 },',
      '\t\t\t\t\t"junk",',
      '\t\t\t\t},',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.archive?.professions).toEqual([
      { name: 'Травничество' }, // name only — no valid numbers, none invented
      { name: 'Портняжное дело' }, // -5 and 0 are defaults/junk → dropped, not zeroed
      { name: 'Наложение чар', skillLevel: 200, maxSkillLevel: 300 }, // floored
    ])
  })

  it('visitedZones: confirmed mapID form plus the legacy map and undated entries', () => {
    // the real addon shape: numeric mapID keys → { name, firstSeenAt }
    const mapIdForm = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["visitedZones"] = {',
      '\t\t\t\t[1447] = { ["name"] = "Азшара", ["firstSeenAt"] = 1791573870 },',
      '\t\t\t\t[9999] = { ["firstSeenAt"] = 1791573870 },',
      '\t\t\t\t[1411] = { ["name"] = "Дуротар" },',
      '\t\t\t\t[1234] = 1791573870,',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const mapId = buildJournalFromSavedVariables(mustRead(mapIdForm), 'R:N')
    // model order follows the file's table keys (numeric keys ascend); the
    // display order is the view's chronological sort, asserted separately
    const byName = new Map((mapId?.archive?.zones ?? []).map((zone) => [zone.name, zone]))
    expect([...byName.keys()].sort()).toEqual(['Азшара', 'Дуротар'])
    expect(byName.get('Азшара')).toEqual({ name: 'Азшара', firstSeenAt: 1_791_573_870 * 1000 })
    expect(byName.get('Дуротар')).toEqual({ name: 'Дуротар' }) // no time → undated

    // legacy shapes keep working: zone-name map with a bare time or a table,
    // and record entries with zone/firstSeen/timestamp field names
    const legacyMap = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["visitedZones"] = {',
      '\t\t\t\t["Дун Морог"] = 1780401600,',
      '\t\t\t\t["Лох Модан"] = { ["firstSeen"] = 1781006400 },',
      '\t\t\t\t["Тернистая долина"] = "не дата",',
      '\t\t\t\t[""] = 1780401600,',
      '\t\t\t\t{ ["zone"] = "Танарис", ["timestamp"] = 1781400000 },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const legacy = buildJournalFromSavedVariables(mustRead(legacyMap), 'R:N')
    const legacyByName = new Map((legacy?.archive?.zones ?? []).map((zone) => [zone.name, zone]))
    expect([...legacyByName.keys()].sort()).toEqual([
      'Дун Морог',
      'Лох Модан',
      'Танарис',
      'Тернистая долина',
    ])
    expect(legacyByName.get('Дун Морог')).toEqual({ name: 'Дун Морог', firstSeenAt: 1_780_401_600 * 1000 })
    expect(legacyByName.get('Лох Модан')).toEqual({ name: 'Лох Модан', firstSeenAt: 1_781_006_400 * 1000 })
    expect(legacyByName.get('Тернистая долина')).toEqual({ name: 'Тернистая долина' }) // invalid time
    expect(legacyByName.get('Танарис')).toEqual({ name: 'Танарис', firstSeenAt: 1_781_400_000 * 1000 })
  })

  it('empty professions and visitedZones leave the archive without those blocks', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["stats"] = { ["deaths"] = 3 },',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true, ["professions"] = { } },',
      '\t\t\t["visitedZones"] = { },',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.archive).toEqual({ professions: [], zones: [], deathsCounter: 3 })

    // nothing archival at all → no archive block, no section in the book
    const bare = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = { ["createdAt"] = 1780401600 },',
      '\t},',
      '}',
    ].join('\n')
    const bareJournal = buildJournalFromSavedVariables(mustRead(bare), 'R:N')
    expect(bareJournal?.archive).toBeUndefined()
  })

  it('dangerous Lua keys stay plain zone and profession names, never prototype members', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true,',
      '\t\t\t\t["professions"] = {',
      '\t\t\t\t\t{ ["name"] = "__proto__", ["skillLevel"] = 10, ["maxSkillLevel"] = 75 },',
      '\t\t\t\t\t{ ["name"] = "constructor", ["skillLevel"] = 20, ["maxSkillLevel"] = 75 },',
      '\t\t\t\t},',
      '\t\t\t},',
      '\t\t\t["visitedZones"] = {',
      '\t\t\t\t["__proto__"] = 1780401600,',
      '\t\t\t\t["constructor"] = 1780401700,',
      '\t\t\t\t["toString"] = 1780401800,',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.archive?.professions.map((p) => p.name)).toEqual(['__proto__', 'constructor'])
    expect(journal?.archive?.zones).toHaveLength(3)
    expect(journal?.archive?.zones.map((z) => z.name)).toEqual(['__proto__', 'constructor', 'toString'])
    // the parser's null-prototype dictionaries make these plain own keys —
    // Object.prototype pollution is separately covered by the parser suite
  })

  it('invalid snapshot numbers are dropped instead of becoming zeros', () => {
    const source = [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      '\t\t\t["recoveredHistory"] = { ["initialized"] = true,',
      '\t\t\t\t["level"] = 0, ["capturedAt"] = -1,',
      '\t\t\t\t["completedQuests"] = { ["count"] = -3 },',
      '\t\t\t\t["played"] = { ["total"] = "many" },',
      '\t\t\t},',
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')
    const journal = buildJournalFromSavedVariables(mustRead(source), 'R:N')
    expect(journal?.archive?.recovered).toBeUndefined() // every number invalid → no snapshot
    expect(journal?.archive?.deathsCounter).toBeUndefined()
    // but a separately valid level must survive next to invalid neighbors
    const mixed = source.replace('["level"] = 0,', '["level"] = 42,')
    const mixedJournal = buildJournalFromSavedVariables(mustRead(mixed), 'R:N')
    expect(mixedJournal?.archive?.recovered).toEqual({ level: 42 })
  })
})

describe('economy & quest registry import (FJ-WEB-07)', () => {
  const characterLua = (body: string) =>
    [
      'ForeverJourneyDB = {',
      '\t["schemaVersion"] = 3,',
      '\t["characters"] = {',
      '\t\t["R:N"] = {',
      ...body.split('\n').map((line) => `\t\t\t${line}`),
      '\t\t},',
      '\t},',
      '}',
    ].join('\n')

  it('keeps the snapshot balance and the tracked money apart, with valid zeros', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          [
            '["recoveredHistory"] = { ["initialized"] = true,',
            '\t["money"] = { ["current"] = 12345 },',
            '\t["completedQuests"] = { ["count"] = 5 } },',
            '["money"] = { ["earned"] = 0, ["current"] = 23456, ["spent"] = 0 },',
          ].join('\n')
        )
      ),
      'R:N'
    )
    // 12345 ≠ 23456: the two balances are different saved values, never merged
    expect(journal?.archive?.recovered?.moneyBalance).toBe(12_345)
    expect(journal?.archive?.money).toEqual({ earned: 0, current: 23_456, spent: 0 })
    // a valid zero is kept as a real value, not turned into "unknown"
    expect(journal?.archive?.money?.earned).toBe(0)
  })

  it('drops invalid money numbers instead of zeroing or flooring them', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          [
            '["money"] = {',
            '\t["earned"] = -100,',
            '\t["current"] = 90.5,',
            '\t["spent"] = "many",',
            '\t},',
            '["recoveredHistory"] = { ["initialized"] = true,',
            '\t["money"] = { ["current"] = 90.5 } },',
          ].join('\n')
        )
      ),
      'R:N'
    )
    // negative, fractional and string values all vanish
    expect(journal?.archive?.money).toBeUndefined()
    expect(journal?.archive?.recovered?.moneyBalance).toBeUndefined()
    // a partial record keeps only its valid fields
    const partial = buildJournalFromSavedVariables(
      mustRead(
        characterLua('["money"] = { ["current"] = 500, ["earned"] = -1, ["spent"] = 2.5 }')
      ),
      'R:N'
    )
    expect(partial?.archive?.money).toEqual({ current: 500 })
    // an empty money table is not a money record at all
    const empty = buildJournalFromSavedVariables(
      mustRead(characterLua('["money"] = { }')),
      'R:N'
    )
    expect(empty?.archive).toBeUndefined()
    // infinities never even reach the model: the safe parser rejects the literal
    expect(
      readSavedVariables(characterLua('["money"] = { ["current"] = 1e999 }')).status
    ).toBe('error')
  })

  it('caps an absurdly large money amount at the game limit (10 million gold)', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(characterLua('["money"] = { ["current"] = 999999999999999999 }')),
      'R:N'
    )
    expect(journal?.archive?.money?.current).toBe(100_000_000_000_000)
  })

  it('an uninitialized snapshot hides its money; tracked money is independent of the snapshot', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          [
            '["recoveredHistory"] = { ["initialized"] = false,',
            '\t["money"] = { ["current"] = 777 },',
            '\t["completedQuests"] = { ["count"] = 900, ["questIDs"] = { 1, 2 } },',
            '\t["played"] = { ["total"] = 100, ["currentLevel"] = 50 } },',
            '["money"] = { ["current"] = 777 },',
          ].join('\n')
        )
      ),
      'R:N'
    )
    // snapshot data (money, counter, IDs, play times) is not trusted…
    expect(journal?.archive?.recovered).toBeUndefined()
    // …but the addon's tracked money outside the snapshot survives on its own
    expect(journal?.archive?.money).toEqual({ current: 777 })
  })

  it('quest IDs: only positive integers survive, duplicates keep first order, junk is skipped', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          [
            '["recoveredHistory"] = { ["initialized"] = true,',
            '\t["completedQuests"] = { ["count"] = 7, ["questIDs"] = {',
            '\t\t25, 8, 25.5, 0, -3, "junk", 8, 235, 25, 10000001, 264,',
            '\t} } },',
          ].join('\n')
        )
      ),
      'R:N'
    )
    // documented policy: valid = positive integer ≤ 10⁷; duplicates collapse
    // to the first occurrence in file order; everything else is dropped
    expect(journal?.archive?.recovered?.questIDs).toEqual([25, 8, 235, 264])
    expect(journal?.archive?.recovered?.completedQuests).toBe(7) // both kept as-is
  })

  it('the quest ID list is capped like every archive list (20 000 entries)', () => {
    const ids = Array.from({ length: 20_001 }, (_, i) => i + 1)
    const luaIds = `{ ${ids.join(', ')} }`
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          `["recoveredHistory"] = { ["initialized"] = true, ["completedQuests"] = { ["count"] = 1, ["questIDs"] = ${luaIds} } }`
        )
      ),
      'R:N'
    )
    expect(journal?.archive?.recovered?.questIDs).toHaveLength(20_000)
    expect(journal?.archive?.recovered?.questIDs?.[0]).toBe(1)
    expect(journal?.archive?.recovered?.questIDs?.[19_999]).toBe(20_000)
  })

  it('played.currentLevel is a duration in seconds, distinct from played.total', () => {
    const journal = buildJournalFromSavedVariables(
      mustRead(
        characterLua(
          '["recoveredHistory"] = { ["initialized"] = true, ["played"] = { ["total"] = 183754, ["currentLevel"] = 11827 } }'
        )
      ),
      'R:N'
    )
    expect(journal?.archive?.recovered?.playedTotal).toBe(183_754)
    expect(journal?.archive?.recovered?.playedCurrentLevel).toBe(11_827)
    expect(journal?.character.level).toBe(0) // never promoted to a level
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
