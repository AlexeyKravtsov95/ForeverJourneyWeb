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

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'ForeverJourney.lua'), mainLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-straider.lua'), straiderLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-schema2.lua'), schemaTwoLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-otherdb.lua'), otherDbLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-broken.lua'), brokenLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-malicious.lua'), maliciousLua, 'utf8')
console.log('SavedVariables fixtures written to fixtures/savedvariables/ (6 files)')
