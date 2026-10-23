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
  'profession milestone': 'Этап профессии',
  'reputation milestone': 'Этап репутации',
  'journal entry': 'Запись в дневнике',
}

/** Addon-generated descriptions, matched exactly (after trimming). */
const DESCRIPTIONS_RU: Record<string, string> = {
  'A new place became part of your journey.': 'Новое место стало частью твоего путешествия.',
  'Your journey continues.': 'Путешествие продолжается.',
  'The battle ended in victory.': 'Битва завершилась победой.',
  'Every journey has its setbacks.': 'На пути каждого героя случаются поражения.',
  'Reached the level cap.': 'Достигнут максимальный уровень.',
  'Another chapter of your journey lies within.': 'Впереди новая глава твоего путешествия.',
  'Another important questing milestone has been reached.':
    'Достигнут ещё один важный этап выполнения заданий.',
  'A new profession became part of the journey.': 'Новая профессия стала частью путешествия.',
  'A new profession milestone has been reached.': 'Достигнут новый этап профессии.',
}

/**
 * Addon-generated titles without a parameter, matched exactly: the
 * environmental death titles (Memories.lua ENVIRONMENT_TITLE_KEYS), the
 * generic "Fell in battle" fallback and the boss "Unknown boss" fallback
 * (BossVictoryMilestones.lua).
 */
const EXACT_TITLES_RU: Record<string, string> = {
  'Fell in battle': 'Пал в бою',
  Drowned: 'Утонул',
  'Fell from a great height': 'Упал с большой высоты',
  'Succumbed to fatigue': 'Изнемог от усталости',
  'Burned to death': 'Сгорел заживо',
  'Consumed by lava': 'Погиб в лаве',
  'Dissolved in slime': 'Растворился в слизи',
  'Unknown boss': 'Неизвестный босс',
}

/**
 * Addon-generated titles with a parameter (zone/enemy/instance name, level or
 * quest count). The captured parameter is player-facing world text (names of
 * zones, NPCs, instances, spells) and is always preserved verbatim — only the
 * template around it is translated.
 */
const TITLE_PATTERNS_RU: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Discovered (.+)$/, (m) => `Открыта зона: ${m[1]}`],
  [/^Fell in battle — (.+)$/, (m) => `Пал в бою — ${m[1]}`],
  // masculine ordinal is «-й» for every integer: 1-й, 3-й, 11-й, 21-й, 100-й
  [/^Reached Level (\d+)$/, (m) => `Достигнут ${m[1]}-й уровень`],
  [/^Entered (.+)$/, (m) => `Вход в подземелье: ${m[1]}`],
  [/^(\d+) quests completed$/, (m) => `Выполнено заданий: ${m[1]}`],
  [/^Level (\d+)$/, (m) => `Уровень ${m[1]}`],
  // ProfessionMilestones.lua templates
  [/^Learned profession: (.+)$/, (m) => `Изучена профессия: ${m[1]}`],
  [/^(.+) reached skill (\d+)$/, (m) => `${m[1]}: навык ${m[2]}`],
]

/** Addon-generated descriptions with a parameter, e.g. "Final blow: Pyroblast." */
const DESCRIPTION_PATTERNS_RU: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
  [/^Reached level (\d+)\.$/, (m) => `Достигнут уровень ${m[1]}.`],
  [/^Final blow: (.+)\.$/, (m) => `Последний удар: ${m[1]}.`],
]

function translateTypeLabel(label: string, lang: Lang): string {
  if (lang !== 'ru') return label
  return TYPE_LABELS_RU[label.trim().toLowerCase()] ?? label
}

/**
 * Manual (player-written) entries: their titles and descriptions are authored
 * text and are never translated, whatever they contain. The real addon marks
 * them type "MANUAL_MEMORY" / source "USER" (MemoryActions.lua, ViewModel.lua,
 * JournalExport.lua); older exports and site fixtures used type "note" /
 * source "manual". Compared case-insensitively.
 */
const MANUAL_TYPES = new Set(['note', 'manual_memory'])
const MANUAL_SOURCES = new Set(['manual', 'user'])

function isManualEntry(memory: JournalMemory): boolean {
  return (
    MANUAL_TYPES.has(memory.type.trim().toLowerCase()) ||
    MANUAL_SOURCES.has(memory.source.trim().toLowerCase())
  )
}

/**
 * Confirmed system events (addon-recorded): only these get template
 * translation. The real exporter writes source "RECORDED" and uppercase
 * types; older fixtures used lowercase types with per-type sources. Anything
 * else — unknown origin — keeps its original text even when it happens to
 * match a template.
 */
const SYSTEM_TYPES = new Set([
  'zone',
  'zone_discovered',
  'zone_discovery',
  'death',
  'level',
  'level_up',
  'victory',
  'boss_victory',
  'instance',
  'instance_entered',
  'memory',
  'quest',
  'quest_milestone',
  'achievement',
  'profession_milestone',
  'reputation_milestone',
])
const SYSTEM_SOURCES = new Set([
  'zone',
  'death',
  'level',
  'victory',
  'instance',
  'memory',
  'quest',
  'achievement',
  'boss',
  'milestone',
  'recorded',
])

function isSystemEntry(memory: JournalMemory): boolean {
  return (
    !isManualEntry(memory) &&
    (SYSTEM_TYPES.has(memory.type.trim().toLowerCase()) ||
      SYSTEM_SOURCES.has(memory.source.trim().toLowerCase()))
  )
}

function translateTitle(title: string, memory: JournalMemory, lang: Lang): string {
  if (lang !== 'ru' || !isSystemEntry(memory)) return title
  const trimmed = title.trim()
  if (EXACT_TITLES_RU[trimmed]) return EXACT_TITLES_RU[trimmed]
  for (const [pattern, translate] of TITLE_PATTERNS_RU) {
    const match = trimmed.match(pattern)
    if (match) return translate(match)
  }
  return title
}

function translateDescription(description: string, memory: JournalMemory, lang: Lang): string {
  if (lang !== 'ru' || !isSystemEntry(memory)) return description
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
    title: translateTitle(memory.title, memory, lang),
    description: translateDescription(memory.description, memory, lang),
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
