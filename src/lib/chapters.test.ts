import { describe, expect, it } from 'vitest'
import { buildChapters } from './chapters'
import type { JournalMemory } from './journal'

function memory(overrides: Partial<JournalMemory>): JournalMemory {
  return {
    type: 'note',
    typeLabel: 'Journal Entry',
    source: 'manual',
    title: '',
    description: '',
    personalNote: '',
    favorite: false,
    location: '',
    ...overrides,
  }
}

const JUNE = Date.UTC(2026, 5, 15)
const JULY = Date.UTC(2026, 6, 2)

describe('buildChapters', () => {
  it('groups memories into chronological month chapters', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'later', timestamp: JULY }),
        memory({ title: 'earlier', timestamp: JUNE }),
      ],
      'en',
      'Undated memories'
    )
    expect(chapters).toHaveLength(2)
    expect(chapters[0].label).toBe('June 2026')
    expect(chapters[0].memories[0].title).toBe('earlier')
    expect(chapters[1].label).toBe('July 2026')
  })

  it('keeps the imported order for memories with equal timestamps', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'b', timestamp: JUNE + 1000 }),
        memory({ title: 'a', timestamp: JUNE + 1000 }),
        memory({ title: 'first', timestamp: JUNE }),
      ],
      'en',
      'Undated memories'
    )
    expect(chapters).toHaveLength(1)
    // stable sort: 'b' stays before 'a' exactly as the import ordered them
    expect(chapters[0].memories.map((m) => m.title)).toEqual(['first', 'b', 'a'])
  })

  it('puts undated memories into a single trailing chapter with the localized label', () => {
    const chapters = buildChapters(
      [memory({ title: 'lost in time' }), memory({ title: 'dated', timestamp: JUNE })],
      'ru',
      'Воспоминания без даты'
    )
    expect(chapters).toHaveLength(2)
    expect(chapters[1].label).toBe('Воспоминания без даты')
    expect(chapters[1].memories[0].title).toBe('lost in time')
  })

  it('labels chapters with the Russian month when lang is ru', () => {
    const chapters = buildChapters([memory({ timestamp: JUNE })], 'ru', '…')
    expect(chapters[0].label).toBe('июнь 2026 г.')
  })

  it('returns no chapters for an empty journal', () => {
    expect(buildChapters([], 'en', 'Undated')).toEqual([])
  })
})
