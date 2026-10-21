import { adler32 } from './adler32'
import { base64ToBytes, decodeUtf8 } from './base64'
import { validateJournal, type Journal, type JournalErrorCode } from './journal'

export const MAX_INPUT_CHARS = 10_000_000
export const MAX_PARTS = 512
export const MAX_DECODED_BYTES = 5_000_000

export type ImportErrorCode =
  | 'EMPTY_INPUT'
  | 'NOT_FJBOOK1'
  | 'TOO_LARGE'
  | 'TOO_MANY_PARTS'
  | 'INVALID_PART_HEADER'
  | 'TOTAL_MISMATCH'
  | 'DUPLICATE_PART'
  | 'CHECKSUM_PARTS_MISMATCH'
  | 'INVALID_BASE64'
  | 'PAYLOAD_TOO_LARGE'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_UTF8'
  | 'INVALID_JSON'
  | JournalErrorCode

export interface ImportError {
  status: 'error'
  code: ImportErrorCode
  detail?: string
  part?: number
}

export interface NeedsParts {
  status: 'needs-parts'
  total: number
  received: number
  missing: number[]
}

export interface ImportMeta {
  parts: number
  decodedBytes: number
  checksum: number
}

export type ImportResult =
  | ImportError
  | NeedsParts
  | { status: 'ok'; journal: Journal; meta: ImportMeta }

interface Part {
  index: number
  total: number
  checksum: string
  data: string
}

const BLOCK_RE = /FJBOOK1:(\d{1,4})\/(\d{1,4}):([0-9A-Fa-f]{1,10}):([A-Za-z0-9+/=]+)/g

/**
 * Imports a Forever Journey export: one or many `FJBOOK1:<part>/<total>:<checksum>:<base64>`
 * blocks pasted in any order. Verifies part completeness, duplicates, Adler-32 checksum,
 * format version and journal structure. All processing happens locally.
 */
export function importJournal(raw: string): ImportResult {
  const input = raw.trim()
  if (!input) return { status: 'error', code: 'EMPTY_INPUT' }
  if (input.length > MAX_INPUT_CHARS) return { status: 'error', code: 'TOO_LARGE' }

  const matches = [...input.matchAll(BLOCK_RE)]
  if (matches.length === 0) return { status: 'error', code: 'NOT_FJBOOK1' }
  if (matches.length > MAX_PARTS) return { status: 'error', code: 'TOO_MANY_PARTS' }

  const byIndex = new Map<number, Part>()
  let expectedTotal = 0

  for (const match of matches) {
    const index = Number(match[1])
    const total = Number(match[2])
    const checksum = match[3]
    const data = match[4]
    if (!Number.isInteger(index) || index < 1 || total < 1 || index > total) {
      return { status: 'error', code: 'INVALID_PART_HEADER', detail: match[0].slice(0, 48) }
    }
    if (expectedTotal === 0) expectedTotal = total
    else if (total !== expectedTotal) return { status: 'error', code: 'TOTAL_MISMATCH' }
    if (total > MAX_PARTS) return { status: 'error', code: 'TOO_MANY_PARTS' }

    const previous = byIndex.get(index)
    if (previous) {
      if (previous.data === data && previous.checksum === checksum) continue
      return { status: 'error', code: 'DUPLICATE_PART', part: index }
    }
    byIndex.set(index, { index, total, checksum, data })
  }

  const checksums = new Set([...byIndex.values()].map((part) => part.checksum.toLowerCase()))
  if (checksums.size > 1) return { status: 'error', code: 'CHECKSUM_PARTS_MISMATCH' }
  const declaredChecksum = checksums.values().next().value as string

  const missing: number[] = []
  for (let i = 1; i <= expectedTotal; i++) {
    if (!byIndex.has(i)) missing.push(i)
  }
  if (missing.length > 0) {
    return {
      status: 'needs-parts',
      total: expectedTotal,
      received: expectedTotal - missing.length,
      missing,
    }
  }

  const chunks = [...byIndex.keys()]
    .sort((a, b) => a - b)
    .map((index) => byIndex.get(index)!.data)

  // The addon slices the Base64 string; a per-part encoded export is accepted as a fallback.
  let bytes = assembleBytes(chunks, false)
  if (!bytes || !checksumMatches(bytes, declaredChecksum)) {
    const perPart = assembleBytes(chunks, true)
    if (perPart && checksumMatches(perPart, declaredChecksum)) bytes = perPart
  }
  if (!bytes) return { status: 'error', code: 'INVALID_BASE64' }
  if (bytes.length > MAX_DECODED_BYTES) return { status: 'error', code: 'PAYLOAD_TOO_LARGE' }
  if (!checksumMatches(bytes, declaredChecksum)) {
    return { status: 'error', code: 'CHECKSUM_MISMATCH' }
  }

  let text: string
  try {
    text = decodeUtf8(bytes)
  } catch {
    return { status: 'error', code: 'INVALID_UTF8' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { status: 'error', code: 'INVALID_JSON' }
  }

  const validated = validateJournal(parsed)
  if (!validated.ok) {
    return { status: 'error', code: validated.code, detail: validated.detail }
  }
  return {
    status: 'ok',
    journal: validated.journal,
    meta: { parts: expectedTotal, decodedBytes: bytes.length, checksum: adler32(bytes) },
  }
}

/** The checksum may be written as decimal or as a hex string. */
function checksumMatches(bytes: Uint8Array, declared: string): boolean {
  const value = adler32(bytes)
  return (
    declared === String(value) ||
    declared === value.toString(16).padStart(8, '0') ||
    declared === value.toString(16)
  )
}

function assembleBytes(chunks: string[], perPart: boolean): Uint8Array | null {
  if (!perPart) {
    const joined = chunks.map((chunk) => chunk.replace(/=+$/, '')).join('')
    return base64ToBytes(joined)
  }
  const decoded: Uint8Array[] = []
  let length = 0
  for (const chunk of chunks) {
    const bytes = base64ToBytes(chunk)
    if (!bytes) return null
    decoded.push(bytes)
    length += bytes.length
  }
  const out = new Uint8Array(length)
  let offset = 0
  for (const bytes of decoded) {
    out.set(bytes, offset)
    offset += bytes.length
  }
  return out
}
