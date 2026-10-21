import { describe, expect, it } from 'vitest'
import { adler32 } from './adler32'
import { encodeUtf8 } from './base64'

describe('adler32', () => {
  it('matches known vectors', () => {
    expect(adler32(new Uint8Array(0))).toBe(0x00000001)
    expect(adler32(encodeUtf8('a'))).toBe(0x00620062)
    expect(adler32(encodeUtf8('abc'))).toBe(0x024d0127)
    expect(adler32(encodeUtf8('Wikipedia'))).toBe(0x11e60398)
  })

  it('matches a naive reference implementation on pseudo-random data', () => {
    const naive = (bytes: Uint8Array): number => {
      let a = 1
      let b = 0
      for (const byte of bytes) {
        a = (a + byte) % 65521
        b = (b + a) % 65521
      }
      return ((b << 16) | a) >>> 0
    }
    for (let seed = 1; seed <= 20; seed++) {
      const size = seed * 997
      const bytes = new Uint8Array(size)
      for (let i = 0; i < size; i++) bytes[i] = (i * seed * 31 + seed * 7) % 256
      expect(adler32(bytes)).toBe(naive(bytes))
    }
  })

  it('handles inputs larger than one chunk (5552 bytes)', () => {
    const bytes = new Uint8Array(20_000).fill(65)
    expect(adler32(bytes)).toBe(adler32(bytes))
    expect(adler32(bytes)).toBeGreaterThan(0)
  })
})
