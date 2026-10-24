// Presentation layer for the Character Archive (FJ-WEB-06), shared by the web
// preview (src/components/ArchiveSection.tsx) and the PDF book
// (src/pdf/BookDocument.tsx) so the two can never drift apart.
//
// The view is built from the validated journal model only: every unknown
// value stays hidden, saved counters are never mixed with chronicle event
// counts, and the snapshot is always labeled as historical. Zone names,
// profession names and numbers are shown exactly as the addon saved them.
import type { Journal } from './journal'
import { formatDate, formatPlayed } from './format'
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

export interface ArchiveView {
  title: string
  snapshot: {
    title: string
    /** The explicit "may not be the final state" disclaimer. */
    note: string
    stats: ArchiveStatView[]
  } | null
  professions: {
    title: string
    items: ArchiveProfessionView[]
  } | null
  zones: {
    title: string
    items: ArchiveZoneView[]
  } | null
  savedStats: {
    title: string
    stats: ArchiveStatView[]
  } | null
}

/**
 * Builds the archive view for a journal, or null when there is nothing to
 * show (FJBOOK1 imports and SavedVariables files without archive data render
 * no section at all). Zones are sorted chronologically with an explicit ru
 * collation tiebreak so the order is deterministic on every runner.
 */
export function buildArchiveView(journal: Journal, tr: Strings, lang: Lang): ArchiveView | null {
  const archive = journal.archive
  if (!archive) return null

  const recovered = archive.recovered
  const snapshotStats: ArchiveStatView[] = []
  if (recovered?.level !== undefined) {
    snapshotStats.push({ label: tr.statLevel, value: String(recovered.level) })
  }
  if (recovered?.completedQuests !== undefined) {
    snapshotStats.push({ label: tr.statQuests, value: String(recovered.completedQuests) })
  }
  if (recovered?.playedTotal !== undefined) {
    snapshotStats.push({ label: tr.statPlayed, value: formatPlayed(recovered.playedTotal, lang) })
  }
  if (recovered?.capturedAt !== undefined) {
    snapshotStats.push({
      label: tr.archiveSnapshotDate,
      value: formatDate(recovered.capturedAt, lang),
    })
  }

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

  // The saved death counter is the addon's own stats.deaths — it is shown only
  // when the file actually declared it, never the event-count fallback.
  const savedStats: ArchiveStatView[] = []
  if (archive.deathsCounter !== undefined) {
    savedStats.push({ label: tr.archiveStatDeathsSaved, value: String(archive.deathsCounter) })
  }
  savedStats.push({ label: tr.archiveStatMemories, value: String(journal.memories.length) })

  return {
    title: tr.archiveTitle,
    snapshot:
      snapshotStats.length > 0
        ? { title: tr.archiveSnapshotTitle, note: tr.archiveSnapshotNote, stats: snapshotStats }
        : null,
    professions:
      professions.length > 0 ? { title: tr.archiveProfessionsTitle, items: professions } : null,
    zones: zones.length > 0 ? { title: tr.archiveZonesTitle, items: zones } : null,
    savedStats:
      savedStats.length > 0 ? { title: tr.archiveSavedStatsTitle, stats: savedStats } : null,
  }
}
