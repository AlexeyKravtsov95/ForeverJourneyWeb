import type { Lang } from '../i18n'
import { MAX_DATE_MS, MIN_DATE_MS } from './journal'

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
