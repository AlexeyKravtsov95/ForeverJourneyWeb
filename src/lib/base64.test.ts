import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8 } from './base64'

const samples = [
  'Hello, Azeroth!',
  'Привет, Азерот! ЁёЙй',
  'Наконец-то я увидел море! 🌊⚔️',
  '<script>alert("xss")</script> & "quotes" \'single\'',
  'line1\nline2\ttab',
]

describe('base64 + utf-8', () => {
  it('round-trips every sample', () => {
    for (const text of samples) {
      const bytes = base64ToBytes(bytesToBase64(encodeUtf8(text)))
      expect(bytes).not.toBeNull()
      expect(decodeUtf8(bytes!)).toBe(text)
    }
  })

  it('matches Node Buffer base64 (independent implementation)', () => {
    for (const text of samples) {
      const expected = Buffer.from(text, 'utf8').toString('base64')
      expect(bytesToBase64(encodeUtf8(text))).toBe(expected)
      const decoded = base64ToBytes(expected)
      expect(decoded && Buffer.from(decoded).equals(Buffer.from(text, 'utf8'))).toBe(true)
    }
  })

  it('decodes base64 without padding', () => {
    const padded = bytesToBase64(encodeUtf8('Aelirien'))
    const unpadded = padded.replace(/=+$/, '')
    expect(base64ToBytes(unpadded)).not.toBeNull()
    expect(decodeUtf8(base64ToBytes(unpadded)!)).toBe('Aelirien')
  })

  it('skips ASCII whitespace inside the payload', () => {
    const padded = bytesToBase64(encodeUtf8('Stormwind'))
    const withWhitespace = padded.slice(0, 4) + '\n' + padded.slice(4) + '  '
    const bytes = base64ToBytes(withWhitespace)
    expect(bytes).not.toBeNull()
    expect(decodeUtf8(bytes!)).toBe('Stormwind')
  })

  it('skips Unicode whitespace, zero-width chars and BOM inside the payload', () => {
    const padded = bytesToBase64(encodeUtf8('Оргриммар'))
    const dirty =
      '\uFEFF' + padded.slice(0, 4) + '\u00A0' + padded.slice(4, 8) + '\u200B' + padded.slice(8)
    const bytes = base64ToBytes(dirty)
    expect(bytes).not.toBeNull()
    expect(decodeUtf8(bytes!)).toBe('Оргриммар')
  })

  it('rejects non-ASCII characters in the payload', () => {
    const padded = bytesToBase64(encodeUtf8('Оргриммар'))
    const dirty = padded.slice(0, 4) + 'Ж' + padded.slice(4)
    expect(base64ToBytes(dirty)).toBeNull()
  })

  it('rejects U+0151 (ő) in place of ASCII Q — no byte-truncation into valid Base64 (regression)', () => {
    // charCodeAt(U+0151) = 337 = 0x151; stored into a Uint8Array it would silently
    // truncate to 0x51 = 'Q', turning a corrupted payload into a "valid" one
    expect(0x151 & 0xff).toBe(0x51)
    expect('Q'.charCodeAt(0)).toBe(0x51)
    const dirty = '\u0151' + bytesToBase64(encodeUtf8('Azeroth')).slice(1)
    expect(base64ToBytes(dirty)).toBeNull()
  })

  it('rejects codes above 255 that would wrap into valid ASCII (e.g. U+0141 = 321 → "A")', () => {
    expect(0x141 & 0xff).toBe(0x41)
    const dirty = '\u0141'.repeat(4)
    expect(base64ToBytes(dirty)).toBeNull()
  })

  it('rejects invalid input', () => {
    expect(base64ToBytes('!!!!')).toBeNull()
    expect(base64ToBytes('AB=CD')).toBeNull()
    expect(base64ToBytes('ABCDE')).toBeNull()
    expect(base64ToBytes('')).toBeNull()
    expect(base64ToBytes('A===')).toBeNull()
  })
})
