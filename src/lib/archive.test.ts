import { describe, expect, it } from 'vitest'
import { buildArchiveView } from './archive'
import type { Journal } from './journal'
import { strings } from '../i18n'

const day = (month: number, date: number) => Date.UTC(2026, month, date, 12)

const journalWith = (archive: Journal['archive'], memories = 7): Journal => ({
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '0.9.8',
  locale: '',
  character: { name: 'Straider', race: '', class: '', level: 0 },
  journey: {},
  memories: Array.from({ length: memories }, () => ({
    type: 'ZONE',
    typeLabel: 'DISCOVERY',
    source: 'RECORDED',
    title: '',
    description: '',
    personalNote: '',
    favorite: false,
    location: '',
  })),
  ...(archive ? { archive } : {}),
})

describe('buildArchiveView', () => {
  it('returns null without an archive (FJBOOK1 journals render no section)', () => {
    expect(buildArchiveView(journalWith(undefined), strings.en, 'en')).toBeNull()
  })

  it('builds the snapshot section with the explicit disclaimer in both languages', () => {
    const journal = journalWith({
      recovered: { capturedAt: day(5, 5), completedQuests: 182, playedTotal: 183_754, level: 25 },
      professions: [],
      zones: [],
    })
    const en = buildArchiveView(journal, strings.en, 'en')
    expect(en?.title).toBe('Character Archive')
    expect(en?.snapshot?.title).toBe('Historical Snapshot')
    expect(en?.snapshot?.note).toBe(
      'Historical snapshot from SavedVariables. These values may not represent the character\u2019s final state.'
    )
    expect(en?.snapshot?.stats).toEqual([
      { label: 'Level', value: '25' },
      { label: 'Quests completed', value: '182' },
      { label: 'Time played', value: '2d 3h' },
      { label: 'Snapshot date', value: 'June 5, 2026' },
    ])

    const ru = buildArchiveView(journal, strings.ru, 'ru')
    expect(ru?.title).toBe('Архив персонажа')
    expect(ru?.snapshot?.title).toBe('Исторический снимок')
    expect(ru?.snapshot?.note).toBe(
      'Исторический снимок из SavedVariables. Значения могут не соответствовать последнему состоянию персонажа.'
    )
    expect(ru?.snapshot?.stats).toEqual([
      { label: 'Уровень', value: '25' },
      { label: 'Квестов выполнено', value: '182' },
      { label: 'Времени в игре', value: '2 д 3 ч' },
      { label: 'Дата снимка', value: '5 июня 2026 г.' },
    ])
  })

  it('hides every absent snapshot value instead of showing a zero', () => {
    const journal = journalWith({
      recovered: { playedTotal: 0 }, // a known zero stays
      professions: [],
      zones: [],
    })
    const view = buildArchiveView(journal, strings.en, 'en')
    expect(view?.snapshot?.stats).toEqual([{ label: 'Time played', value: '0m' }])
  })

  it('shows professions with a progress bar only when the maximum is valid', () => {
    const journal = journalWith({
      professions: [
        { name: 'Горное дело', skillLevel: 94, maxSkillLevel: 150 },
        { name: 'Травничество', skillLevel: 30 }, // no maximum → no bar
        { name: 'Тайнопись', maxSkillLevel: 75 }, // no skill → no bar, no numbers
        { name: 'Кулинария', skillLevel: 25, maxSkillLevel: 75 },
      ],
      zones: [],
    })
    const view = buildArchiveView(journal, strings.ru, 'ru')
    expect(view?.professions?.title).toBe('Профессии')
    expect(view?.professions?.items).toEqual([
      { name: 'Горное дело', skill: '94 / 150', progress: 63 },
      { name: 'Травничество', skill: '30' },
      { name: 'Тайнопись', skill: '' },
      { name: 'Кулинария', skill: '25 / 75', progress: 33 },
    ])
  })

  it('sorts zones chronologically with a deterministic ru-collation tiebreak', () => {
    const journal = journalWith({
      professions: [],
      zones: [
        { name: 'Пылающие степи', firstSeenAt: day(7, 3) },
        { name: 'Болото', firstSeenAt: day(5, 17) },
        { name: 'Азшара', firstSeenAt: day(5, 17) }, // same date → ru collation decides
        { name: 'Без даты' }, // undated zones go last
        { name: 'Ява', firstSeenAt: day(5, 17) },
      ],
    })
    const view = buildArchiveView(journal, strings.ru, 'ru')
    // chronological first; the equal-date group keeps ru alphabetical order
    // (А < Б < Я), undated entries trail at the end
    expect(view?.zones?.items.map((zone) => zone.name)).toEqual([
      'Азшара',
      'Болото',
      'Ява',
      'Пылающие степи',
      'Без даты',
    ])
    expect(view?.zones?.items[0].firstSeen).toBe('17 июня 2026 г.')
    expect(view?.zones?.items[4].firstSeen).toBe('')
  })

  it('saved statistics show the declared counter and the memory count, never event counts', () => {
    const declared = journalWith({ professions: [], zones: [], deathsCounter: 24 })
    expect(buildArchiveView(declared, strings.ru, 'ru')?.savedStats?.stats).toEqual([
      { label: 'Смертей (сохранённый счётчик)', value: '24' },
      { label: 'Воспоминаний', value: '7' },
    ])

    // no declared counter (journey.deaths would be a counted event fallback) →
    // no death tile at all: the saved-counter label must never dress up an
    // event count as a saved counter
    const counted = journalWith({ professions: [], zones: [] })
    expect(buildArchiveView(counted, strings.en, 'en')?.savedStats?.stats).toEqual([
      { label: 'Memories', value: '7' },
    ])

    // a valid declared zero is a real value
    const zero = journalWith({ professions: [], zones: [], deathsCounter: 0 }, 0)
    expect(buildArchiveView(zero, strings.en, 'en')?.savedStats?.stats).toEqual([
      { label: 'Deaths (saved counter)', value: '0' },
      { label: 'Memories', value: '0' },
    ])
  })

  it('sections disappear when the file carries no data for them', () => {
    const view = buildArchiveView(
      journalWith({ professions: [], zones: [], deathsCounter: 5 }),
      strings.en,
      'en'
    )
    expect(view?.snapshot).toBeNull()
    expect(view?.professions).toBeNull()
    expect(view?.zones).toBeNull()
    expect(view?.savedStats).not.toBeNull()
  })
})
