// Presentation layer for journal memories, shared by the web preview
// (src/components/MemoryEntry.tsx) and the PDF book (src/pdf/BookDocument.tsx).
//
// When the reader picks Russian, system-generated event labels, template
// titles and template descriptions produced by the addon in English are
// shown through a curated dictionary. Everything the player wrote themselves
// (manual notes, custom titles, arbitrary text) and anything the dictionary
// does not know is kept verbatim — no machine translation, no external APIs.
// The imported data itself is never modified; localization is display-only.
import type { Lang, Strings } from '../i18n'
import { fmt } from '../i18n'
import type { JournalMemory } from './journal'
import { formatDate } from './format'

/** Addon-generated type labels (key: trimmed lowercase English label). */
const TYPE_LABELS_RU: Record<string, string> = {
  zone: 'Зона',
  'zone discovered': 'Зона открыта',
  death: 'Смерть',
  level: 'Уровень',
  'level up': 'Новый уровень',
  victory: 'Победа',
  instance: 'Подземелье',
  memory: 'Воспоминание',
  'quest milestone': 'Этап заданий',
  achievement: 'Достижение',
  'journal entry': 'Запись в дневнике',
}

/** Addon-generated descriptions, matched exactly (after trimming). */
const DESCRIPTIONS_RU: Record<string, string> = {
  'A new place became part of your journey.': 'Новое место стало частью твоего путешествия.',
  'Your journey continues.': 'Путешествие продолжается.',
  'The battle ended in victory.': 'Битва завершилась победой.',
  'Every journey has its setbacks.': 'На пути каждого героя случаются поражения.',
  'Reached the level cap.': 'Достигнут максимальный уровень.',
}

/** Addon-generated titles with a number parameter, e.g. "Level 20". */
const TITLE_PATTERNS_RU: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Level (\d+)$/, (m) => `Уровень ${m[1]}`],
]

/** Addon-generated descriptions with a number parameter, e.g. "Reached level 20." */
const DESCRIPTION_PATTERNS_RU: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Reached level (\d+)\.$/, (m) => `Достигнут уровень ${m[1]}.`],
]

function translateTypeLabel(label: string, lang: Lang): string {
  if (lang !== 'ru') return label
  return TYPE_LABELS_RU[label.trim().toLowerCase()] ?? label
}

function translateTitle(title: string, lang: Lang): string {
  if (lang !== 'ru') return title
  const trimmed = title.trim()
  for (const [pattern, translate] of TITLE_PATTERNS_RU) {
    const match = trimmed.match(pattern)
    if (match) return translate(match)
  }
  return title
}

function translateDescription(description: string, lang: Lang): string {
  if (lang !== 'ru') return description
  const trimmed = description.trim()
  if (DESCRIPTIONS_RU[trimmed]) return DESCRIPTIONS_RU[trimmed]
  for (const [pattern, translate] of DESCRIPTION_PATTERNS_RU) {
    const match = trimmed.match(pattern)
    if (match) return translate(match)
  }
  return description
}

/** A memory as shown to the reader: system text localized, player text verbatim. */
export interface LocalizedMemory {
  typeLabel: string
  title: string
  description: string
  personalNote: string
  location: string
  /** Composed "date · location" line; the location is never translated. */
  meta: string
}

export function localizeMemory(memory: JournalMemory, lang: Lang): LocalizedMemory {
  return {
    typeLabel: translateTypeLabel(memory.typeLabel, lang),
    title: translateTitle(memory.title, lang),
    description: translateDescription(memory.description, lang),
    personalNote: memory.personalNote,
    location: memory.location,
    meta: [formatDate(memory.timestamp, lang), memory.location.trim()]
      .filter(Boolean)
      .join(' · '),
  }
}

/**
 * Appends a sentence period unless the text already ends with one. Russian
 * dates formatted by Intl end with «г.», so a template ending in "{date}."
 * would produce «2026 г..» — sentence punctuation is therefore added here,
 * once, for both languages.
 */
export function endSentence(text: string): string {
  const trimmed = text.replace(/\s+$/, '')
  if (trimmed === '') return text
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

/** Introduction lead sentence, shared by the web and PDF introductions. */
export function introLeadText(tr: Strings, name: string, date: string): string {
  return endSentence(fmt(tr.introLead, { name, date }))
}
