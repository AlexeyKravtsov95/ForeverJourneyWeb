import { describe, expect, it } from 'vitest'
import { adler32 } from './adler32'
import { bytesToBase64, encodeUtf8 } from './base64'
import { encodeJournalCode, encodeJournalParts } from './encode'
import { importJournal } from './fjbook'
import type { Journal } from './journal'

const cyrillicJournal: Journal = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '1.2.3',
  locale: 'ruRU',
  exportedAt: Date.UTC(2026, 9, 1, 10, 0),
  character: { name: 'Громозека', race: 'Орк', class: 'Воин', level: 60 },
  journey: {
    startedAt: Date.UTC(2026, 1, 1, 8, 0),
    deaths: 7,
    completedQuests: 210,
    totalPlayed: 250_000,
  },
  memories: [
    {
      type: 'note',
      typeLabel: 'Запись',
      source: 'manual',
      title: 'Первая ночь в Дуротаре',
      description: 'Ветер нёс пыль и запах костра, а небо было огромным.',
      personalNote: 'Не забыть купить факелы.',
      favorite: false,
      timestamp: 1_770_000_000,
      location: 'Дуротар',
    },
    {
      type: 'achievement',
      typeLabel: 'Достижение',
      source: 'achievement',
      title: 'Исследователь Дуротара',
      description: 'Открыты все уголки Дуротара.',
      personalNote: '',
      favorite: true,
      timestamp: 1_770_860_000,
      location: 'Оргриммар',
    },
    {
      type: 'death',
      typeLabel: 'Смерть',
      source: 'death',
      title: 'Свален квилбором',
      description: 'Громозека пал в бою у перекрёстка.',
      personalNote: 'Больше никогда — без щита.',
      favorite: false,
      timestamp: 1_771_500_000,
      location: 'Степи',
    },
  ],
}

function withChecksum(block: string, checksum: string): string {
  return block.replace(/^(FJBOOK1:\d+\/\d+):[0-9A-Fa-f]+:(.+)$/, `$1:${checksum}:$2`)
}

function blockWithPayload(payload: string): string {
  const bytes = encodeUtf8(payload)
  return `FJBOOK1:1/1:${adler32(bytes)}:${bytesToBase64(bytes)}`
}

describe('importJournal — happy paths', () => {
  it('imports a single-part export with Cyrillic text', () => {
    const result = importJournal(encodeJournalCode(cyrillicJournal, { partSize: 10_000 }))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.parts).toBe(1)
      expect(result.journal.character.name).toBe('Громозека')
      expect(result.journal.character.race).toBe('Орк')
      expect(result.journal.memories).toHaveLength(3)
      expect(result.journal.memories[0].title).toBe('Первая ночь в Дуротаре')
      expect(result.journal.memories[0].personalNote).toBe('Не забыть купить факелы.')
      expect(result.journal.memories[1].favorite).toBe(true)
    }
  })

  it('imports a multi-part export pasted in any order with junk between blocks', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 120 })
    expect(parts.length).toBeGreaterThan(3)
    const pasted = [...parts].reverse().join('\nsome junk between parts\n')
    const result = importJournal(pasted)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.meta.parts).toBe(parts.length)
      expect(result.journal.character.name).toBe('Громозека')
    }
  })

  it('ignores an exact duplicate part', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 150 })
    const pasted = [...parts, parts[1]].join('\n')
    expect(importJournal(pasted).status).toBe('ok')
  })

  it('accepts a hex checksum', () => {
    const code = encodeJournalCode(cyrillicJournal, {
      partSize: 10_000,
      checksumStyle: 'hex',
    })
    expect(importJournal(code).status).toBe('ok')
  })

  it('accepts an uppercase hex checksum from a single-part export (JournalExport.lua %08X)', () => {
    const code = encodeJournalCode(cyrillicJournal, {
      partSize: 10_000,
      checksumStyle: 'hex-upper',
    })
    const result = importJournal(code)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.journal.character.name).toBe('Громозека')
      expect(result.meta.parts).toBe(1)
    }
  })

  it('accepts an uppercase hex checksum from a multi-part export', () => {
    const parts = encodeJournalParts(cyrillicJournal, {
      partSize: 150,
      checksumStyle: 'hex-upper',
    })
    expect(parts[0]).toMatch(/FJBOOK1:1\/\d+:([0-9A-F]{8}):/)
    const result = importJournal(parts.join('\n'))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.meta.parts).toBe(parts.length)
  })

  it('accepts a Lua-style journal with Unix-second timestamps and exportedAt', () => {
    const luaStyle = {
      ...cyrillicJournal,
      exportedAt: 1_770_000_000,
      journey: { ...cyrillicJournal.journey, startedAt: 1_769_900_000 },
      memories: cyrillicJournal.memories.map((memory) => ({
        ...memory,
        timestamp: Math.floor((memory.timestamp as number) / 1000),
      })),
    }
    const result = importJournal(
      encodeJournalCode(luaStyle, { partSize: 240, checksumStyle: 'hex-upper' })
    )
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.journal.exportedAt).toBe(1_770_000_000_000)
      expect(result.journal.journey.startedAt).toBe(1_769_900_000_000)
      expect(result.journal.memories[0].timestamp).toBe(
        Math.floor((cyrillicJournal.memories[0].timestamp as number) / 1000) * 1000
      )
    }
  })

  it('ignores Unicode whitespace and zero-width characters injected by chat copy-paste', () => {
    const parts = encodeJournalParts(cyrillicJournal, {
      partSize: 150,
      checksumStyle: 'hex-upper',
    })
    const dirtyInsideData =
      parts[0].slice(0, 60) + '\u00A0' + parts[0].slice(60)
    const dirty =
      '\uFEFF' + [dirtyInsideData, ...parts.slice(1)].join('\u3000\n\u200B') + '\u00A0'
    expect(importJournal(dirty).status).toBe('ok')
  })

  it('joins block payloads hard-wrapped by chat clients', () => {
    const parts = encodeJournalParts(cyrillicJournal, {
      partSize: 150,
      checksumStyle: 'hex-upper',
    })
    const wrapped = parts.map((block) => (block.match(/.{1,64}/g) || []).join('\n')).join('\n')
    expect(importJournal(wrapped).status).toBe('ok')
  })

  it('rejects a block whose payload was tampered with', () => {
    const code = encodeJournalCode(cyrillicJournal, {
      partSize: 10_000,
      checksumStyle: 'hex-upper',
    })
    const match = code.match(/^(FJBOOK1:1\/1:[0-9A-Fa-f]+:)([A-Za-z0-9+/]+)(=*)$/)
    const flipped = match![2].slice(0, -1) + (match![2].endsWith('A') ? 'B' : 'A')
    expect(importJournal(match![1] + flipped + match![3])).toMatchObject({
      status: 'error',
      code: 'CHECKSUM_MISMATCH',
    })
  })

  it('rejects non-ASCII characters injected into the payload', () => {
    const code = encodeJournalCode(cyrillicJournal, { partSize: 10_000 })
    const cut = code.lastIndexOf(':') + 40
    const dirty = code.slice(0, cut) + 'Ж' + code.slice(cut)
    const result = importJournal(dirty)
    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(['CHECKSUM_MISMATCH', 'INVALID_BASE64']).toContain(result.code)
    }
  })

  it('accepts per-part independently encoded payloads', () => {
    const bytes = encodeUtf8(JSON.stringify(cyrillicJournal))
    const checksum = adler32(bytes)
    const base64 = bytesToBase64(bytes)
    const sliceLen = Math.ceil(base64.length / 3)
    const chunks = [
      base64.slice(0, sliceLen),
      base64.slice(sliceLen, sliceLen * 2),
      base64.slice(sliceLen * 2),
    ]
    const blocks = chunks
      .map((chunk, index) => `FJBOOK1:${index + 1}/${chunks.length}:${checksum}:${chunk}`)
      .join('\n')
    const result = importJournal(blocks)
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.journal.character.name).toBe('Громозека')
  })

  it('imports an empty journal', () => {
    const empty = { ...cyrillicJournal, memories: [] }
    const result = importJournal(encodeJournalCode(empty, { partSize: 10_000 }))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.journal.memories).toHaveLength(0)
  })

  it('imports a journal with 59+ memories spread across many parts and months', () => {
    const memories = Array.from({ length: 80 }, (_, index) => ({
      type: 'note',
      typeLabel: 'Запись',
      source: 'manual',
      title: `Глава о дне ${index + 1}`,
      description: `Описание дня ${index + 1}: пройдено много дорог.`,
      personalNote: index % 5 === 0 ? `Заметка №${index + 1}` : '',
      favorite: index % 9 === 0,
      timestamp: Date.UTC(2026, 0, 1) + index * 3 * 86_400_000,
      location: 'Калимдор',
    }))
    const big = { ...cyrillicJournal, memories }
    const parts = encodeJournalParts(big, { partSize: 300 })
    expect(parts.length).toBeGreaterThan(10)
    const result = importJournal(parts.join('\n'))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.journal.memories).toHaveLength(80)
      expect(result.journal.memories[0].title).toBe('Глава о дне 1')
      expect(result.journal.memories[79].title).toBe('Глава о дне 80')
    }
  })
})

describe('importJournal — error paths', () => {
  it('rejects empty and non-FJBOOK1 input', () => {
    expect(importJournal('')).toMatchObject({ status: 'error', code: 'EMPTY_INPUT' })
    expect(importJournal('   ')).toMatchObject({ status: 'error', code: 'EMPTY_INPUT' })
    expect(importJournal('hello world')).toMatchObject({ status: 'error', code: 'NOT_FJBOOK1' })
  })

  it('reports missing parts instead of failing', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 150 })
    const pasted = parts.filter((_, index) => index !== 1).join('\n')
    const result = importJournal(pasted)
    expect(result).toMatchObject({
      status: 'needs-parts',
      total: parts.length,
      received: parts.length - 1,
      missing: [2],
    })
  })

  it('rejects a conflicting duplicate part', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 150 })
    const pasted = [...parts, parts[1] + 'QQ'].join('\n')
    expect(importJournal(pasted)).toMatchObject({
      status: 'error',
      code: 'DUPLICATE_PART',
      part: 2,
    })
  })

  it('rejects parts declaring different totals', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 150 })
    const broken = parts[1].replace(/^(FJBOOK1:\d+)\/\d+/, '$1/99')
    expect(importJournal(`${parts[0]}\n${broken}`)).toMatchObject({
      status: 'error',
      code: 'TOTAL_MISMATCH',
    })
  })

  it('rejects parts carrying different checksums', () => {
    const parts = encodeJournalParts(cyrillicJournal, { partSize: 150 })
    const tampered = withChecksum(parts[1], '12345')
    expect(importJournal(`${parts[0]}\n${tampered}`)).toMatchObject({
      status: 'error',
      code: 'CHECKSUM_PARTS_MISMATCH',
    })
  })

  it('rejects a broken part header', () => {
    expect(importJournal('FJBOOK1:3/2:123:AAAA')).toMatchObject({
      status: 'error',
      code: 'INVALID_PART_HEADER',
    })
  })

  it('rejects corrupted base64', () => {
    expect(importJournal('FJBOOK1:1/1:123:AAAAA')).toMatchObject({
      status: 'error',
      code: 'INVALID_BASE64',
    })
  })

  it('rejects a checksum mismatch', () => {
    const code = encodeJournalCode(cyrillicJournal, { partSize: 10_000 })
    expect(importJournal(withChecksum(code, '12345'))).toMatchObject({
      status: 'error',
      code: 'CHECKSUM_MISMATCH',
    })
  })

  it('rejects valid base64 that is not valid UTF-8', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0xfd])
    const block = `FJBOOK1:1/1:${adler32(bytes)}:${bytesToBase64(bytes)}`
    expect(importJournal(block)).toMatchObject({ status: 'error', code: 'INVALID_UTF8' })
  })

  it('rejects valid base64 that is not JSON', () => {
    expect(importJournal(blockWithPayload('this is not json at all'))).toMatchObject({
      status: 'error',
      code: 'INVALID_JSON',
    })
  })

  it('rejects a wrong inner format', () => {
    const payload = JSON.stringify({
      format: 'OTHER',
      formatVersion: 1,
      character: { name: 'x' },
      memories: [],
    })
    expect(importJournal(blockWithPayload(payload))).toMatchObject({
      status: 'error',
      code: 'WRONG_FORMAT',
    })
  })

  it('rejects an unsupported inner version and reports it', () => {
    const payload = JSON.stringify({
      format: 'FJJOURNAL',
      formatVersion: 99,
      character: { name: 'x' },
      memories: [],
    })
    expect(importJournal(blockWithPayload(payload))).toMatchObject({
      status: 'error',
      code: 'UNSUPPORTED_VERSION',
      detail: '99',
    })
  })

  it('rejects oversized input', () => {
    expect(importJournal('a'.repeat(10_000_001))).toMatchObject({
      status: 'error',
      code: 'TOO_LARGE',
    })
  })
})

describe('JournalExport.lua parity (MAX_ENTRIES / MAX_BYTES / block split / null fields)', () => {
  function shortMemory(index: number) {
    return {
      type: 'note',
      typeLabel: 'Запись',
      source: 'manual',
      title: `Д${index}`,
      description: 'т',
      personalNote: null,
      favorite: null,
      timestamp: 1_790_000_000 + index,
      location: null,
    }
  }

  it('imports a journal with more than 10 000 short entries (12 000)', () => {
    const journal = {
      ...cyrillicJournal,
      memories: Array.from({ length: 12_000 }, (_, index) => shortMemory(index)),
    }
    const blocks = encodeJournalParts(journal, { partSize: 30_000, checksumStyle: 'hex-upper' })
    expect(blocks.length).toBeGreaterThan(1)
    const result = importJournal(blocks.join('\n'))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.journal.memories).toHaveLength(12_000)
      expect(result.journal.memories[11_999].title).toBe('Д11999')
    }
  })

  it('imports the real exporter block split: first block 30000 chars, then 12000 each', () => {
    const journal = {
      ...cyrillicJournal,
      memories: Array.from({ length: 12_000 }, (_, index) => shortMemory(index)),
    }
    const bytes = encodeUtf8(JSON.stringify(journal))
    const checksum = adler32(bytes).toString(16).padStart(8, '0').toUpperCase()
    const base64 = bytesToBase64(bytes)
    const sizes: number[] = [Math.min(30_000, base64.length)]
    let rest = base64.length - 30_000
    while (rest > 0) {
      sizes.push(Math.min(12_000, rest))
      rest -= 12_000
    }
    const blocks: string[] = []
    let offset = 0
    sizes.forEach((size, index) => {
      blocks.push(`FJBOOK1:${index + 1}/${sizes.length}:${checksum}:${base64.slice(offset, offset + size)}`)
      offset += size
    })
    expect(blocks.length).toBeGreaterThan(2)
    const result = importJournal(blocks.join('\n'))
    expect(result.status).toBe('ok')
    if (result.status === 'ok') expect(result.meta.parts).toBe(blocks.length)
  })

  it('normalizes the null fields the Lua exporter emits for empty values', () => {
    const journal = {
      format: 'FJJOURNAL',
      formatVersion: 1,
      addonVersion: '1.0.0',
      locale: 'ruRU',
      exportedAt: null,
      character: { name: 'Ннул', race: null, class: 'Разбойник', level: 12 },
      journey: { startedAt: null, deaths: null, completedQuests: 5, totalPlayed: null },
      memories: [
        {
          type: 'note',
          typeLabel: null,
          source: null,
          title: null,
          description: 'Текст',
          personalNote: null,
          favorite: null,
          timestamp: null,
          location: null,
        },
        {
          type: 'zone',
          typeLabel: 'Зона открыта',
          source: 'zone',
          title: 'Дуротар',
          description: null,
          personalNote: null,
          favorite: true,
          timestamp: 1_790_003_600,
          location: 'Дуротар',
        },
      ],
    }
    const result = importJournal(
      encodeJournalCode(journal, { partSize: 30_000, checksumStyle: 'hex-upper' })
    )
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      const journal2 = result.journal
      expect(journal2.exportedAt).toBeUndefined()
      expect(journal2.character.race).toBe('')
      expect(journal2.journey.startedAt).toBeUndefined()
      expect(journal2.journey.deaths).toBe(0)
      expect(journal2.journey.totalPlayed).toBe(0)
      expect(journal2.memories[0].typeLabel).toBe('')
      expect(journal2.memories[0].type).toBe('note')
      expect(journal2.memories[0].timestamp).toBeUndefined()
      expect(journal2.memories[0].location).toBe('')
      expect(journal2.memories[1].timestamp).toBe(1_790_003_600_000)
    }
  })

  it('still rejects journals above MAX_ENTRIES (20 001 entries)', () => {
    const journal = {
      ...cyrillicJournal,
      memories: Array.from({ length: 20_001 }, (_, index) => ({ type: 'n', title: String(index) })),
    }
    const result = importJournal(
      encodeJournalCode(journal, { partSize: 30_000, checksumStyle: 'hex-upper' })
    )
    expect(result).toMatchObject({ status: 'error', code: 'INVALID_SCHEMA' })
  })
})
