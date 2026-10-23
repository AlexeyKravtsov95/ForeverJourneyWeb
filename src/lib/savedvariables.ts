// Import of the addon's raw SavedVariables file (ForeverJourney.lua) as an
// alternative to the in-game FJBOOK1 export. The Lua file is parsed by the
// safe literal parser (./luaparse) and one character's journal is converted
// into the same FJJOURNAL v1 model the Book Creator already renders.
//
// What the addon stores is raw event data: the polished titles/descriptions
// the in-game journal shows are computed at runtime by ViewModel.lua and are
// NOT part of SavedVariables. This converter therefore never invents them —
// it keeps whatever text the file actually carries (memory.title/description,
// data.title/data.note of manual entries, personalNote) and leaves the rest
// empty. Known event types get a proper RU/EN label; unknown types keep their
// original text.
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
  ZONE: 'Zone discovered',
  ZONE_DISCOVERED: 'Zone discovered',
  ZONE_DISCOVERY: 'Zone discovered',
  DEATH: 'Death',
  LEVEL: 'Level up',
  LEVEL_UP: 'Level up',
  VICTORY: 'Victory',
  INSTANCE: 'Instance',
  INSTANCE_ENTERED: 'Instance',
  QUEST: 'Quest milestone',
  QUEST_MILESTONE: 'Quest milestone',
  ACHIEVEMENT: 'Achievement',
  MEMORY: 'Memory',
  MANUAL_MEMORY: 'Journal entry',
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

function toMemory(record: LuaTable): JournalMemory | null {
  const type = asText(record.type)
  const source = asText(record.source)
  const data = asTable(record.data)
  const timestamp = toTimestamp(record.timestamp)

  // Manual entries carry their text in data.title / data.note; automatic
  // events may carry a precomputed title/description if a future addon
  // version chooses to store one — both are honored, nothing is invented.
  const manual =
    type.trim().toUpperCase() === 'MANUAL_MEMORY' || source.trim().toUpperCase() === 'USER'
  const title = asText(record.title) || (manual && data ? asText(data.title) : '')
  const description = asText(record.description) || (manual && data ? asText(data.note) : '')

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

  const characters: SavedVariablesCharacter[] = Object.keys(charactersTable)
    .sort((a, b) => a.localeCompare(b))
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
    },
    memories: ordered,
  }
}
