import { describe, expect, it } from 'vitest'
import { endSentence, introLeadText, localizeMemory } from './localize'
import { strings } from '../i18n'
import type { JournalMemory } from './journal'

const memory = (over: Partial<JournalMemory> = {}): JournalMemory => ({
  type: 'zone',
  typeLabel: 'Zone Discovered',
  source: 'zone',
  title: 'Darkshore',
  description: 'A new place became part of your journey.',
  personalNote: '',
  favorite: false,
  // midday UTC keeps the calendar date stable in any local timezone
  timestamp: Date.UTC(2026, 5, 14, 12, 0),
  location: 'Darkshore',
  ...over,
})

describe('localizeMemory — type labels', () => {
  it.each([
    ['Zone', 'Зона'],
    ['ZONE', 'Зона'],
    ['Zone Discovered', 'Зона открыта'],
    ['DISCOVERY', 'ОТКРЫТИЕ'],
    ['Death', 'Смерть'],
    ['Level', 'УРОВЕНЬ'],
    ['LEVEL', 'УРОВЕНЬ'],
    ['Level Up', 'Новый уровень'],
    ['Victory', 'Победа'],
    ['Instance', 'Подземелье'],
    ['Memory', 'ВОСПОМИНАНИЕ'],
    ['MEMORY', 'ВОСПОМИНАНИЕ'],
    ['Quest Milestone', 'ВЕХА ЗАДАНИЙ'],
    ['Achievement', 'Достижение'],
    ['PROFESSION', 'ПРОФЕССИЯ'],
    ['Journal Entry', 'Запись в дневнике'],
  ])(`translates the system label "%s" to "%s" in Russian`, (en, ru) => {
    expect(localizeMemory(memory({ typeLabel: en }), 'ru').typeLabel).toBe(ru)
  })

  it('keeps every label verbatim in English', () => {
    for (const label of ['Zone Discovered', 'Death', 'Quest Milestone', 'Raid Night']) {
      expect(localizeMemory(memory({ typeLabel: label }), 'en').typeLabel).toBe(label)
    }
  })

  it('keeps unknown labels untouched in Russian', () => {
    const entry = memory({ type: 'custom', typeLabel: 'Raid Night' })
    expect(localizeMemory(entry, 'ru').typeLabel).toBe('Raid Night')
  })

  it('keeps labels that are already Russian (ruRU journals)', () => {
    expect(localizeMemory(memory({ typeLabel: 'Зона открыта' }), 'ru').typeLabel).toBe(
      'Зона открыта'
    )
  })
})

describe('localizeMemory — template text', () => {
  it.each([
    ['A new place became part of your journey.', 'Новое место стало частью твоего пути.'],
    ['Your journey continues.', 'Путешествие продолжается.'],
    ['The battle ended in victory.', 'Сражение завершилось победой.'],
    ['Every journey has its setbacks.', 'Даже поражения становятся частью истории.'],
    ['Reached the level cap.', 'Достигнут максимальный уровень.'],
    ['Another chapter of your journey lies within.', 'Впереди ещё одна глава путешествия.'],
    [
      'Another important questing milestone has been reached.',
      'Достигнута новая важная веха в путешествии.',
    ],
    [
      'A new profession became part of the journey.',
      'Новая профессия стала частью путешествия.',
    ],
    ['A new profession milestone has been reached.', 'Достигнута новая профессиональная веха.'],
  ])('translates the system description "%s"', (en, ru) => {
    expect(localizeMemory(memory({ description: en }), 'ru').description).toBe(ru)
  })

  it('translates numbered system templates', () => {
    const entry = memory({
      type: 'level',
      typeLabel: 'Level Up',
      title: 'Level 20',
      description: 'Reached level 20.',
    })
    const view = localizeMemory(entry, 'ru')
    expect(view.title).toBe('Уровень 20')
    expect(view.description).toBe('Достигнут уровень 20.')
  })

  it.each([1, 3, 11, 21, 80])('translates "Reached Level %i" as "Уровень повышен до %i"', (level) => {
    const entry = memory({ type: 'level', title: `Reached Level ${level}` })
    expect(localizeMemory(entry, 'ru').title).toBe(`Уровень повышен до ${level}`)
  })

  it.each([
    ['Discovered Dun Morogh', 'Открыта локация: Dun Morogh'],
    ['Discovered Тирисфальские леса', 'Открыта локация: Тирисфальские леса'],
    ['Fell in battle — Stonesplinter Trogg', 'Пал в бою — Stonesplinter Trogg'],
    ['Entered Deadmines', 'Вход в подземелье: Deadmines'],
    ['250 quests completed', 'Выполнено 250 заданий'],
    ['Learned profession: Алхимия', 'Изучена профессия: Алхимия'],
    ['Кузнечное дело reached skill 75', 'Кузнечное дело: навык повышен до 75'],
  ])('translates the parameterized system title "%s" keeping the name verbatim', (en, ru) => {
    expect(localizeMemory(memory({ type: 'zone', title: en }), 'ru').title).toBe(ru)
  })

  it.each([
    ['Fell in battle', 'Пал в бою'],
    ['Drowned', 'Утонул'],
    ['Died from a fall', 'Погиб при падении'],
    ['Succumbed to exhaustion', 'Погиб от истощения'],
    ['Perished in fire', 'Погиб в огне'],
    ['Perished in lava', 'Погиб в лаве'],
    ['Perished in slime', 'Погиб в слизи'],
    ['Lost to the environment', 'Погиб из-за окружения'],
    ['Unknown boss', 'Неизвестный босс'],
  ])('translates the exact system title "%s"', (en, ru) => {
    expect(localizeMemory(memory({ type: 'death', title: en }), 'ru').title).toBe(ru)
  })

  it.each([
    ['Final blow: Pyroblast.', 'Последний удар: Pyroblast.'],
    ['Final blow: Огненный шар.', 'Последний удар: Огненный шар.'],
  ])('translates the parameterized system description "%s"', (en, ru) => {
    expect(localizeMemory(memory({ type: 'death', description: en }), 'ru').description).toBe(ru)
  })

  it('does not touch partially custom titles', () => {
    const entry = memory({ type: 'level', title: 'Level 20: Guardian of the Grove' })
    expect(localizeMemory(entry, 'ru').title).toBe('Level 20: Guardian of the Grove')
  })

  it('keeps authored text of manual entries verbatim even when it looks like a template', () => {
    // the reviewer's case: a manual note whose title/description happen to be
    // exact system templates — authored text always wins
    const manual = memory({
      type: 'note',
      typeLabel: 'Journal Entry',
      source: 'manual',
      title: 'Level 20',
      description: 'Your journey continues.',
    })
    const view = localizeMemory(manual, 'ru')
    expect(view.title).toBe('Level 20')
    expect(view.description).toBe('Your journey continues.')
    // the addon's own type label is still UI text and is translated
    expect(view.typeLabel).toBe('Запись в дневнике')
  })

  it('detects manual entries by either type "note" or source "manual"', () => {
    const byType = memory({ type: 'note', source: 'note', title: 'Reached Level 5' })
    const bySource = memory({ type: 'story', source: 'manual', title: 'Discovered Dun Morogh' })
    expect(localizeMemory(byType, 'ru').title).toBe('Reached Level 5')
    expect(localizeMemory(bySource, 'ru').title).toBe('Discovered Dun Morogh')
  })

  it('keeps personal notes of automatic events verbatim', () => {
    const entry = memory({
      type: 'death',
      title: 'Fell in battle — Stonesplinter Trogg',
      personalNote: 'Обидно. revansch scheduled.',
    })
    const view = localizeMemory(entry, 'ru')
    expect(view.title).toBe('Пал в бою — Stonesplinter Trogg')
    expect(view.personalNote).toBe('Обидно. revansch scheduled.')
  })

  it('keeps custom descriptions verbatim in Russian', () => {
    const entry = memory({
      type: 'death',
      description: 'Aelirien was slain by Moonstalker Matriarch in Darkshore.',
    })
    expect(localizeMemory(entry, 'ru').description).toBe(entry.description)
  })

  it('keeps the personal note verbatim in both languages', () => {
    const entry = memory({ personalNote: 'Знаете что? Рыси здесь не дружелюбны.' })
    expect(localizeMemory(entry, 'ru').personalNote).toBe(entry.personalNote)
    expect(localizeMemory(entry, 'en').personalNote).toBe(entry.personalNote)
  })

  it('never mutates the imported memory', () => {
    const entry = memory({ typeLabel: 'Zone Discovered', title: 'Level 5' })
    const before = JSON.stringify(entry)
    localizeMemory(entry, 'ru')
    expect(JSON.stringify(entry)).toBe(before)
  })
})

describe('localizeMemory — manual memory detection (real addon markers)', () => {
  // the exact imported entry from the review: MANUAL_MEMORY / USER
  const importedManual = memory({
    type: 'MANUAL_MEMORY',
    source: 'USER',
    typeLabel: 'MEMORY',
    title: 'Reached Level 20',
    description: 'Your journey continues.',
    personalNote: '',
    favorite: false,
    location: 'Undercity',
  })

  it('keeps the manual title/description verbatim in RU and translates the type label', () => {
    const view = localizeMemory(importedManual, 'ru')
    expect(view.title).toBe('Reached Level 20')
    expect(view.description).toBe('Your journey continues.')
    expect(view.typeLabel).toBe('ВОСПОМИНАНИЕ') // rendered uppercase by the UI
    expect(view.location).toBe('Undercity')
  })

  it('keeps the manual entry verbatim in EN', () => {
    const view = localizeMemory(importedManual, 'en')
    expect(view.title).toBe('Reached Level 20')
    expect(view.description).toBe('Your journey continues.')
    expect(view.typeLabel).toBe('MEMORY')
  })

  it('never translates personalNote regardless of the event type', () => {
    const withNote = memory({
      type: 'DEATH',
      source: 'RECORDED',
      title: 'Fell in battle — Boss',
      personalNote: 'Личная заметка stays as typed.',
    })
    expect(localizeMemory(withNote, 'ru').personalNote).toBe('Личная заметка stays as typed.')
    expect(localizeMemory(importedManual, 'ru').personalNote).toBe('')
  })

  it('recognizes real and legacy manual markers case-insensitively', () => {
    const markers: Array<[string, string]> = [
      ['MANUAL_MEMORY', 'USER'],
      ['manual_memory', 'user'],
      ['NOTE', 'MANUAL'],
      ['note', 'manual'],
    ]
    for (const [type, source] of markers) {
      const entry = memory({
        type,
        source,
        title: 'Discovered Dun Morogh',
        description: 'Final blow: Pyroblast.',
      })
      const view = localizeMemory(entry, 'ru')
      expect(view.title).toBe('Discovered Dun Morogh')
      expect(view.description).toBe('Final blow: Pyroblast.')
    }
  })

  it('translates the same template on a recorded automatic event (LEVEL / RECORDED)', () => {
    const auto = memory({
      type: 'LEVEL',
      source: 'RECORDED',
      typeLabel: 'LEVEL',
      title: 'Reached Level 20',
      description: 'Reached level 20.',
    })
    const view = localizeMemory(auto, 'ru')
    expect(view.title).toBe('Уровень повышен до 20')
    expect(view.description).toBe('Достигнут уровень 20.')
    expect(view.typeLabel).toBe('УРОВЕНЬ')
  })

  it('keeps template-looking text of unknown-origin events original', () => {
    const unknown = memory({
      type: 'PET_BATTLE',
      source: 'widget',
      title: 'Reached Level 20',
      description: 'Your journey continues.',
    })
    const view = localizeMemory(unknown, 'ru')
    expect(view.title).toBe('Reached Level 20')
    expect(view.description).toBe('Your journey continues.')
  })
})

describe('localizeMemory — meta line', () => {
  it('formats the date per language and never translates the location', () => {
    expect(localizeMemory(memory(), 'ru').meta).toBe('14 июня 2026 г. · Darkshore')
    expect(localizeMemory(memory(), 'en').meta).toBe('June 14, 2026 · Darkshore')
  })

  it('drops missing parts and trims the location', () => {
    expect(
      localizeMemory(memory({ timestamp: undefined, location: '  Darkshore  ' }), 'ru').meta
    ).toBe('Darkshore')
    expect(
      localizeMemory(memory({ timestamp: Date.UTC(2026, 5, 14, 12, 0), location: '' }), 'ru').meta
    ).toBe('14 июня 2026 г.')
  })
})

describe('endSentence', () => {
  it('adds exactly one period', () => {
    expect(endSentence('The journey of X began on June 14, 2026')).toBe(
      'The journey of X began on June 14, 2026.'
    )
  })

  it('does not double the period after a Russian year («2026 г.»)', () => {
    expect(endSentence('Путешествие X началось 14 июня 2026 г.')).toBe(
      'Путешествие X началось 14 июня 2026 г.'
    )
  })

  it('keeps other sentence-ending punctuation and empty text', () => {
    expect(endSentence('The journey continues…')).toBe('The journey continues…')
    expect(endSentence('Victory!')).toBe('Victory!')
    expect(endSentence('   ')).toBe('   ')
  })
})

describe('introLeadText', () => {
  it('has no double period in the Russian introduction', () => {
    const text = introLeadText(strings.ru, 'Straider', '1 января 2026 г.')
    expect(text).toBe('Путешествие Straider началось 1 января 2026 г.')
    expect(text).not.toContain('..')
  })

  it('ends the English introduction with a single period', () => {
    const text = introLeadText(strings.en, 'Straider', 'January 1, 2026')
    expect(text).toBe('The journey of Straider began on January 1, 2026.')
    expect(text).not.toContain('..')
  })

  it('punctuates the unknown-date dash like a sentence', () => {
    expect(introLeadText(strings.ru, 'X', strings.ru.unknownDate)).toBe('Путешествие X началось —.')
    expect(introLeadText(strings.en, 'X', strings.en.unknownDate)).toBe('The journey of X began on —.')
  })
})
