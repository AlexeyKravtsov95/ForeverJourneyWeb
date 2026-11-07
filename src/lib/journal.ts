export const JOURNAL_FORMAT = 'FJJOURNAL'
export const SUPPORTED_FORMAT_VERSION = 1
// JournalExport.lua caps exports at MAX_ENTRIES = 20000 memories and
// MAX_BYTES = 3 MiB of JSON; the site accepts exactly the same entry cap.
export const MAX_MEMORIES = 20_000
export const MAX_STRING_LENGTH = 20_000
// Chapters.lua caps the journal at 512 chapters, titles at 160 and
// descriptions at 1200 UTF-8 bytes; the site accepts exactly the same caps.
export const MAX_CHAPTERS = 512
export const MAX_CHAPTER_TITLE_BYTES = 160
export const MAX_CHAPTER_DESCRIPTION_BYTES = 1200

export interface JournalCharacter {
  name: string
  race: string
  class: string
  level: number
}

/**
 * A historical stats snapshot the addon stores in SavedVariables
 * (`character.recoveredHistory`): values captured when the character was first
 * seen by the current addon version — NOT the live counters. Kept in the model
 * so the data is not lost, but the book must not show it as current stats.
 */
export interface RecoveredHistory {
  capturedAt?: number
  completedQuests?: number
  /**
   * Quest IDs saved next to the counter (`completedQuests.questIDs`) — raw
   * identifiers only; quest names are not part of the file and are never
   * invented. Deterministically deduplicated, file order preserved. An empty
   * array is a confirmed empty list (a real count of 0); an absent field
   * means the count is unknown and is never dressed up as an empty list.
   */
  questIDs?: number[]
  playedTotal?: number
  /**
   * Play time at the recorded level in seconds (`played.currentLevel`) — a
   * duration, never the character level.
   */
  playedCurrentLevel?: number
  level?: number
  /** Money balance of the snapshot in copper (`money.current`). */
  moneyBalance?: number
}

/**
 * `character.money` — the money values the addon tracked on its own, in
 * copper: `current` is the last balance it saved (not necessarily the
 * character's final balance); `earned`/`spent` are the positive/negative
 * balance changes it registered — not a lifetime total. Independent of the
 * historical snapshot: these fields stand alone.
 */
export interface ArchivedMoney {
  earned?: number
  current?: number
  spent?: number
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
  /** Binding to an author chapter (FJ-WEB-03); dangling ids stay unassigned. */
  chapterId?: string
}

/**
 * An author-created chapter (FJ-WEB-03) — the player's own partition of the
 * chronicle, exported by the addon alongside the memories. Titles and
 * descriptions are player text: kept verbatim (never translated), truncated
 * by the addon's own UTF-8 byte caps. An open chapter simply has no closedAt.
 */
export interface JournalChapter {
  id: string
  title: string
  description: string
  startedAt: number
  closedAt?: number
}

/** A profession saved in the historical snapshot; the name is kept as recorded. */
export interface ArchivedProfession {
  name: string
  /** Saved skill level; unknown stays undefined instead of becoming 0. */
  skillLevel?: number
  maxSkillLevel?: number
}

/** A zone the addon recorded visiting, with the first-discovery time if saved. */
export interface ArchivedZoneVisit {
  name: string
  firstSeenAt?: number
}

/**
 * Character Archive — optional journal block filled only by the
 * SavedVariables import (FJBOOK1 never carries one, and validateJournal drops
 * an unknown `archive` field from an export). Counters here are saved values
 * from the file, never event counts recomputed from the chronicle.
 */
export interface CharacterArchive {
  /** Historical snapshot (`recoveredHistory`), trusted only when initialized. */
  recovered?: RecoveredHistory
  /** Professions of the snapshot, in saved order. */
  professions: ArchivedProfession[]
  /** Visited zones; sorted chronologically for display. */
  zones: ArchivedZoneVisit[]
  /**
   * The addon's own saved death counter (`stats.deaths`), exactly as declared —
   * distinct from journey.deaths, which may fall back to counting DEATH events.
   */
  deathsCounter?: number
  /** Money tracked by the addon (`character.money`), independently of the snapshot. */
  money?: ArchivedMoney
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
  /** Present only when the export actually carried author chapters (FJ-WEB-03). */
  chapters?: JournalChapter[]
  /** Present only when the SavedVariables import actually found archive data. */
  archive?: CharacterArchive
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

/**
 * UTF-8 byte size of a string — the unit the addon's title/description caps
 * use. Counts code points, so surrogate pairs are never split in half.
 */
export function utf8ByteLength(text: string): number {
  let total = 0
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i) as number
    total += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    i += code > 0xffff ? 2 : 1
  }
  return total
}

/** Truncates to the UTF-8 byte cap at a code-point boundary (Lua's string.sub cuts bytes; we never split a character). */
export function truncateUtf8Bytes(text: string, maxBytes: number): string {
  let total = 0
  let cut = text.length
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i) as number
    const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    if (total + size > maxBytes) {
      cut = i
      break
    }
    total += size
    i += code > 0xffff ? 2 : 1
  }
  return cut === text.length ? text : text.slice(0, cut)
}

function asId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, MAX_STRING_LENGTH)
}

function normalizeMemory(entry: unknown): JournalMemory | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  const timestamp = toTimestamp(record.timestamp)
  const chapterId = asId(record.chapterId)
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
    // kept even when it dangles — the binding is data, grouping resolves it
    ...(chapterId !== undefined ? { chapterId } : {}),
  }
}

/**
 * Validates and normalizes one author chapter. A chapter survives only with a
 * usable id, a non-empty title and a valid start time — anything else is
 * damaged metadata and the chapter is dropped (its memories are NOT: they fall
 * back to the chronological grouping). closedAt is kept only when it is valid
 * and not before startedAt; a broken interval demotes the chapter to open
 * instead of dropping the player's text. Only these five fields are kept.
 */
export function normalizeChapter(entry: unknown): JournalChapter | null {
  if (typeof entry !== 'object' || entry === null) return null
  const record = entry as Record<string, unknown>
  const id = asId(record.id)
  const title =
    typeof record.title === 'string'
      ? truncateUtf8Bytes(record.title.trim(), MAX_CHAPTER_TITLE_BYTES)
      : ''
  if (id === undefined || title === '') return null
  const startedAt = toTimestamp(record.startedAt)
  if (startedAt === undefined) return null
  const closedCandidate = toTimestamp(record.closedAt)
  const closedAt = closedCandidate !== undefined && closedCandidate >= startedAt ? closedCandidate : undefined
  const description =
    typeof record.description === 'string'
      ? truncateUtf8Bytes(record.description.trim(), MAX_CHAPTER_DESCRIPTION_BYTES)
      : ''
  return {
    id,
    title,
    description,
    startedAt,
    ...(closedAt !== undefined ? { closedAt } : {}),
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

  // Author chapters (FJ-WEB-03) — optional; the same hard cap as the addon.
  // Damaged chapters are dropped individually (memories never are), duplicate
  // ids keep the first occurrence so the grouping stays deterministic.
  if (root.chapters !== undefined && !Array.isArray(root.chapters)) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: 'chapters is not an array' }
  }
  if (Array.isArray(root.chapters) && root.chapters.length > MAX_CHAPTERS) {
    return { ok: false, code: 'INVALID_SCHEMA', detail: `chapters exceeds ${MAX_CHAPTERS}` }
  }
  const chapters: JournalChapter[] = []
  if (Array.isArray(root.chapters)) {
    const seen = new Set<string>()
    for (const entry of root.chapters) {
      const chapter = normalizeChapter(entry)
      if (chapter === null || seen.has(chapter.id)) continue
      seen.add(chapter.id)
      chapters.push(chapter)
    }
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
    ...(chapters.length > 0 ? { chapters } : {}),
  }
  return { ok: true, journal }
}
