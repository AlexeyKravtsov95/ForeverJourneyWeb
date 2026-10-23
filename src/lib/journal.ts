export const JOURNAL_FORMAT = 'FJJOURNAL'
export const SUPPORTED_FORMAT_VERSION = 1
// JournalExport.lua caps exports at MAX_ENTRIES = 20000 memories and
// MAX_BYTES = 3 MiB of JSON; the site accepts exactly the same entry cap.
export const MAX_MEMORIES = 20_000
export const MAX_STRING_LENGTH = 20_000

export interface JournalCharacter {
  name: string
  race: string
  class: string
  level: number
}

export interface JournalJourney {
  startedAt?: number
  /**
   * Stats the source export could not provide stay undefined and are hidden
   * by the book (a missing value must not be shown as a trustworthy 0).
   * FJBOOK1 always carries all three, so existing imports render as before.
   */
  deaths?: number
  completedQuests?: number
  totalPlayed?: number
}

export interface JournalMemory {
  type: string
  typeLabel: string
  source: string
  title: string
  description: string
  personalNote: string
  favorite: boolean
  timestamp?: number
  location: string
}

export interface Journal {
  format: 'FJJOURNAL'
  formatVersion: 1
  addonVersion: string
  locale: string
  exportedAt?: number
  character: JournalCharacter
  journey: JournalJourney
  memories: JournalMemory[]
}

export type JournalErrorCode = 'WRONG_FORMAT' | 'UNSUPPORTED_VERSION' | 'INVALID_SCHEMA'

export type JournalValidation =
  | { ok: true; journal: Journal }
  | { ok: false; code: JournalErrorCode; detail?: string }

function asText(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, MAX_STRING_LENGTH) : ''
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

// The ECMAScript date range; values outside it throw RangeError in Intl formatting.
export const MIN_DATE_MS = -8_640_000_000_000_000
export const MAX_DATE_MS = 8_640_000_000_000_000

/**
 * Accepts epoch seconds (the addon format), epoch milliseconds or an ISO 8601 string
 * and normalizes it to epoch milliseconds, rejecting anything that would overflow
 * the date range.
 */
export function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value > 1e12 ? value : value * 1000
    return ms >= MIN_DATE_MS && ms <= MAX_DATE_MS ? Math.round(ms) : undefined
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const ms = Date.parse(value)
    return Number.isFinite(ms) && ms >= MIN_DATE_MS && ms <= MAX_DATE_MS ? ms : undefined
  }
  return undefined
}

function normalizeMemory(entry: unknown): JournalMemory | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  const timestamp = toTimestamp(record.timestamp)
  return {
    type: asText(record.type) || 'memory',
    typeLabel: asText(record.typeLabel),
    source: asText(record.source),
    title: asText(record.title),
    description: asText(record.description),
    personalNote: asText(record.personalNote),
    favorite: record.favorite === true,
    ...(timestamp !== undefined ? { timestamp } : {}),
    location: asText(record.location),
  }
}

/** Validates and normalizes a parsed FJJOURNAL payload; never executes or keeps unknown fields. */
export function validateJournal(data: unknown): JournalValidation {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: 'root is not an object' }
  }
  const root = data as Record<string, unknown>

  if (root.format !== JOURNAL_FORMAT) return { ok: false, code: 'WRONG_FORMAT' }
  if (root.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    return { ok: false, code: 'UNSUPPORTED_VERSION', detail: String(root.formatVersion) }
  }

  const character = root.character
  if (
    typeof character !== 'object' ||
    character === null ||
    typeof (character as Record<string, unknown>).name !== 'string' ||
    ((character as Record<string, unknown>).name as string).trim() === ''
  ) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: 'character.name is missing' }
  }
  if (!Array.isArray(root.memories)) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: 'memories is not an array' }
  }
  if (root.memories.length > MAX_MEMORIES) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: `memories exceeds ${MAX_MEMORIES}` }
  }

  const characterRecord = character as Record<string, unknown>
  const journeyRecord =
    typeof root.journey === 'object' && root.journey !== null
      ? (root.journey as Record<string, unknown>)
      : {}
  const startedAt = toTimestamp(journeyRecord.startedAt)
  const exportedAt = toTimestamp(root.exportedAt)

  const journal: Journal = {
    format: 'FJJOURNAL',
    formatVersion: 1,
    addonVersion: asText(root.addonVersion),
    locale: asText(root.locale),
    ...(exportedAt !== undefined ? { exportedAt } : {}),
    character: {
      name: asText(characterRecord.name).trim() || 'Unknown',
      race: asText(characterRecord.race),
      class: asText(characterRecord.class),
      level: Math.min(asCount(characterRecord.level), 1000),
    },
    journey: {
      ...(startedAt !== undefined ? { startedAt } : {}),
      deaths: Math.min(asCount(journeyRecord.deaths), 1_000_000),
      completedQuests: Math.min(asCount(journeyRecord.completedQuests), 10_000_000),
      totalPlayed: Math.min(asCount(journeyRecord.totalPlayed), 2_000_000_000),
    },
    memories: root.memories
      .map(normalizeMemory)
      .filter((memory): memory is JournalMemory => memory !== null),
  }
  return { ok: true, journal }
}
