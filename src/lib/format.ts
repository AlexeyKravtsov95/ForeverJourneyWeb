import type { Lang } from '../i18n'
import { MAX_DATE_MS, MIN_DATE_MS, type Journal } from './journal'

const locales: Record<Lang, string> = { en: 'en-US', ru: 'ru-RU' }

function isValidDateMs(ms: number): boolean {
  return Number.isFinite(ms) && ms >= MIN_DATE_MS && ms <= MAX_DATE_MS
}

export function formatDate(ms: number | undefined, lang: Lang): string {
  if (!ms || !isValidDateMs(ms)) return ''
  return new Intl.DateTimeFormat(locales[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ms)
}

export function monthKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(ms: number, lang: Lang): string {
  if (!isValidDateMs(ms)) return ''
  return new Intl.DateTimeFormat(locales[lang], { month: 'long', year: 'numeric' }).format(ms)
}

/** Same calendar day in the runtime's own timezone — the day formatDate shows. */
function sameCalendarDay(a: number, b: number): boolean {
  const first = new Date(a)
  const second = new Date(b)
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

/**
 * Formats a start/end pair for the cover. Two timestamps inside one calendar
 * day render as that single day ("10 октября 2026 г." never repeats twice);
 * different days render as a range. Missing or invalid values are treated as
 * absent — an invalid date never surfaces as another locale's day.
 */
export function formatDateRange(
  start: number | undefined,
  end: number | undefined,
  lang: Lang
): string {
  const valid = (ms: number | undefined) => (ms !== undefined && isValidDateMs(ms) ? ms : undefined)
  const from = valid(start)
  const to = valid(end)
  if (from === undefined && to === undefined) return ''
  if (from === undefined) return formatDate(to as number, lang)
  if (to === undefined) return formatDate(from, lang)
  if (sameCalendarDay(from, to)) return formatDate(from, lang)
  return `${formatDate(from, lang)} — ${formatDate(to, lang)}`
}

/**
 * The cover date range shared by the web preview and the PDF: the journey
 * start (or the first memory) through the last memory (or the export time).
 */
export function coverDateRange(journal: Journal, lang: Lang): string {
  const times = journal.memories
    .map((memory) => memory.timestamp)
    .filter((value): value is number => typeof value === 'number')
  const firstMemory = times.length ? Math.min(...times) : undefined
  const lastMemory = times.length ? Math.max(...times) : undefined
  const start = journal.journey.startedAt ?? firstMemory
  const end = lastMemory ?? journal.exportedAt
  return formatDateRange(start, end, lang)
}

const playedUnits: Record<Lang, [string, string, string]> = {
  en: ['d', 'h', 'm'],
  ru: [' д', ' ч', ' мин'],
}

export function formatPlayed(totalSeconds: number, lang: Lang): string {
  const [d, h, m] = playedUnits[lang]
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return `0${m}`
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const parts: string[] = []
  if (days) parts.push(`${days}${d}`)
  if (hours) parts.push(`${hours}${h}`)
  if (minutes || parts.length === 0) parts.push(`${minutes}${m}`)
  return parts.slice(0, 2).join(' ')
}

const playedExactUnits: Record<Lang, [string, string, string, string]> = {
  en: ['d', 'h', 'm', 's'],
  ru: [' д', ' ч', ' мин', ' с'],
}

/**
 * Full play-time format with second precision for the historical snapshot:
 * every non-zero unit from days down to seconds, nothing rounded away
 * (183754 s → "2d 3h 2m 34s" / "2 д 3 ч 2 мин 34 с"). A valid zero renders
 * as zero; an invalid value (NaN, negative…) renders as "" so the caller can
 * hide it instead of dressing it up as a trustworthy 0.
 */
export function formatPlayedExact(totalSeconds: number, lang: Lang): string {
  const [d, h, m, s] = playedExactUnits[lang]
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return ''
  }
  const total = Math.floor(totalSeconds)
  if (total === 0) return `0${s}`
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const parts: string[] = []
  if (days) parts.push(`${days}${d}`)
  if (hours) parts.push(`${hours}${h}`)
  if (minutes) parts.push(`${minutes}${m}`)
  if (seconds || parts.length === 0) parts.push(`${seconds}${s}`)
  return parts.join(' ')
}

export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value > 3999) return String(value)
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ]
  let rest = value
  let out = ''
  for (const [num, symbol] of table) {
    while (rest >= num) {
      out += symbol
      rest -= num
    }
  }
  return out
}
