// Import of the addon's raw SavedVariables file (ForeverJourney.lua) as an
// alternative to the in-game FJBOOK1 export. The Lua file is parsed by the
// safe literal parser (./luaparse) and one character's journal is converted
// into the same FJJOURNAL v1 model the Book Creator already renders.
//
// The addon stores raw event data; the display text of automatic events is
// computed at runtime by Memories.lua from that data. deriveEventText() below
// rebuilds it from the verified data fields using the addon's own template
// shapes (so RU localization keeps working through localize.ts). Whatever the
// file does not carry is left empty — names, levels, causes and spells are
// never invented, and the player's own text is always kept verbatim.
import {
  luaToArray,
  parseLuaAssignments,
  type LuaParseErrorCode,
  type LuaTable,
  type LuaValue,
} from './luaparse'
import {
  MAX_MEMORIES,
  MAX_STRING_LENGTH,
  toTimestamp,
  type Journal,
  type JournalMemory,
  type RecoveredHistory,
} from './journal'

export { MAX_FILE_BYTES } from './luaparse'

export const SAVED_VARIABLES_DB = 'ForeverJourneyDB'
export const SUPPORTED_SCHEMA_VERSION = 3

export type SavedVariablesErrorCode =
  | LuaParseErrorCode
  | 'DB_NOT_FOUND'
  | 'UNSUPPORTED_SCHEMA'
  | 'NO_CHARACTERS'
  | 'MEMORIES_TOO_LARGE'

export interface SavedVariablesError {
  status: 'error'
  code: SavedVariablesErrorCode
  /** Never contains file contents — schema version or a line number only. */
  detail?: string
}

export interface SavedVariablesCharacter {
  /** Raw SavedVariables key, "Realm:Name". */
  key: string
  name: string
  realm: string
  memories: number
  favorites: number
  firstMemoryAt?: number
  lastMemoryAt?: number
  createdAt?: number
}

export interface SavedVariablesOk {
  status: 'ok'
  schemaVersion: number
  characters: SavedVariablesCharacter[]
  /** Parsed ForeverJourneyDB; used by buildJournalFromSavedVariables(). */
  db: LuaTable
}

export type SavedVariablesResult = SavedVariablesOk | SavedVariablesError

/**
 * English display labels for the addon's semantic event types. The keys match
 * the memory.type values case-insensitively. The RU translation happens in
 * src/lib/localize.ts, which already knows these exact labels — unknown types
 * fall back to their own text and are never translated or invented.
 */
const TYPE_LABELS: Record<string, string> = {
  ZONE: 'DISCOVERY',
  ZONE_DISCOVERED: 'DISCOVERY',
  ZONE_DISCOVERY: 'DISCOVERY',
  DEATH: 'Death',
  LEVEL: 'LEVEL',
  LEVEL_UP: 'LEVEL',
  VICTORY: 'Victory',
  BOSS_VICTORY: 'Victory',
  INSTANCE: 'Instance',
  INSTANCE_ENTERED: 'Instance',
  QUEST: 'Quest milestone',
  QUEST_MILESTONE: 'Quest milestone',
  ACHIEVEMENT: 'Achievement',
  PROFESSION_MILESTONE: 'PROFESSION',
  REPUTATION_MILESTONE: 'Reputation milestone',
  MEMORY: 'MEMORY',
  MANUAL_MEMORY: 'MEMORY',
}

function typeLabel(type: string): string {
  const known = TYPE_LABELS[type.trim().toUpperCase()]
  if (known) return known
  // unknown type: safe display — underscores to spaces, original casing kept
  const humanized = type.trim().replace(/_+/g, ' ')
  return humanized.charAt(0).toUpperCase() + humanized.slice(1)
}

function asTable(value: LuaValue): LuaTable | null {
  return typeof value === 'object' && value !== null ? value : null
}

function asText(value: LuaValue | undefined): string {
  return typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : ''
}

function asCount(value: LuaValue | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.min(Math.floor(value), 1_000_000)
}

/** memory.location is a plain string in the current schema; older/unknown shapes with a zone-like field are honored. */
function locationText(location: LuaValue): string {
  if (typeof location === 'string') return location.slice(0, MAX_STRING_LENGTH)
  const table = asTable(location)
  if (table) {
    for (const field of ['zone', 'zoneName', 'name', 'area', 'subzone', 'map']) {
      const text = asText(table[field])
      if (text) return text
    }
  }
  return ''
}

function isMemoryRecord(value: LuaValue): value is LuaTable {
  return typeof value === 'object' && value !== null
}

/**
 * Rebuilds the display text of automatic events from `memory.data` following
 * the addon's own handlers (Memories.lua, BossVictoryMilestones.lua,
 * ProfessionMilestones.lua, QuestMilestones.lua; shapes confirmed by the
 * PR review of the real addon). Template forms match the RU dictionaries in
 * src/lib/localize.ts, which translate these exact strings; parameter values
 * are taken verbatim from the file and never invented. When the file carries
 * no parameter for a template, the neutral description
 * (MEMORY_DESCRIPTION_LEVEL-style "Your journey continues.") is used and no
 * title is made up.
 */
const NEUTRAL_DESCRIPTION = 'Your journey continues.'

/** Environmental death causes the game actually reports (data.cause == "ENVIRONMENTAL"). */
const ENVIRONMENTAL_TYPES = new Set([
  'DROWNING',
  'FALLING',
  'FATIGUE',
  'FIRE',
  'LAVA',
  'SLIME',
])

/**
 * Memories.lua ENVIRONMENT_TITLE_KEYS — the literal Locale.lua titles of the
 * current addon, environmental causes first, then the two fallbacks for an
 * unknown cause and for deaths without any known cause.
 */
const ENVIRONMENT_TITLE_KEYS: Record<string, string> = {
  DROWNING: 'Drowned',
  FALLING: 'Died from a fall',
  FATIGUE: 'Succumbed to exhaustion',
  FIRE: 'Perished in fire',
  LAVA: 'Perished in lava',
  SLIME: 'Perished in slime',
}
const UNKNOWN_ENVIRONMENT_TITLE = 'Lost to the environment'
const GENERIC_DEATH_TITLE = 'Fell in battle'

/** tonumber()-like coercion: numbers pass, numeric strings parse, the rest is nil. */
function luaNumber(value: LuaValue | undefined): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return undefined
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function deriveEventText(
  type: string,
  data: LuaTable | null,
  location: LuaValue
): { title: string; description: string } {
  const upper = type.trim().toUpperCase()
  const field = (name: string): string => {
    const text = data ? asText(data[name]) : ''
    return text.trim()
  }
  const place = (...names: string[]): string => {
    for (const name of names) {
      const text = field(name)
      if (text) return text
    }
    return locationText(location).trim()
  }
  const count = (...names: string[]): number | undefined => {
    for (const name of names) {
      const value = data ? data[name] : undefined
      if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
    }
    return undefined
  }
  const none = { title: '', description: '' }

  switch (upper) {
    case 'ZONE':
    case 'ZONE_DISCOVERED':
    case 'ZONE_DISCOVERY': {
      const zone = place('zoneName', 'zone')
      return zone
        ? { title: `Discovered ${zone}`, description: 'A new place became part of your journey.' }
        : none
    }
    case 'LEVEL':
    case 'LEVEL_UP': {
      // MEMORY_DESCRIPTION_LEVEL is the generic "Your journey continues."
      const level = count('level')
      return level !== undefined
        ? { title: `Reached Level ${level}`, description: NEUTRAL_DESCRIPTION }
        : none
    }
    case 'INSTANCE':
    case 'INSTANCE_ENTERED': {
      const instance = place('instanceName', 'instance')
      return instance
        ? {
            title: `Entered ${instance}`,
            description: 'Another chapter of your journey lies within.',
          }
        : none
    }
    case 'DEATH': {
      // Memories.lua checks the environmental cause BEFORE the killer: when
      // data.cause == "ENVIRONMENTAL", the cause's own title wins; an unknown
      // cause gets its fallback, and only deaths without any known cause fall
      // back to the generic title. The killing spell is named only when the
      // file actually carries spellName — a bare spellID cannot be resolved
      // and is never turned into an invented name.
      let title = GENERIC_DEATH_TITLE
      if (field('cause').toUpperCase() === 'ENVIRONMENTAL') {
        const cause = field('environmentalType').toUpperCase()
        title = ENVIRONMENTAL_TYPES.has(cause)
          ? ENVIRONMENT_TITLE_KEYS[cause]
          : UNKNOWN_ENVIRONMENT_TITLE
      } else {
        const killer = field('killerName') || field('killerNameRaw')
        if (killer) title = `Fell in battle — ${killer}`
      }
      const spell = field('spellName')
      return {
        title,
        description: spell ? `Final blow: ${spell}.` : 'Every journey has its setbacks.',
      }
    }
    case 'QUEST':
    case 'QUEST_MILESTONE': {
      const quests = count('quests', 'questCount', 'completedQuests', 'count')
      return quests !== undefined
        ? {
            title: `${quests} quests completed`,
            description: 'Another important questing milestone has been reached.',
          }
        : none
    }
    case 'VICTORY':
    case 'BOSS_VICTORY': {
      // BossVictoryMilestones.lua: title is data.encounterName with the
      // addon's own "Unknown boss" fallback; the description is a fixed
      // localized string (no killing-blow restoration for this type)
      const encounter = field('encounterName')
      return {
        title: encounter || 'Unknown boss',
        description: 'The battle ended in victory.',
      }
    }
    case 'PROFESSION_MILESTONE': {
      // ProfessionMilestones.lua: data.kind selects the template. The numeric
      // parameter is tonumber(data.milestone) or tonumber(data.skillLevel) —
      // defaulting to 0 like the Lua handler; the profession name comes from
      // data.professionName and stays exactly as recorded (no translation of
      // a name the client would localize in game).
      const kind = field('kind').toUpperCase()
      const profession = field('professionName')
      if (kind === 'LEARNED' && profession) {
        return {
          title: `Learned profession: ${profession}`,
          description: 'A new profession became part of the journey.',
        }
      }
      if (kind === 'MILESTONE' && profession) {
        const number = Math.floor(luaNumber(data?.milestone) ?? luaNumber(data?.skillLevel) ?? 0)
        return {
          title: `${profession} reached skill ${number}`,
          description: 'A new profession milestone has been reached.',
        }
      }
      return none
    }
    default:
      return none
  }
}

function toMemory(record: LuaTable): JournalMemory | null {
  const type = asText(record.type)
  const source = asText(record.source)
  const data = asTable(record.data)
  const timestamp = toTimestamp(record.timestamp)

  // Priority: text actually saved in the file (memory.title/description, and
  // data.title/data.note of manual entries) > event text derived from
  // verified data fields > nothing (the neutral type label carries the entry).
  const manual =
    type.trim().toUpperCase() === 'MANUAL_MEMORY' || source.trim().toUpperCase() === 'USER'
  const derived = manual
    ? { title: '', description: '' }
    : deriveEventText(type, data, record.location)
  const title = asText(record.title) || (manual && data ? asText(data.title) : '') || derived.title
  const description =
    asText(record.description) || (manual && data ? asText(data.note) : '') || derived.description

  if (!type && !title && !description && !asText(record.personalNote)) return null

  return {
    type: type || 'MEMORY',
    typeLabel: typeLabel(type || 'MEMORY'),
    source,
    title,
    description,
    personalNote: asText(record.personalNote),
    favorite: record.favorite === true,
    ...(timestamp !== undefined ? { timestamp } : {}),
    location: locationText(record.location),
  }
}

function memoryArray(character: LuaTable): LuaTable[] {
  return luaToArray(character.memories).filter(isMemoryRecord)
}

/** Character key is "Realm:Name"; neither part may contain a colon. */
function splitKey(key: string): { realm: string; name: string } {
  const at = key.indexOf(':')
  if (at <= 0 || at === key.length - 1) return { realm: '', name: key }
  return { realm: key.slice(0, at), name: key.slice(at + 1) }
}

/**
 * Parses the whole ForeverJourney.lua and validates the database envelope:
 * ForeverJourneyDB present, schemaVersion supported, at least one character.
 * Memories of different characters are never merged — the caller picks one.
 */
export function readSavedVariables(source: Uint8Array | string): SavedVariablesResult {
  const parsed = parseLuaAssignments(source)
  if (!parsed.ok) return { status: 'error', code: parsed.code, detail: String(parsed.line) }

  const db = asTable(parsed.globals[SAVED_VARIABLES_DB])
  if (!db) return { status: 'error', code: 'DB_NOT_FOUND' }

  const schema = db.schemaVersion
  if (schema !== SUPPORTED_SCHEMA_VERSION) {
    return {
      status: 'error',
      code: 'UNSUPPORTED_SCHEMA',
      detail: typeof schema === 'number' ? String(schema) : 'missing',
    }
  }

  const charactersTable = asTable(db.characters)
  if (!charactersTable || Object.keys(charactersTable).length === 0) {
    return { status: 'error', code: 'NO_CHARACTERS' }
  }

  // Explicit "ru" collation: with the runtime's default locale the order of
  // Cyrillic vs Latin keys flips between environments (ru-RU puts Cyrillic
  // first, en-US puts Latin first), which broke CI after the merge.
  const characters: SavedVariablesCharacter[] = Object.keys(charactersTable)
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((key) => {
      const record = asTable(charactersTable[key]) ?? {}
      const { realm, name } = splitKey(key)
      const memories = memoryArray(record)
      let favorites = 0
      let firstMemoryAt: number | undefined
      let lastMemoryAt: number | undefined
      for (const memory of memories) {
        if (memory.favorite === true) favorites++
        const at = toTimestamp(memory.timestamp)
        if (at !== undefined) {
          if (firstMemoryAt === undefined || at < firstMemoryAt) firstMemoryAt = at
          if (lastMemoryAt === undefined || at > lastMemoryAt) lastMemoryAt = at
        }
      }
      const createdAt = toTimestamp(record.createdAt)
      return {
        key,
        name,
        realm,
        memories: memories.length,
        favorites,
        ...(firstMemoryAt !== undefined ? { firstMemoryAt } : {}),
        ...(lastMemoryAt !== undefined ? { lastMemoryAt } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
      }
    })

  return { status: 'ok', schemaVersion: SUPPORTED_SCHEMA_VERSION, characters, db }
}

/**
 * Converts one character of a parsed SavedVariables into an FJJOURNAL v1
 * journal. Chronological order with a stable original-order tiebreak for
 * equal timestamps; favorites, personal notes and manual texts are preserved
 * verbatim. Level/race/class and play time are not part of SavedVariables —
 * they stay empty and the book hides them instead of guessing.
 */
export function buildJournalFromSavedVariables(
  parsed: SavedVariablesOk,
  characterKey: string
): Journal | null {
  const charactersTable = asTable(parsed.db.characters)
  const record = charactersTable ? asTable(charactersTable[characterKey]) : null
  if (!record) return null

  const { name } = splitKey(characterKey)
  const rawMemories = memoryArray(record)
  if (rawMemories.length > MAX_MEMORIES) return null

  const memories = rawMemories
    .map(toMemory)
    .filter((memory): memory is JournalMemory => memory !== null)

  // Explicit index tiebreak keeps the file's original order for equal times.
  const ordered = memories
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => {
      const at = a.memory.timestamp ?? Number.POSITIVE_INFINITY
      const bt = b.memory.timestamp ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
      return a.index - b.index
    })
    .map((entry) => entry.memory)

  // The addon's own counter is authoritative; without it, counting recorded
  // DEATH events is a factual fallback (never a made-up number).
  const stats = asTable(record.stats)
  const declaredDeaths = asCount(stats?.deaths)
  const deaths =
    declaredDeaths ??
    ordered.filter((memory) => memory.type.trim().toUpperCase() === 'DEATH').length

  const startedAt = toTimestamp(record.createdAt)

  return {
    format: 'FJJOURNAL',
    formatVersion: 1,
    addonVersion: asText(parsed.db.addonVersion),
    locale: '',
    character: { name: name || characterKey, race: '', class: '', level: 0 },
    journey: {
      ...(startedAt !== undefined ? { startedAt } : {}),
      ...(deaths > 0 || declaredDeaths !== undefined ? { deaths } : {}),
      ...parseRecoveredHistory(record.recoveredHistory),
    },
    memories: ordered,
  }
}

/**
 * `character.recoveredHistory` is a snapshot captured when the addon first saw
 * the character — historical, not live. Only a snapshot the addon marked
 * `initialized = true` is trusted: without initialization the zeros are
 * default values, not a real capture. Fields are validated by their own rules
 * (play time is seconds and must not be squeezed into the quest counter cap);
 * each present-and-valid field is known, everything else stays unknown. The
 * snapshot is preserved in the model but never shown as current stats.
 */

/** /played in seconds; two billion seconds ≈ 63 years of play — absurd but finite. */
function asPlayedSeconds(value: LuaValue | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.min(Math.floor(value), 2_000_000_000)
}

/** Quest counters: non-negative integers within the journal's quest cap. */
function asQuestCount(value: LuaValue | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.min(Math.floor(value), 10_000_000)
}

/** Character level: positive integers within the journal's level cap. */
function asLevel(value: LuaValue | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return undefined
  }
  if (value < 1 || value > 1000) return undefined
  return value
}

function parseRecoveredHistory(value: LuaValue): { recovered?: RecoveredHistory } {
  const table = asTable(value)
  // a snapshot that was never initialized carries default values, not data
  if (!table || table.initialized !== true) return {}
  const capturedAt = toTimestamp(table.capturedAt)
  const completedQuests = asQuestCount(asTable(table.completedQuests)?.count)
  const playedTotal = asPlayedSeconds(asTable(table.played)?.total)
  const level = asLevel(table.level)
  const known: RecoveredHistory = {
    ...(capturedAt !== undefined ? { capturedAt } : {}),
    ...(completedQuests !== undefined ? { completedQuests } : {}),
    ...(playedTotal !== undefined ? { playedTotal } : {}),
    ...(level !== undefined ? { level } : {}),
  }
  return Object.keys(known).length > 0 ? { recovered: known } : {}
}
