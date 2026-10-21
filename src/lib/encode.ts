import { adler32 } from './adler32'
import { bytesToBase64, encodeUtf8 } from './base64'

export interface EncodeOptions {
  partSize?: number
  checksumStyle?: 'decimal' | 'hex'
}

export const DEFAULT_PART_SIZE = 180

/**
 * Encodes a journal into FJBOOK1 blocks, mirroring the addon export format.
 * Used for the demo book and for tests — the site never needs to encode user data.
 */
export function encodeJournalParts(journal: unknown, options: EncodeOptions = {}): string[] {
  const partSize = Math.max(16, options.partSize ?? DEFAULT_PART_SIZE)
  const bytes = encodeUtf8(JSON.stringify(journal))
  const checksum = adler32(bytes)
  const checksumText =
    options.checksumStyle === 'hex'
      ? checksum.toString(16).padStart(8, '0')
      : String(checksum)
  const base64 = bytesToBase64(bytes)
  const total = Math.max(1, Math.ceil(base64.length / partSize))
  const blocks: string[] = []
  for (let i = 0; i < total; i++) {
    blocks.push(
      `FJBOOK1:${i + 1}/${total}:${checksumText}:${base64.slice(i * partSize, (i + 1) * partSize)}`
    )
  }
  return blocks
}

export function encodeJournalCode(journal: unknown, options?: EncodeOptions): string {
  return encodeJournalParts(journal, options).join('\n')
}
