import { describe, expect, it } from 'vitest'
import { buildArchiveView, buildQuestRegistryCsv } from './archive'
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
    // the quest counter now lives in the Quest Registry — the snapshot tiles
    // never repeat it (FJ-WEB-07)
    expect(en?.snapshot?.stats).toEqual([
      { label: 'Level', value: '25' },
      { label: 'Time played', value: '2d 3h 2m 34s' },
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
      { label: 'Времени в игре', value: '2 д 3 ч 2 мин 34 с' },
      { label: 'Дата снимка', value: '5 июня 2026 г.' },
    ])
  })

  it('shows the time played at the recorded level next to the total, distinct from both', () => {
    // 11827 s → 3h 17m 7s; the value is a duration at the snapshot level and
    // must never render as a level number or merge into the total
    const journal = journalWith({
      recovered: { level: 25, playedTotal: 183_754, playedCurrentLevel: 11_827 },
      professions: [],
      zones: [],
    })
    const en = buildArchiveView(journal, strings.en, 'en')
    expect(en?.snapshot?.stats).toEqual([
      { label: 'Level', value: '25' },
      { label: 'Time played', value: '2d 3h 2m 34s' },
      { label: 'Time played at recorded level', value: '3h 17m 7s' },
    ])
    const ru = buildArchiveView(journal, strings.ru, 'ru')
    expect(ru?.snapshot?.stats).toEqual([
      { label: 'Уровень', value: '25' },
      { label: 'Времени в игре', value: '2 д 3 ч 2 мин 34 с' },
      { label: 'Время игры на уровне', value: '3 ч 17 мин 7 с' },
    ])
  })

  it('hides every absent snapshot value instead of showing a zero', () => {
    const journal = journalWith({
      recovered: { playedTotal: 0 }, // a known zero stays
      professions: [],
      zones: [],
    })
    const view = buildArchiveView(journal, strings.en, 'en')
    expect(view?.snapshot?.stats).toEqual([{ label: 'Time played', value: '0s' }])
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

  it('never repeats the intro counters: only a provenance note may mention them', () => {
    // the declared counter is explained, never re-listed as a Saved Statistics
    // section — the introduction already shows deaths and memories
    const declared = journalWith({
      recovered: { level: 25 },
      professions: [],
      zones: [],
      deathsCounter: 24,
    })
    const view = buildArchiveView(declared, strings.ru, 'ru')
    expect(view?.counterNote).toBe(
      'Общее число смертей во вступлении — сохранённый счётчик аддона: летопись сохраняет лишь часть смертей как воспоминания.'
    )
    expect(view?.snapshot?.stats).toEqual([{ label: 'Уровень', value: '25' }])
    expect(view?.professions).toBeNull()
    expect(view?.zones).toBeNull()

    // no declared counter (journey.deaths would be a counted event fallback) →
    // no note: an event count must never be dressed up as a saved counter
    const counted = journalWith({
      recovered: { level: 25 },
      professions: [],
      zones: [],
    })
    expect(buildArchiveView(counted, strings.en, 'en')?.counterNote).toBeNull()

    // a declared zero is a real value and still gets its provenance note
    const zero = journalWith(
      { recovered: { level: 25 }, professions: [], zones: [], deathsCounter: 0 },
      0
    )
    expect(buildArchiveView(zero, strings.en, 'en')?.counterNote).toBe(
      'The death total in the introduction is the addon’s saved counter — the chronicle keeps only some deaths as memories.'
    )
  })

  it('a declared counter alone is intro material, not an archive page', () => {
    // nothing to show in the archive itself — the counter lives in the
    // introduction, so the section must not render at all
    const onlyCounter = journalWith({ professions: [], zones: [], deathsCounter: 24 })
    expect(buildArchiveView(onlyCounter, strings.en, 'en')).toBeNull()
  })

  it('sections disappear when the file carries no data for them', () => {
    const view = buildArchiveView(
      journalWith({ recovered: { level: 25 }, professions: [], zones: [], deathsCounter: 5 }),
      strings.en,
      'en'
    )
    expect(view?.snapshot).not.toBeNull()
    expect(view?.economy).toBeNull()
    // no counter and no IDs anywhere → the registry section stays hidden
    expect(view?.quests).toBeNull()
    expect(view?.professions).toBeNull()
    expect(view?.zones).toBeNull()
    expect(view?.counterNote).not.toBeNull()
  })

  it('a snapshot stat alone no longer includes the quest counter (it moved to the registry)', () => {
    const view = buildArchiveView(
      journalWith({ recovered: { level: 25, completedQuests: 3 }, professions: [], zones: [] }),
      strings.en,
      'en'
    )
    expect(view?.snapshot?.stats).toEqual([{ label: 'Level', value: '25' }])
    // the same saved 3 now belongs to the Quest Registry section
    expect(view?.quests?.counter).toEqual({ label: 'Saved quest counter', value: '3' })
  })
})

describe('buildArchiveView — economy (FJ-WEB-07)', () => {
  it('renders the four saved figures with their provenance labels in both languages', () => {
    const journal = journalWith({
      recovered: { moneyBalance: 96_179 },
      professions: [],
      zones: [],
      money: { earned: 2_833, current: 90_720, spent: 8_292 },
    })
    const en = buildArchiveView(journal, strings.en, 'en')
    expect(en?.economy?.title).toBe('Economy')
    expect(en?.economy?.note).toBe(
      'Saved by the addon. These figures may not reflect the character\u2019s final state or the full history of its transactions.'
    )
    expect(en?.economy?.rows).toEqual([
      { label: 'Balance at snapshot', value: '9g 61s 79c' },
      { label: 'Last recorded balance', value: '9g 7s 20c' },
      { label: 'Tracked gains', value: '28s 33c' },
      { label: 'Tracked spending', value: '82s 92c' },
    ])
    // no derived "profit"/"net" figure is ever computed from these values
    expect(JSON.stringify(en?.economy)).not.toMatch(/profit|net|Прибыль|прибыль/i)

    const ru = buildArchiveView(journal, strings.ru, 'ru')
    expect(ru?.economy?.title).toBe('Экономика')
    expect(ru?.economy?.rows).toEqual([
      { label: 'Баланс на момент снимка', value: '9g 61s 79c' },
      { label: 'Последний сохранённый баланс', value: '9g 7s 20c' },
      { label: 'Учтённые поступления', value: '28s 33c' },
      { label: 'Учтённые расходы', value: '82s 92c' },
    ])
  })

  it('keeps the two balance sources apart: snapshot balance differs from the last recorded one', () => {
    const journal = journalWith({
      recovered: { moneyBalance: 96_179 },
      professions: [],
      zones: [],
      money: { current: 90_720 },
    })
    const view = buildArchiveView(journal, strings.en, 'en')
    expect(view?.economy?.rows).toEqual([
      { label: 'Balance at snapshot', value: '9g 61s 79c' },
      { label: 'Last recorded balance', value: '9g 7s 20c' },
    ])
  })

  it('shows each row only when its own value exists; a valid zero stays', () => {
    // tracked money without a snapshot: no snapshot balance row
    const trackedOnly = journalWith({
      professions: [],
      zones: [],
      money: { earned: 0, spent: 12 },
    })
    expect(buildArchiveView(trackedOnly, strings.en, 'en')?.economy?.rows).toEqual([
      { label: 'Tracked gains', value: '0c' },
      { label: 'Tracked spending', value: '12c' },
    ])

    // a snapshot balance alone is still an Economy section
    const snapshotOnly = journalWith({
      recovered: { moneyBalance: 0 },
      professions: [],
      zones: [],
    })
    expect(buildArchiveView(snapshotOnly, strings.ru, 'ru')?.economy?.rows).toEqual([
      { label: 'Баланс на момент снимка', value: '0c' },
    ])

    // no money anywhere → no section at all
    const none = journalWith({ recovered: { level: 10 }, professions: [], zones: [] })
    expect(buildArchiveView(none, strings.en, 'en')?.economy).toBeNull()
  })
})

describe('buildArchiveView — quest registry (FJ-WEB-07)', () => {
  it('keeps the saved counter and the ID count as two separate values (182 vs 209)', () => {
    const ids = [8, 25, 235, 264, ...Array.from({ length: 205 }, (_, i) => 300 + i * 3)]
    expect(ids).toHaveLength(209)
    const journal = journalWith({
      recovered: { completedQuests: 182, questIDs: ids },
      professions: [],
      zones: [],
    })
    const en = buildArchiveView(journal, strings.en, 'en')
    expect(en?.quests?.title).toBe('Quest Registry')
    expect(en?.quests?.counter).toEqual({ label: 'Saved quest counter', value: '182' })
    expect(en?.quests?.savedIds).toEqual({ label: 'Saved quest IDs', value: '209' })
    expect(en?.quests?.mismatchNote).toBe(
      'The saved quest counter and the number of recorded IDs differ in the source file. Both values are preserved as recorded.'
    )
    expect(en?.quests?.ids).toEqual(ids)
    expect(en?.quests?.idsToggle).toBe('Saved quest IDs (209)')
    expect(en?.quests?.note).toBe(
      'Quest names are not saved in the file — only the saved counter and the raw quest IDs.'
    )

    const ru = buildArchiveView(journal, strings.ru, 'ru')
    expect(ru?.quests?.title).toBe('Реестр заданий')
    expect(ru?.quests?.counter).toEqual({ label: 'Сохранённый счётчик заданий', value: '182' })
    expect(ru?.quests?.savedIds).toEqual({ label: 'Сохранённых ID заданий', value: '209' })
    expect(ru?.quests?.mismatchNote).toBe(
      'Счётчик заданий и количество сохранённых ID различаются в исходном файле. Данные показаны без изменений.'
    )
    expect(ru?.quests?.idsToggle).toBe('Сохранённые ID заданий (209)')
  })

  it('matching counter and ID count: no mismatch note', () => {
    const journal = journalWith({
      recovered: { completedQuests: 3, questIDs: [8, 25, 235] },
      professions: [],
      zones: [],
    })
    const view = buildArchiveView(journal, strings.en, 'en')
    expect(view?.quests?.counter?.value).toBe('3')
    expect(view?.quests?.savedIds?.value).toBe('3')
    expect(view?.quests?.mismatchNote).toBeNull()
  })

  it('each value stands alone: a counter without IDs, IDs without a counter', () => {
    const counterOnly = journalWith({
      recovered: { completedQuests: 12 },
      professions: [],
      zones: [],
    })
    const counterView = buildArchiveView(counterOnly, strings.en, 'en')
    expect(counterView?.quests?.counter?.value).toBe('12')
    expect(counterView?.quests?.savedIds).toBeNull()
    expect(counterView?.quests?.idsToggle).toBe('Saved quest IDs')
    expect(counterView?.quests?.ids).toEqual([])

    const idsOnly = journalWith({
      recovered: { questIDs: [7, 11] },
      professions: [],
      zones: [],
    })
    const idsView = buildArchiveView(idsOnly, strings.ru, 'ru')
    expect(idsView?.quests?.counter).toBeNull()
    expect(idsView?.quests?.savedIds?.value).toBe('2')
    expect(idsView?.quests?.mismatchNote).toBeNull()
    expect(idsView?.quests?.ids).toEqual([7, 11])
  })

  it('quest IDs never become chronicle content or quest names', () => {
    const journal = journalWith({
      recovered: { questIDs: [8, 25] },
      professions: [],
      zones: [],
    })
    // the registry describes raw IDs; no memory is created and no name invented
    expect(journal.memories).toHaveLength(7)
    const view = buildArchiveView(journal, strings.en, 'en')
    expect(view?.quests?.ids).toEqual([8, 25])
    expect(view?.quests?.ids.every((id) => Number.isInteger(id))).toBe(true)
    expect(view?.quests?.counter).toBeNull() // never a count derived from the IDs
  })
})

describe('buildQuestRegistryCsv (FJ-WEB-07)', () => {
  it('emits exactly the header and the saved IDs', () => {
    expect(buildQuestRegistryCsv([8, 25, 235, 264])).toBe('quest_id\n8\n25\n235\n264\n')
  })

  it('carries no names, no other characters and nothing derived', () => {
    const csv = buildQuestRegistryCsv([8, 25])
    expect(csv.split('\n').filter(Boolean)).toEqual(['quest_id', '8', '25'])
    // apart from the header, nothing alphabetic — no invented quest names
    expect(csv.replace('quest_id\n', '')).not.toMatch(/[A-Za-z]/)
  })

  it('an empty registry is just the header', () => {
    expect(buildQuestRegistryCsv([])).toBe('quest_id\n')
  })
})
