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
    return `${inner}[${luaString(key)}] = ${lua(val, inner)}`
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
  // template — LEARNED names the profession, MILESTONE adds the skill level
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
    data: { kind: 'MILESTONE', professionName: 'Алхимия', skillLine: 'alchemy', skillLevel: 150, milestone: 'Journeyman' },
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
writeFileSync(resolve(OUT, 'ForeverJourney-schema2.lua'), schemaTwoLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-otherdb.lua'), otherDbLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-broken.lua'), brokenLua, 'utf8')
writeFileSync(resolve(OUT, 'ForeverJourney-malicious.lua'), maliciousLua, 'utf8')
console.log('SavedVariables fixtures written to fixtures/savedvariables/ (5 files)')
