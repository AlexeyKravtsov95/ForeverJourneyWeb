import type { JournalMemory } from './journal'
import { monthKey, monthLabel } from './format'
import type { Lang } from '../i18n'

export interface Chapter {
  key: string
  label: string
  memories: JournalMemory[]
}

/**
 * Groups memories into chronological month chapters, exactly as the web book
 * renders them: sorted by timestamp (undated last), then grouped by month.
 */
export function buildChapters(
  memories: JournalMemory[],
  lang: Lang,
  undatedLabel: string
): Chapter[] {
  const sorted = [...memories].sort((a, b) => {
    const at = a.timestamp ?? Number.POSITIVE_INFINITY
    const bt = b.timestamp ?? Number.POSITIVE_INFINITY
    if (at !== bt) return at - bt
    return (a.title || a.typeLabel || '').localeCompare(b.title || b.typeLabel || '')
  })
  const groups = new Map<string, JournalMemory[]>()
  for (const memory of sorted) {
    const key = memory.timestamp === undefined ? 'undated' : monthKey(memory.timestamp)
    const list = groups.get(key)
    if (list) list.push(memory)
    else groups.set(key, [memory])
  }
  return [...groups.entries()].map(([key, chapterMemories]) => {
    const firstDated = chapterMemories.find((memory) => memory.timestamp !== undefined)
    return {
      key,
      label: firstDated
        ? monthLabel(firstDated.timestamp as number, lang)
        : undatedLabel,
      memories: chapterMemories,
    }
  })
}
