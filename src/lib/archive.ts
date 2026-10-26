// Presentation layer for the Character Archive (FJ-WEB-06), shared by the web
// preview (src/components/ArchiveSection.tsx) and the PDF book
// (src/pdf/BookDocument.tsx) so the two can never drift apart.
//
// The view is built from the validated journal model only: every unknown
// value stays hidden, saved counters are never mixed with chronicle event
// counts, and the snapshot is always labeled as historical. Zone names,
// profession names and numbers are shown exactly as the addon saved them.
//
// FJ-WEB-07 adds the Economy section (saved money figures in game
// denominations — no derived "lifetime profit" is ever computed) and the Quest
// Registry (the saved counter and the saved quest IDs as two separate values;
// quest names are not in the file and are never invented).
import type { Journal } from './journal'
import { formatDate, formatMoney, formatPlayedExact } from './format'
import type { Lang, Strings } from '../i18n'

export interface ArchiveStatView {
  label: string
  value: string
}

export interface ArchiveProfessionView {
  name: string
  /** "94 / 150" when both numbers are known, "94" for the skill alone, "" when unknown. */
  skill: string
  /** Present only when a valid maximum is saved — drives the progress bar. */
  progress?: number
}

export interface ArchiveZoneView {
  name: string
  /** Formatted first-visit date; empty when the file saved no time. */
  firstSeen: string
}

/** Economy figures — each row appears only when its source value is known. */
export interface ArchiveEconomyView {
  title: string
  /** The "saved by the addon, may not be final" disclaimer. */
  note: string
  rows: ArchiveStatView[]
}

/**
 * Quest Registry summary. `counter` and `savedIds` are two independent saved
 * values (they may legitimately differ — both are shown, never reconciled).
 * `ids` carries the validated IDs for the web-only collapsible list and the
 * CSV download; the PDF renders the summary alone.
 */
export interface ArchiveQuestsView {
  title: string
  /** Why the list shows bare numbers: names are not part of the file. */
  note: string
  counter: ArchiveStatView | null
  savedIds: ArchiveStatView | null
  /** Set only when both values exist and differ — a neutral explanation. */
  mismatchNote: string | null
  /** Label of the web collapsible ("Saved quest IDs (209)"). */
  idsToggle: string
  /** Label of the web CSV download button. */
  csvLabel: string
  ids: number[]
}

export interface ArchiveView {
  title: string
  snapshot: {
    title: string
    /** The explicit "may not be the final state" disclaimer. */
    note: string
    stats: ArchiveStatView[]
  } | null
  economy: ArchiveEconomyView | null
  quests: ArchiveQuestsView | null
  professions: {
    title: string
    items: ArchiveProfessionView[]
  } | null
  zones: {
    title: string
    items: ArchiveZoneView[]
  } | null
  /**
   * One-line provenance note for the death total shown in the introduction:
   * present only when the file declared its own counter (the chronicle's
   * DEATH events are a subset of it, never the source of the number).
   */
  counterNote: string | null
}

/**
 * The quest-registry CSV: one `quest_id` column, one row per saved valid ID,
 * nothing else — no invented quest names, no other characters' data. Built
 * locally in the browser; downloading it never leaves the machine.
 */
export function buildQuestRegistryCsv(ids: readonly number[]): string {
  return ['quest_id', ...ids.map(String)].join('\n') + '\n'
}

/**
 * Builds the archive view for a journal, or null when there is nothing to
 * show (FJBOOK1 imports and SavedVariables files without archive data render
 * no section at all). Zones are sorted chronologically with an explicit ru
 * collation tiebreak so the order is deterministic on every runner. The
 * overall deaths/memories counters are deliberately not repeated here — the
 * introduction already shows them; only their provenance is explained.
 */
export function buildArchiveView(journal: Journal, tr: Strings, lang: Lang): ArchiveView | null {
  const archive = journal.archive
  if (!archive) return null

  const recovered = archive.recovered
  const snapshotStats: ArchiveStatView[] = []
  if (recovered?.level !== undefined) {
    snapshotStats.push({ label: tr.statLevel, value: String(recovered.level) })
  }
  // The quest counter moved to the Quest Registry (FJ-WEB-07): showing the
  // same saved number twice — as a snapshot tile and as the registry summary —
  // would duplicate statistics for no reason.
  if (recovered?.playedTotal !== undefined) {
    // exact to the second — this is a historical value, not a live stat to skim
    const played = formatPlayedExact(recovered.playedTotal, lang)
    if (played) snapshotStats.push({ label: tr.statPlayed, value: played })
  }
  if (recovered?.playedCurrentLevel !== undefined) {
    // a distinct figure: time played at the recorded level, not the total and
    // not the level itself
    const atLevel = formatPlayedExact(recovered.playedCurrentLevel, lang)
    if (atLevel) snapshotStats.push({ label: tr.archivePlayedAtLevel, value: atLevel })
  }
  if (recovered?.capturedAt !== undefined) {
    snapshotStats.push({
      label: tr.archiveSnapshotDate,
      value: formatDate(recovered.capturedAt, lang),
    })
  }

  // Economy rows follow the task's table order; the snapshot balance comes
  // from the (initialized) historical snapshot, the other three from the
  // addon's tracked money — independent sources, never merged into one figure.
  const economyRows: ArchiveStatView[] = []
  if (recovered?.moneyBalance !== undefined) {
    const formatted = formatMoney(recovered.moneyBalance)
    if (formatted) economyRows.push({ label: tr.archiveEconomySnapshotBalance, value: formatted })
  }
  if (archive.money?.current !== undefined) {
    const formatted = formatMoney(archive.money.current)
    if (formatted) economyRows.push({ label: tr.archiveEconomyLastBalance, value: formatted })
  }
  if (archive.money?.earned !== undefined) {
    const formatted = formatMoney(archive.money.earned)
    if (formatted) economyRows.push({ label: tr.archiveEconomyGains, value: formatted })
  }
  if (archive.money?.spent !== undefined) {
    const formatted = formatMoney(archive.money.spent)
    if (formatted) economyRows.push({ label: tr.archiveEconomySpending, value: formatted })
  }

  // Quest Registry exists when either saved value exists; the two numbers are
  // shown side by side exactly as recorded, with a neutral note when they
  // disagree (182 vs 209 in the real Straider file).
  const savedIds = recovered?.questIDs
  const counter =
    recovered?.completedQuests !== undefined
      ? { label: tr.archiveQuestCounter, value: String(recovered.completedQuests) }
      : null
  const idCount =
    savedIds !== undefined && savedIds.length > 0
      ? { label: tr.archiveQuestIdsCount, value: String(savedIds.length) }
      : null
  const mismatch =
    counter !== null && idCount !== null && counter.value !== idCount.value
      ? tr.archiveQuestMismatchNote
      : null

  const professions: ArchiveProfessionView[] = archive.professions.map((profession) => {
    const skill =
      profession.skillLevel !== undefined && profession.maxSkillLevel !== undefined
        ? `${profession.skillLevel} / ${profession.maxSkillLevel}`
        : profession.skillLevel !== undefined
          ? String(profession.skillLevel)
          : ''
    const max = profession.maxSkillLevel
    const progress =
      max !== undefined && max > 0 && profession.skillLevel !== undefined
        ? Math.max(0, Math.min(100, Math.round((profession.skillLevel / max) * 100)))
        : undefined
    return {
      name: profession.name,
      skill,
      ...(progress !== undefined ? { progress } : {}),
    }
  })

  const zones: ArchiveZoneView[] = archive.zones
    .map((zone, index) => ({ zone, index }))
    .sort((a, b) => {
      const at = a.zone.firstSeenAt ?? Number.POSITIVE_INFINITY
      const bt = b.zone.firstSeenAt ?? Number.POSITIVE_INFINITY
      if (at !== bt) return at - bt
      const byName = a.zone.name.localeCompare(b.zone.name, 'ru')
      if (byName !== 0) return byName
      return a.index - b.index
    })
    .map(({ zone }) => ({
      name: zone.name,
      firstSeen: zone.firstSeenAt !== undefined ? formatDate(zone.firstSeenAt, lang) : '',
    }))

  // A declared counter alone is not archive content — it belongs to the
  // introduction; without snapshot, professions or zones there is no page.
  if (
    snapshotStats.length === 0 &&
    economyRows.length === 0 &&
    counter === null &&
    idCount === null &&
    professions.length === 0 &&
    zones.length === 0
  ) {
    return null
  }

  return {
    title: tr.archiveTitle,
    snapshot:
      snapshotStats.length > 0
        ? { title: tr.archiveSnapshotTitle, note: tr.archiveSnapshotNote, stats: snapshotStats }
        : null,
    economy:
      economyRows.length > 0
        ? { title: tr.archiveEconomyTitle, note: tr.archiveEconomyNote, rows: economyRows }
        : null,
    quests:
      counter !== null || idCount !== null
        ? {
            title: tr.archiveQuestsTitle,
            note: tr.archiveQuestsNote,
            counter,
            savedIds: idCount,
            mismatchNote: mismatch,
            idsToggle:
              idCount !== null
                ? `${tr.archiveQuestsShowIds} (${idCount.value})`
                : tr.archiveQuestsShowIds,
            csvLabel: tr.archiveQuestsCsv,
            ids: savedIds ?? [],
          }
        : null,
    professions:
      professions.length > 0 ? { title: tr.archiveProfessionsTitle, items: professions } : null,
    zones: zones.length > 0 ? { title: tr.archiveZonesTitle, items: zones } : null,
    // shown only when the addon's own death counter exists in the file, so the
    // reader can tell it apart from the (smaller) number of DEATH memories
    counterNote:
      archive.deathsCounter !== undefined ? tr.archiveDeathsSourceNote : null,
  }
}
