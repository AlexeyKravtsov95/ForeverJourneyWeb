import type { JournalChapter, JournalMemory } from './journal'
import { monthKey, monthLabel } from './format'
import type { Lang } from '../i18n'

export interface Chapter {
  key: string
  label: string
  /** Author chapter description (FJ-WEB-03) — shown under the title when non-empty. */
  description?: string
  memories: JournalMemory[]
}

/**
 * Groups memories into chronological month chapters, exactly as the web book
 * renders them. The input must already be chronologically sorted with a
 * stable tiebreak: memories with equal timestamps keep the order the import
 * established — for SavedVariables that is the file order, for FJBOOK1 the
 * export order — instead of being re-shuffled by a secondary key.
 */
function buildMonthChapters(
  memories: JournalMemory[],
  lang: Lang,
  undatedLabel: string
): Chapter[] {
  const groups = new Map<string, JournalMemory[]>()
  for (const memory of memories) {
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

/** Chronological order with the import order as the tiebreak (stable for equal timestamps); input not mutated. */
function sortChronologically(memories: JournalMemory[]): JournalMemory[] {
  return memories
    .map((memory, index) => ({ memory, index }))
    .sort((a, b) => {
      const at = a.memory.timestamp ?? Number.POSITIVE_INFINITY
      const bt = b.memory.timestamp ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
      return a.index - b.index
    })
    .map((entry) => entry.memory)
}

/**
 * Builds the book's chapter sections (FJ-WEB-03).
 *
 * Without author chapters the grouping stays exactly the month grouping the
 * book always had. With author chapters:
 * - a memory's `chapterId` binding wins (the player's partition is the truth,
 *   even when a timestamp falls outside the chapter's interval);
 * - memories without a binding (or with a dangling one) are NOT lost — they
 *   keep the chronological month sections;
 * - sections merge into one sequence by their start time (a chapter by its
 *   startedAt, a month section by its first dated memory), undated last; on a
 *   tie the author chapter comes first — it opens the period.
 *
 * Chapters without memories produce no section, the input arrays are never
 * mutated, and an empty journal returns no chapters at all.
 */
export function buildChapters(
  memories: JournalMemory[],
  lang: Lang,
  undatedLabel: string,
  authorChapters: JournalChapter[] = []
): Chapter[] {
  const sorted = sortChronologically(memories)

  if (authorChapters.length === 0) {
    return buildMonthChapters(sorted, lang, undatedLabel)
  }

  // first occurrence of an id wins (validation already dedupes; direct calls stay deterministic too)
  const bound = new Map<string, { chapter: JournalChapter; memories: JournalMemory[] }>()
  for (const chapter of authorChapters) {
    if (!bound.has(chapter.id)) bound.set(chapter.id, { chapter, memories: [] })
  }
  const unchaptered: JournalMemory[] = []
  for (const memory of sorted) {
    const target = memory.chapterId !== undefined ? bound.get(memory.chapterId) : undefined
    if (target) target.memories.push(memory)
    else unchaptered.push(memory)
  }

  type Section = Chapter & { startAt: number; rank: number }
  const sections: Section[] = []

  for (const { chapter, memories } of bound.values()) {
    // no memories → no section (the book shows no empty chapters)
    if (memories.length === 0) continue
    sections.push({
      key: `chapter:${chapter.id}`,
      label: chapter.title,
      ...(chapter.description !== '' ? { description: chapter.description } : {}),
      memories,
      startAt: chapter.startedAt,
      rank: 0,
    })
  }

  for (const section of buildMonthChapters(unchaptered, lang, undatedLabel)) {
    const firstDated = section.memories.find((memory) => memory.timestamp !== undefined)
    sections.push({
      ...section,
      startAt: firstDated?.timestamp ?? Number.POSITIVE_INFINITY,
      rank: 1,
    })
  }

  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) =>
      a.section.startAt !== b.section.startAt
        ? a.section.startAt - b.section.startAt
        : a.section.rank !== b.section.rank
          ? a.section.rank - b.section.rank
          : a.index - b.index
    )
    .map((entry) => entry.section)
}
