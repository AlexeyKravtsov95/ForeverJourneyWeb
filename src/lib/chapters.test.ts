import { describe, expect, it } from 'vitest'
import { buildChapters } from './chapters'
import type { JournalChapter, JournalMemory } from './journal'

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

function chapter(overrides: Partial<JournalChapter> = {}): JournalChapter {
  return {
    id: 'g-1',
    title: 'Затерянные берега',
    description: '',
    startedAt: Date.UTC(2026, 3, 1),
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

  it('sorts with an explicit index tiebreak, not relying on engine sort stability', () => {
    // 3000 equal-timestamp memories would expose an unstable engine sort
    const many = Array.from({ length: 3000 }, (_, index) =>
      memory({ title: `#${index}`, timestamp: JUNE })
    )
    const chapters = buildChapters(many, 'en', 'Undated')
    expect(chapters[0].memories.map((m) => m.title)).toEqual(many.map((m) => m.title))
  })
})

describe('buildChapters with author chapters (FJ-WEB-03)', () => {
  it('without author chapters the grouping is exactly the month grouping', () => {
    const memories = [memory({ title: 'june', timestamp: JUNE })]
    expect(buildChapters(memories, 'en', 'Undated', [])).toEqual(
      buildChapters(memories, 'en', 'Undated')
    )
  })

  it('uses the chapter title and description for bound memories (one chapter)', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'в главе', timestamp: JUNE, chapterId: 'g-1' }),
        memory({ title: 'тоже в главе', timestamp: JULY, chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [chapter({ description: 'Дни прибоя и тумана.' })]
    )
    expect(chapters).toHaveLength(1)
    expect(chapters[0]).toMatchObject({
      label: 'Затерянные берега',
      description: 'Дни прибоя и тумана.',
    })
    // memories inside the chapter stay chronological
    expect(chapters[0].memories.map((m) => m.title)).toEqual(['в главе', 'тоже в главе'])
  })

  it('orders several chapters by their start time, whatever the input order', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'из второй', timestamp: JULY, chapterId: 'g-2' }),
        memory({ title: 'из первой', timestamp: JUNE, chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [
        chapter({ id: 'g-2', title: 'Вторая', startedAt: Date.UTC(2026, 6, 1) }),
        chapter({ id: 'g-1', title: 'Первая', startedAt: Date.UTC(2026, 5, 1) }),
      ]
    )
    expect(chapters.map((c) => c.label)).toEqual(['Первая', 'Вторая'])
  })

  it('keeps month sections for unbound memories and merges everything chronologically', () => {
    const chapters = buildChapters(
      [
        // March, before any chapter → month section
        memory({ title: 'март', timestamp: Date.UTC(2026, 2, 5) }),
        // bound to the April chapter even though its own time is June
        memory({ title: 'в апрельской главе', timestamp: JUNE, chapterId: 'g-1' }),
        // May, unbound → a month section between the chapter and June
        memory({ title: 'май', timestamp: Date.UTC(2026, 4, 2) }),
      ],
      'en',
      'Undated memories',
      [chapter({ startedAt: Date.UTC(2026, 3, 1) })]
    )
    expect(chapters.map((c) => c.label)).toEqual([
      'March 2026',
      'Затерянные берега',
      'May 2026',
    ])
    expect(chapters[1].memories.map((m) => m.title)).toEqual(['в апрельской главе'])
  })

  it('a memory binding wins over its timestamp, even outside the chapter interval', () => {
    const chapters = buildChapters(
      [
        // dated long AFTER the chapter closed, but explicitly bound to it
        memory({ title: 'вне интервала', timestamp: Date.UTC(2026, 11, 1), chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [chapter({ closedAt: Date.UTC(2026, 3, 30) })]
    )
    expect(chapters).toHaveLength(1)
    expect(chapters[0].label).toBe('Затерянные берега')
  })

  it('renders no section for a chapter without memories', () => {
    const chapters = buildChapters(
      [memory({ title: 'в другой главе', timestamp: JUNE, chapterId: 'g-2' })],
      'en',
      'Undated memories',
      [
        chapter({ id: 'g-1', title: 'Пустая' }),
        chapter({ id: 'g-2', title: 'Живая', startedAt: Date.UTC(2026, 5, 1) }),
      ]
    )
    expect(chapters.map((c) => c.label)).toEqual(['Живая'])
  })

  it('a dangling chapterId is not lost — the memory falls back to its month section', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'потерянная связь', timestamp: JUNE, chapterId: 'g-missing' }),
        memory({ title: 'без связи', timestamp: JUNE }),
      ],
      'en',
      'Undated memories',
      [chapter()]
    )
    expect(chapters).toHaveLength(1)
    expect(chapters[0].label).toBe('June 2026')
    expect(chapters[0].memories.map((m) => m.title)).toEqual([
      'потерянная связь',
      'без связи',
    ])
  })

  it('keeps the imported order for equal timestamps inside a chapter', () => {
    const at = JUNE + 5000
    const chapters = buildChapters(
      [
        memory({ title: 'b', timestamp: at, chapterId: 'g-1' }),
        memory({ title: 'a', timestamp: at, chapterId: 'g-1' }),
        memory({ title: 'first', timestamp: JUNE, chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [chapter({ startedAt: Date.UTC(2026, 5, 1) })]
    )
    expect(chapters[0].memories.map((m) => m.title)).toEqual(['first', 'b', 'a'])
  })

  it('an undated memory bound to a chapter joins it; an unbound one stays in the trailing section', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'без даты в главе', chapterId: 'g-1' }),
        memory({ title: 'без даты и главы' }),
      ],
      'ru',
      'Воспоминания без даты',
      [chapter()]
    )
    expect(chapters).toHaveLength(2)
    expect(chapters[0].label).toBe('Затерянные берега')
    expect(chapters[0].memories.map((m) => m.title)).toEqual(['без даты в главе'])
    expect(chapters[1].label).toBe('Воспоминания без даты')
  })

  it('on equal start times the author chapter opens the period (comes first)', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'в главе', timestamp: JUNE, chapterId: 'g-1' }),
        memory({ title: 'май', timestamp: Date.UTC(2026, 4, 1) }),
      ],
      'en',
      'Undated memories',
      [chapter({ startedAt: Date.UTC(2026, 4, 1) })]
    )
    expect(chapters.map((c) => c.label)).toEqual(['Затерянные берега', 'May 2026'])
  })

  it('does not mutate the input arrays', () => {
    const memories = [
      memory({ title: 'b', timestamp: JULY, chapterId: 'g-1' }),
      memory({ title: 'a', timestamp: JUNE, chapterId: 'g-1' }),
    ]
    const authorChapters = [chapter()]
    const snapshot = JSON.stringify({ memories, authorChapters })
    buildChapters(memories, 'en', 'Undated memories', authorChapters)
    expect(JSON.stringify({ memories, authorChapters })).toBe(snapshot)
  })

  it('treats duplicated chapter ids deterministically: first occurrence owns the memories', () => {
    const chapters = buildChapters(
      [memory({ title: 'в главе', timestamp: JUNE, chapterId: 'g-1' })],
      'en',
      'Undated memories',
      [
        chapter({ title: 'Первая' }),
        chapter({ title: 'Вторая', startedAt: Date.UTC(2026, 5, 20) }),
      ]
    )
    expect(chapters).toHaveLength(1)
    expect(chapters[0].label).toBe('Первая')
  })

  // ---- FJ-WEB-03 review: a chapter starting mid-month splits that month ----

  it('the mandatory regression: 2 июня (вне глав) → глава (10 июня) → 12 июня (в главе) → 25 июня (вне глав)', () => {
    const chapters = buildChapters(
      [
        memory({ title: '2 июня', timestamp: Date.UTC(2026, 5, 2) }),
        memory({ title: '12 июня', timestamp: Date.UTC(2026, 5, 12), chapterId: 'g-1' }),
        memory({ title: '25 июня', timestamp: Date.UTC(2026, 5, 25) }),
      ],
      'en',
      'Undated memories',
      [chapter({ title: 'Дороги июня', startedAt: Date.UTC(2026, 5, 10), closedAt: Date.UTC(2026, 5, 20) })]
    )
    // the month split around the chapter — June appears as TWO sections
    expect(chapters.map((c) => c.label)).toEqual(['June 2026', 'Дороги июня', 'June 2026'])
    expect(chapters[0].memories.map((m) => m.title)).toEqual(['2 июня'])
    expect(chapters[1].memories.map((m) => m.title)).toEqual(['12 июня'])
    expect(chapters[2].memories.map((m) => m.title)).toEqual(['25 июня'])
  })

  it('splits one month into three segments when two chapters start inside it', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'начало', timestamp: Date.UTC(2026, 5, 1) }),
        memory({ title: 'между', timestamp: Date.UTC(2026, 5, 14) }),
        memory({ title: 'конец', timestamp: Date.UTC(2026, 5, 28) }),
        memory({ title: 'в первой', timestamp: Date.UTC(2026, 5, 5), chapterId: 'g-1' }),
        memory({ title: 'во второй', timestamp: Date.UTC(2026, 5, 20), chapterId: 'g-2' }),
      ],
      'en',
      'Undated memories',
      [
        chapter({ title: 'Первая', startedAt: Date.UTC(2026, 5, 4) }),
        chapter({ id: 'g-2', title: 'Вторая', startedAt: Date.UTC(2026, 5, 15) }),
      ]
    )
    expect(chapters.map((c) => c.label)).toEqual([
      'June 2026',
      'Первая',
      'June 2026',
      'Вторая',
      'June 2026',
    ])
    expect(chapters.flatMap((c) => c.memories.map((m) => m.title))).toEqual([
      'начало',
      'в первой',
      'между',
      'во второй',
      'конец',
    ])
  })

  it('an empty chapter renders nothing AND divides no month', () => {
    const chapters = buildChapters(
      [
        memory({ title: 'до', timestamp: Date.UTC(2026, 5, 2) }),
        memory({ title: 'после', timestamp: Date.UTC(2026, 5, 25) }),
      ],
      'en',
      'Undated memories',
      [chapter({ title: 'Пустая', startedAt: Date.UTC(2026, 5, 10) })]
    )
    // no bound memories → no section, and the two unbound memories share ONE June section
    expect(chapters).toHaveLength(1)
    expect(chapters[0].label).toBe('June 2026')
    expect(chapters[0].memories).toHaveLength(2)
  })

  it('an explicit binding keeps priority over the timestamp inside another chapter', () => {
    const chapters = buildChapters(
      [
        // dated inside June chapter's interval, but explicitly bound to the July one
        memory({ title: 'перелёт', timestamp: Date.UTC(2026, 5, 12), chapterId: 'g-2' }),
        memory({ title: 'оседлое', timestamp: Date.UTC(2026, 5, 15), chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [
        chapter({ title: 'Июньская', startedAt: Date.UTC(2026, 5, 10) }),
        chapter({ id: 'g-2', title: 'Июльская', startedAt: Date.UTC(2026, 6, 1) }),
      ]
    )
    expect(chapters.map((c) => c.label)).toEqual(['Июньская', 'Июльская'])
    expect(chapters[1].memories.map((m) => m.title)).toEqual(['перелёт'])
  })

  it('keeps equal timestamps stable across a month split', () => {
    const at = Date.UTC(2026, 5, 25, 12)
    const chapters = buildChapters(
      [
        memory({ title: 'b', timestamp: at }),
        memory({ title: 'a', timestamp: at }),
        memory({ title: 'в главе', timestamp: Date.UTC(2026, 5, 12), chapterId: 'g-1' }),
      ],
      'en',
      'Undated memories',
      [chapter({ title: 'Дороги июня', startedAt: Date.UTC(2026, 5, 10) })]
    )
    expect(chapters).toHaveLength(2)
    expect(chapters[1].memories.map((m) => m.title)).toEqual(['b', 'a'])
  })

  it('loses and duplicates no memory across the split (identity check)', () => {
    const memories = [
      memory({ title: 'до', timestamp: Date.UTC(2026, 5, 2) }),
      memory({ title: 'глава-1', timestamp: Date.UTC(2026, 5, 11), chapterId: 'g-1' }),
      memory({ title: 'граница', timestamp: Date.UTC(2026, 5, 10) }), // == chapter start
      memory({ title: 'после', timestamp: Date.UTC(2026, 5, 25) }),
      memory({ title: 'без даты' }),
    ]
    const chapters = buildChapters(
      memories,
      'en',
      'Undated memories',
      [chapter({ title: 'Дороги июня', startedAt: Date.UTC(2026, 5, 10) })]
    )
    // every input memory appears exactly once, by identity
    const collected = chapters.flatMap((c) => c.memories)
    expect(collected).toHaveLength(memories.length)
    for (const entry of memories) {
      expect(collected.filter((m) => m === entry)).toHaveLength(1)
    }
    // a memory stamped exactly at the chapter start sorts after the chapter
    expect(chapters.map((c) => c.label)).toEqual(['June 2026', 'Дороги июня', 'June 2026', 'Undated memories'])
    expect(chapters[2].memories.map((m) => m.title)).toEqual(['граница', 'после'])
  })
})
