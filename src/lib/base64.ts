const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const LOOKUP = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET.charCodeAt(i)] = i
}

/** Standard Base64 with padding, no platform dependencies. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triple = (b0 << 16) | (b1 << 8) | b2
    out += ALPHABET[(triple >> 18) & 63]
    out += ALPHABET[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[triple & 63] : '='
  }
  return out
}

/**
 * Lenient Base64 decoder: skips ASCII whitespace and accepts missing padding.
 * Returns null for any invalid character, misplaced '=' or impossible length.
 */
export function base64ToBytes(input: string): Uint8Array | null {
  const src = new Uint8Array(input.length)
  let n = 0
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code === 32 || code === 9 || code === 10 || code === 13) continue
    src[n++] = code
  }

  let padding = 0
  for (let i = 0; i < n; i++) {
    const code = src[i]
    if (code === 61 /* '=' */) {
      if (i < n - 2) return null
      padding++
    } else if (code >= 128 || LOOKUP[code] === -1) {
      return null
    }
  }

  const dataLen = n - padding
  if (dataLen <= 0 || dataLen % 4 === 1) return null

  const outLength =
    Math.floor(dataLen / 4) * 3 + (dataLen % 4 === 2 ? 1 : dataLen % 4 === 3 ? 2 : 0)
  const out = new Uint8Array(outLength)
  let o = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < dataLen; i++) {
    buffer = (buffer << 6) | LOOKUP[src[i]]
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 0xff
    }
  }
  return out
}

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })
const utf8Encoder = new TextEncoder()

export function encodeUtf8(text: string): Uint8Array {
  return utf8Encoder.encode(text)
}

/** Throws TypeError on invalid UTF-8 sequences. */
export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes)
}
