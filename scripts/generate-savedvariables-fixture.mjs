#!/usr/bin/env node
// Reference SavedVariables fixtures for FJ-WEB-05 — synthetic ForeverJourney.lua
// files shaped exactly like WoW writes them (bracketed keys, tab indent, one
// assignment per global, Unix-second timestamps, \ddd escapes for control
// characters). The main fixture uses CRLF line endings like a real Windows
// WTF/Account/<ACCOUNT>/SavedVariables file.
// Usage: npm run generate:sv  → fixtures/savedvariables/*.lua
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'fixtures', 'savedvariables')

/** Serializes a JS value into the WoW SavedVariables Lua subset. */
function lua(value, indent = '\t') {
  if (typeof value === 'string') return luaString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const inner = indent + '\t'
  const fields = Object.entries(value).map(([key, val]) => {
    // WoW writes numeric table keys unquoted ([1447] = { … }), strings quoted
    const keyLua = /^\d+$/.test(key) ? key : luaString(key)
    return `${inner}[${keyLua}] = ${lua(val, inner)}`
  })
  if (fields.length === 0) return '{ }'
  return `{\n${fields.join(',\n')},\n${indent}}`
}

function luaString(text) {
  let out = '"'
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (code < 0x20 || code === 0x7f) out += `\\${String(code).padStart(3, '0')}`
    else out += ch
  }
  return out + '"'
}

function memory({
  type,
  source,
  timestamp,
  location,
  favorite = false,
  personalNote = '',
  data = {},
  title,
  description,
  chapterId,
}) {
  const record = {}
  if (type !== undefined) record.type = type
  if (source !== undefined) record.source = source
  if (timestamp !== undefined) record.timestamp = timestamp
  if (location !== undefined) record.location = location
  if (favorite) record.favorite = true
  if (personalNote) record.personalNote = personalNote
  if (Object.keys(data).length > 0) record.data = data
  if (title !== undefined) record.title = title
  if (description !== undefined) record.description = description
  if (chapterId !== undefined) record.chapterId = chapterId
  return record
}

/** Lua arrays are 1-based; object keys "1".."n" serialize into the array part. */
function indexed(items) {
  return Object.fromEntries(items.map((item, i) => [String(i + 1), item]))
}

// ---------------------------------------------------------------------------
// Main fixture: three characters on two realms, mixed event types, cyrillic
// text, escapes, equal timestamps, an undated entry and a precomputed title.
// ---------------------------------------------------------------------------
const aelirienMemories = [
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: 1_741_200_000,
    location: 'Тирисфальские леса',
    data: { zoneName: 'Tirisfal Glades' }, // confirmed field name (Memories.lua)
  }),
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: 1_741_206_000,
    location: 'Подгород',
    favorite: true,
    personalNote: 'Первая запись.\nВторая строка с "кавычками" и слэшем \\ назад.',
    data: {
      title: 'Первая ночь в Тирисфале',
      note: 'Туман стелился по земле, а в воздухе пахло прелой листвой и чем-то ещё, неуловимо-печальным.',
    },
  }),
  // environmental death: no killer, data.cause == "ENVIRONMENTAL" plus a known
  // environmentalType — each cause has its own title (ENVIRONMENT_TITLE_KEYS)
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: 1_741_250_000,
    location: 'Озеро Лордамер',
    data: { cause: 'ENVIRONMENTAL', environmentalType: 'DROWNING' },
  }),
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: 1_741_290_000,
    location: 'Серебряный бор',
    data: { killerName: 'Worgen Packleader', killerNameRaw: 'Worgen Packleader', spellName: 'Rake' },
  }),
  memory({
    type: 'LEVEL',
    source: 'RECORDED',
    timestamp: 1_741_300_000,
    location: 'Серебряный бор',
    data: { level: 6 },
  }),
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: 1_741_310_000,
    location: 'Подгород',
    data: {
      title: 'Табличка на мосту',
      note: '«Смотри под ноги — мост шаткий». Кто-то выцарапал это ножом.',
    },
  }),
  // equal timestamps: original file order must survive (stable chronology)
  memory({
    type: 'QUEST_MILESTONE',
    source: 'RECORDED',
    timestamp: 1_741_400_000,
    location: 'Тирисфальские леса',
    data: { quests: 25 },
  }),
  // zone without data.zoneName — the title falls back to location.name,
  // and location itself is the table shape some event handlers store
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: 1_741_400_000,
    location: { name: 'Western Plaguelands', map: 'Kalimdor' },
  }),
  memory({
    type: 'INSTANCE',
    source: 'RECORDED',
    timestamp: 1_741_420_000,
    location: 'Мертвые копи',
    data: { instanceName: 'The Deadmines' },
  }),
  memory({
    type: 'PVP_DUEL', // unknown type for the importer — must keep its own text
    source: 'RECORDED',
    timestamp: 1_741_450_000,
    location: 'Подгород',
    favorite: true,
    personalNote: 'Еле успел блок.',
    data: { opponent: 'Рогнар', result: 'win' },
    title: 'Победа в дуэли: Рогнар',
  }),
  // boss victory (BossVictoryMilestones.lua): the title is data.encounterName,
  // the description is a fixed localized string
  memory({
    type: 'BOSS_VICTORY',
    source: 'RECORDED',
    timestamp: 1_741_500_000,
    location: 'Мертвые копи',
    data: { encounterName: 'Edwin VanCleef' },
  }),
  // profession milestones (ProfessionMilestones.lua): data.kind selects the
  // template; the MILESTONE number prefers data.milestone over data.skillLevel
  // (tonumber order in the Lua handler)
  memory({
    type: 'PROFESSION_MILESTONE',
    source: 'RECORDED',
    timestamp: 1_741_600_000,
    location: 'Подгород',
    data: { kind: 'LEARNED', professionName: 'Алхимия', skillLine: 'alchemy', skillLevel: 1 },
  }),
  memory({
    type: 'PROFESSION_MILESTONE',
    source: 'RECORDED',
    timestamp: 1_741_700_000,
    location: 'Подгород',
    data: {
      kind: 'MILESTONE',
      professionName: 'Алхимия',
      skillLine: 'alchemy',
      skillLevel: 160,
      milestone: 150,
    },
  }),
  // undated entry: no timestamp at all
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    location: 'Лордерон',
    data: { title: 'Запись без даты', note: 'Когда это было — уже не помню.' },
  }),
]

const thalorienMemories = [
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: 1_742_700_000,
    location: 'Eversong Woods',
    data: { zoneName: 'Eversong Woods' },
  }),
  memory({
    type: 'LEVEL',
    source: 'RECORDED',
    timestamp: 1_742_710_000,
    location: 'Eversong Woods',
    data: { level: 12 },
  }),
  // achievement with no confirmed display template: no derived text,
  // the neutral type label carries the entry
  memory({
    type: 'ACHIEVEMENT',
    source: 'RECORDED',
    timestamp: 1_742_800_000,
    location: 'Silvermoon City',
    data: { achievement: 'Exploring Eversong Woods' },
  }),
]

const mainDb = {
  schemaVersion: 3,
  characters: {
    'Гордунни:Аэлириэн': {
      createdAt: 1_741_199_000,
      stats: { deaths: 1 },
      // historical snapshot captured when the addon first saw the character
      // (schema v3): kept, but never shown as current stats
      recoveredHistory: {
        initialized: true,
        capturedAt: 1_741_199_000,
        level: 1,
        completedQuests: { count: 3 },
        played: { total: 7200 },
      },
      memories: indexed(aelirienMemories),
    },
    'Гордунни:Мрограмар': {
      // no memories yet — empty chronicle must render fine
      createdAt: 1_741_500_000,
      stats: { deaths: 0 },
    },
    'Silvermoon:Thalorien': {
      createdAt: 1_742_699_000,
      stats: { deaths: 0 },
      memories: indexed(thalorienMemories),
    },
  },
}

const otherAddonDb = {
  schemaVersion: 9,
  characters: { 'Ghost:Pilgrim': { createdAt: 1 } },
}

const mainLua = [
  '-- ForeverJourney SavedVariables — synthetic test fixture (FJ-WEB-05)',
  `SomeOtherDB = ${lua(otherAddonDb)}`,
  `ForeverJourneyDB = ${lua(mainDb)}`,
  '',
].join('\r\n')

const schemaTwoLua = [
  '-- fixture: old addon schema',
  `ForeverJourneyDB = ${lua({ schemaVersion: 2, characters: { 'Test:Old': { createdAt: 1_700_000_000 } } })}`,
  '',
].join('\n')

const otherDbLua = [
  '-- fixture: no ForeverJourneyDB global at all',
  `TotallyDifferentDB = ${lua({ version: 1 })}`,
  '',
].join('\n')

const brokenLua = [
  'ForeverJourneyDB = {',
  '\t["schemaVersion"] = 3,',
  '\t["characters"] = {',
  '\t\t["Test:Broken"] = {',
].join('\n')

// ---------------------------------------------------------------------------
// FJ-WEB-06 Character Archive fixture: ClassicBetaPvP:Straider — sanitized,
// built to the real archived values of the beta character the task contract
// describes (7 memories, 24 saved deaths vs 3 DEATH events, 6 visited zones
// vs 4 ZONE events, snapshot level 25 / 182 quests / 183754 s played, three
// professions). A second synthetic character proves archives never merge.
// FJ-WEB-06.1: the beta character was played in a single session, so every
// Straider timestamp is a different time inside one calendar day (2026-10-10
// UTC) — the cover must show one date, not a same-day range.
// FJ-WEB-07: the snapshot also carries the economy and quest registry data of
// the real file — money balances (96179 copper at the snapshot, 90720 last
// recorded with 2833/8292 tracked earned/spent), 11827 s played at level 25,
// and 209 unique quest IDs against the saved counter of 182.
// ---------------------------------------------------------------------------
const day = (hour, minute = 0) => Math.floor(Date.UTC(2026, 9, 10, hour, minute) / 1000)
const later = (month, dayOfMonth) => Math.floor(Date.UTC(2026, month, dayOfMonth) / 1000)

const straiderMemories = [
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: day(6, 20),
    location: 'Дун Морог',
    data: { zoneName: 'Dun Morogh' },
  }),
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: day(7, 45),
    location: 'Лох Модан',
    data: { zoneName: 'Loch Modan' },
  }),
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: day(8, 30),
    location: 'Лох Модан',
    data: { cause: 'ENVIRONMENTAL', environmentalType: 'FALLING' },
  }),
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: day(9, 35),
    location: 'Болото Печали',
    data: { zoneName: 'Wetlands' },
  }),
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: day(10, 50),
    location: 'Болото Печали',
    data: { killerName: 'Blackrock Ogre', killerNameRaw: 'Blackrock Ogre', spellName: 'Ogre Smash' },
  }),
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: day(12, 5),
    location: 'Сумеречный лес',
    data: { zoneName: 'Duskwood' },
  }),
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: day(13, 40),
    location: 'Сумеречный лес',
    data: {},
  }),
]

// six visited zones in the real addon shape — numeric mapID keys →
// { name, firstSeenAt } — deliberately not equal to the four ZONE events
// above; the identifiers must never surface as zone names. Discovery offsets
// inside the same play day are kept, so chronological order is unchanged.
const zoneSeen = (offsetSeconds) => day(6) + offsetSeconds
const straiderVisitedZones = {
  1447: { name: 'Азшара', firstSeenAt: zoneSeen(4004) },
  1413: { name: 'Степи', firstSeenAt: zoneSeen(5013) },
  1440: { name: 'Ясеневый лес', firstSeenAt: zoneSeen(3) },
  1414: { name: 'Калимдор', firstSeenAt: zoneSeen(0) },
  1411: { name: 'Дуротар', firstSeenAt: zoneSeen(4024) },
  1454: { name: 'Оргриммар', firstSeenAt: zoneSeen(4025) },
}

// 209 unique positive quest IDs, deterministic: the four IDs of the task
// contract's structural example, then a non-colliding arithmetic run
// (300..912 step 3 → 205 values; 4 + 205 = 209). The saved counter stays 182
// on purpose — the real file disagrees with itself and both values are kept.
const straiderQuestIds = [8, 25, 235, 264, ...Array.from({ length: 205 }, (_, i) => 300 + i * 3)]

const straiderDb = {
  schemaVersion: 3,
  addonVersion: '0.9.8',
  characters: {
    'ClassicBetaPvP:Straider': {
      createdAt: day(5, 30),
      stats: { deaths: 24 },
      recoveredHistory: {
        initialized: true,
        capturedAt: day(5, 35),
        level: 25,
        completedQuests: {
          // the real file: the saved counter (182) and the number of unique
          // saved IDs (209) legitimately differ — both values are preserved;
          // raw quest IDs must never become extra memories on the site
          count: 182,
          questIDs: indexed(straiderQuestIds),
        },
        money: { current: 96179 },
        played: {
          total: 183754,
          currentLevel: 11827, // play time at the recorded level, NOT a level
        },
        professions: indexed([
          { name: 'Горное дело', skillLevel: 94, maxSkillLevel: 150 },
          { name: 'Инженерное дело', skillLevel: 91, maxSkillLevel: 150 },
          { name: 'Кулинария', skillLevel: 25, maxSkillLevel: 75 },
        ]),
      },
      // money tracked by the addon outside the snapshot — earned/spent are the
      // registered balance changes, current is the last saved balance
      money: { earned: 2833, current: 90720, spent: 8292 },
      visitedZones: straiderVisitedZones,
      memories: indexed(straiderMemories),
    },
    // second synthetic character: archives of different characters never mix;
    // its snapshot carries no money, so its Economy shows the three tracked
    // values without a snapshot balance, and its registry shows the mismatch
    // note (counter 12 vs 3 saved IDs)
    'ClassicBetaPvP:Testpilot': {
      createdAt: later(6, 14),
      stats: { deaths: 2 },
      recoveredHistory: {
        initialized: true,
        capturedAt: later(6, 14),
        level: 10,
        completedQuests: { count: 12, questIDs: indexed([7, 11, 13]) },
        played: { total: 3600, currentLevel: 1800 },
        professions: indexed([{ name: 'Кожевничество', skillLevel: 45, maxSkillLevel: 75 }]),
      },
      money: { earned: 500, current: 1234, spent: 100 },
      visitedZones: { 'Дун Морог': later(6, 14) },
      memories: indexed([
        memory({
          type: 'ZONE',
          source: 'RECORDED',
          timestamp: later(6, 15),
          location: 'Дун Морог',
          data: { zoneName: 'Dun Morogh' },
        }),
      ]),
    },
  },
}

const straiderLua = [
  '-- FJ-WEB-06 fixture: sanitized Character Archive of the beta character',
  `ForeverJourneyDB = ${lua(straiderDb)}`,
  '',
].join('\r\n')

const maliciousLua = [
  '-- fixture: dangerous Lua constructs that must be rejected, never executed',
  'ForeverJourneyDB = {',
  '\t["schemaVersion"] = 3,',
  '\t["characters"] = {',
  '\t\t["Evil:Hack"] = {',
  '\t\t\t["memories"] = {',
  '\t\t\t\t{ ["type"] = "ZONE" },',
  '\t\t\t},',
  '\t\t},',
  '\t},',
  '}',
  'os.execute("rm -rf /")',
  'loadstring("os.exit()")()',
  'while true do end',
  'local evil = setmetatable({}, { __index = function() return 1 end })',
  'ConcatDB = { ["x"] = "a" .. "b" }',
  'LongDB = [[long bracket string]]',
  'EscapeDB = { ["x"] = "\\x41" }',
  'CallDB = string.rep("A", 1000000)',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// FJ-WEB-03 author chapters fixture: Гордунни:Сказитель — the player's own
// partition of the chronicle next to the automatic grouping. Covers: memories
// older than every chapter (the March month section survives), a closed
// chapter (g-1) and an open one (g-2, no closedAt), a chapter without
// memories (g-3 — must never render), a binding to a chapter the file does
// not carry (dangling — the memory falls back to its month), equal
// timestamps inside a chapter (file order must survive), an undated memory
// bound to a chapter (the binding wins) and an undated unbound one (the
// trailing section). activeChapterID is editing state, not book data — the
// importer must ignore it.
// ---------------------------------------------------------------------------
const chapterAt = (month, dayOfMonth, hour = 0) =>
  Math.floor(Date.UTC(2026, month, dayOfMonth, hour) / 1000)

const storytellerMemories = [
  // before any chapter: plain month grouping
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: chapterAt(2, 5, 9),
    location: 'Тирисфальские леса',
    data: { zoneName: 'Tirisfal Glades' },
  }),
  memory({
    type: 'LEVEL',
    source: 'RECORDED',
    timestamp: chapterAt(2, 20, 21),
    location: 'Серебряный бор',
    data: { level: 11 },
  }),
  // chapter g-1 «Затерянные берега» (closed) — player text, Cyrillic
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chapterAt(3, 2, 19),
    location: 'Западный берег',
    favorite: true,
    chapterId: 'g-1',
    data: {
      title: 'Первый костёр на западном берегу',
      note: 'Волны глушили звуки леса, и огонь казался единственным собеседником.',
    },
  }),
  // equal timestamps inside the chapter: file order must survive
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: chapterAt(3, 18, 12),
    location: 'Затерянные берега',
    chapterId: 'g-1',
    data: { killerName: 'Murloc Tidehunter' },
  }),
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: chapterAt(3, 18, 12),
    location: 'Затерянные берега',
    chapterId: 'g-1',
    data: { zoneName: 'Lost Coast' },
  }),
  // chapter g-2 «Тени Сумеречного леса» (still open — no closedAt)
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chapterAt(4, 3, 22),
    location: 'Сумеречный лес',
    chapterId: 'g-2',
    data: {
      title: 'Тени между сосен',
      note: 'Даже полдень здесь звучит как поздний вечер.',
    },
  }),
  // undated but bound: the chapterId binding wins over the missing timestamp
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    chapterId: 'g-2',
    location: 'Сумеречный лес',
    data: { title: 'Запись без даты в главе', note: 'Когда именно — неважно: глава своя.' },
  }),
  // dangling binding: the chapter is absent — the memory is NOT lost, it falls
  // back to its month section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chapterAt(4, 25, 18),
    location: 'Подгород',
    chapterId: 'g-missing',
    data: { title: 'Запись без главы', note: 'Глава исчезла из файла, запись — осталась.' },
  }),
  // undated and unbound: the trailing undated section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    location: 'Лордерон',
    data: { title: 'Совсем без даты', note: 'Ни главы, ни числа.' },
  }),
]

const storytellerChapters = indexed([
  {
    id: 'g-1',
    title: 'Затерянные берега',
    description:
      'Дни, когда карты кончились и начался прибой. Глава о тумане, кострах и тех, кого море не отпустило.\nВторая строка — проверить перенос строк в описании.',
    startedAt: chapterAt(3, 1),
    closedAt: chapterAt(3, 30, 23),
  },
  {
    id: 'g-2',
    title: 'Тени Сумеречного леса',
    description: 'Открытая глава: закрытия ещё не было.',
    startedAt: chapterAt(4, 1),
  },
  // g-3 carries no memories — an empty author chapter must never render
  {
    id: 'g-3',
    title: 'Пустая глава',
    description: 'Создана заранее, записей нет.',
    startedAt: chapterAt(4, 10),
  },
])

// ---------------------------------------------------------------------------
// FJ-WEB-03 review: a REALISTIC chapters character — Гордунни:Хронист. The
// SavedVariables of the real addon carry NO chapterId on memories: membership
// is resolved by Chapters.FindForTimestamp intervals. Chapters c:1 (closed
// June 10 → June 20 12:00) and c:2 (open, July 1). The memories deliberately
// hit the interval edges: June 10 00:00 == c:1.startedAt (inside), June 20
// 12:00 == c:1.closedAt (outside — half-open interval), plus the June
// regression shape: unbound June 2 → chapter → unbound June 25 must never
// collapse into one June section placed before the chapter.
// ---------------------------------------------------------------------------
const chroniclerAt = (month, dayOfMonth, hour = 0, minute = 0) =>
  Math.floor(Date.UTC(2026, month, dayOfMonth, hour, minute) / 1000)

const chroniclerMemories = [
  // before any chapter → the first June section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(5, 2, 9),
    location: 'Подгород',
    data: { title: 'Двадцатидневка до глав', note: 'Журнал вёлся, глав ещё не было.' },
  }),
  // exactly at c:1.startedAt → inside the chapter (startedAt <= timestamp)
  memory({
    type: 'ZONE',
    source: 'RECORDED',
    timestamp: chroniclerAt(5, 10, 0),
    location: 'Долина Лок Модан',
    data: { zoneName: 'Loch Modan' },
  }),
  // squarely inside c:1
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(5, 12, 15),
    location: 'Лок Модан',
    favorite: true,
    data: { title: 'Плотина в тумане', note: 'Вода гудела за стеной всю ночь.' },
  }),
  // exactly at c:1.closedAt → outside (timestamp < closedAt is false)
  memory({
    type: 'DEATH',
    source: 'RECORDED',
    timestamp: chroniclerAt(5, 20, 12),
    location: 'Лок Модан',
    data: { killerName: 'Kobold Geomancer' },
  }),
  // after c:1 closed, before c:2 starts → the second June section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(5, 25, 18),
    location: 'Тирисфальские леса',
    data: { title: 'Дорога домой без главы', note: 'Глава закрылась, путь продолжается.' },
  }),
  // inside the open chapter c:2
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 5, 10),
    location: 'Серебряный бор',
    data: { title: 'После солнцеворота', note: 'Начало длинного июля.' },
  }),
  // undated, no binding possible → the trailing undated section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    location: 'Подгород',
    data: { title: 'Без числа', note: 'Интервал не определить — даты нет.' },
  }),
]

const chroniclerChapters = indexed([
  {
    id: 'c:1',
    title: 'Дороги июня',
    description: 'От стены Стромгарда до плотины Лок Модана — десять дней между двумя столбами дороги.',
    startedAt: chroniclerAt(5, 10),
    closedAt: chroniclerAt(5, 20, 12),
  },
  {
    id: 'c:2',
    title: 'После солнцеворота',
    description: 'Открытая глава: лето ещё не кончилось.',
    startedAt: chroniclerAt(6, 1),
  },
])

// ---------------------------------------------------------------------------
// FJ-WEB-08: the 0.9.0 mass-move shape — Гордунни:Архивист. Since 0.9.0 the
// addon can move memories between chapters, exclude them from every chapter
// (chapterId = false) and return them to automatic binding (field absent).
// Chapters a:1 (closed July 2 → July 15 12:00) and a:2 (open, July 20) share
// one calendar month with the exclusions, so the book must keep three
// separate July sections around the two author chapters.
// ---------------------------------------------------------------------------
const archivistMemories = [
  // July 1, before any chapter → the first July section
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 1, 9),
    location: 'Подгород',
    data: { title: 'До всяких сводов', note: 'Журнал вёлся свободно, глав ещё не завели.' },
  }),
  // July 3, inside a:1's interval, explicitly EXCLUDED — must stay unassigned
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 3, 11),
    location: 'Лок Модан',
    favorite: true,
    personalNote: 'Вычищено из главы после большой перенумерации.',
    data: { title: 'Вырезано из свода', note: 'Игрок исключил запись из всех глав.' },
    chapterId: false,
  }),
  // July 5, no binding → automatic membership by interval → a:1
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 5, 12),
    location: 'Лок Модан',
    data: { title: 'Само легло в свод', note: 'Привязки нет — интервал отдал запись главе.' },
  }),
  // July 7, timestamp inside a:1, but the mass move re-bound it to a:2 — the
  // explicit binding wins regardless of time
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 7, 10),
    location: 'Тирисфальские леса',
    data: { title: 'Перенесено вперёд', note: 'Запись родилась в июле, а попала в поздний свод.' },
    chapterId: 'a:2',
  }),
  // July 9, inside a:1, dangling binding to a deleted chapter — kept as data,
  // never re-resolved by the interval
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 9, 14),
    location: 'Серебряный бор',
    data: { title: 'Ссылка в никуда', note: 'Главу удалили раньше, чем запись нашли.' },
    chapterId: 'ghost',
  }),
  // July 12, inside a:1, second exclusion of the mass move
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 12, 16),
    location: 'Подгород',
    data: { title: 'Тоже вырезано', note: 'Ещё одна запись мимо сводов.' },
    chapterId: false,
  }),
  // July 25, inside the OPEN chapter a:2, excluded — the open interval must
  // not capture it either
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 25, 10),
    location: 'Тирисфальские леса',
    data: { title: 'Вырезано из открытой', note: 'Открытая глава тоже не заберёт запись.' },
    chapterId: false,
  }),
  // July 27, no binding → automatic membership → a:2
  memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    timestamp: chroniclerAt(6, 27, 17),
    location: 'Серебряный бор',
    data: { title: 'Хвост открытого свода', note: 'Конец июля без явной привязки.' },
  }),
]

const archivistChapters = indexed([
  {
    id: 'a:1',
    title: 'Первый свод',
    description: 'Июльская опись: всё, что вошло в перепись до середины месяца.',
    startedAt: chroniclerAt(6, 2),
    closedAt: chroniclerAt(6, 15, 12),
  },
  {
    id: 'a:2',
    title: 'Второй свод',
    description: 'Открытая опись после большой перенумерации.',
    startedAt: chroniclerAt(6, 20),
  },
])

const chaptersDb = {
  schemaVersion: 3,
  addonVersion: '0.8.0',
  characters: {
    'Гордунни:Сказитель': {
      createdAt: chapterAt(2, 1, 8),
      // no stats/recoveredHistory: the deaths fall back to counted DEATH
      // events and the book gains no archive page — this fixture is about
      // the chapters
      // the still-open chapter is editing state; the book does not read it
      activeChapterID: 'g-2',
      chapters: storytellerChapters,
      memories: indexed(storytellerMemories),
    },
    // realistic shape: memories carry NO chapterId — the importer must
    // restore membership from the chapter intervals (FindForTimestamp)
    'Гордунни:Хронист': {
      createdAt: chroniclerAt(5, 1, 8),
      // no stats/recoveredHistory either: the single DEATH event feeds the
      // counter and the book gains no archive page — chapters only
      activeChapterID: 'c:2',
      chapters: chroniclerChapters,
      memories: indexed(chroniclerMemories),
    },
    // the 0.9.0 mass-move shape: exclusions (chapterId = false), re-bindings
    // to other chapters and automatic bindings mixed in one month
    'Гордунни:Архивист': {
      createdAt: chroniclerAt(6, 1, 8),
      activeChapterID: 'a:2',
      chapters: archivistChapters,
      memories: indexed(archivistMemories),
    },
  },
}

const chaptersLua = [
  '-- FJ-WEB-03 fixture: author chapters, mixed with month grouping',
  `ForeverJourneyDB = ${lua(chaptersDb)}`,
  '',
].join('\r\n')

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'ForeverJourney.lua'), mainLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-straider.lua'), straiderLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-chapters.lua'), chaptersLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-schema2.lua'), schemaTwoLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-otherdb.lua'), otherDbLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-broken.lua'), brokenLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-malicious.lua'), maliciousLua, 'utf8')
console.log('SavedVariables fixtures written to fixtures/savedvariables/ (7 files)')
