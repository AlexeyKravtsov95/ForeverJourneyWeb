import { buildArchiveView, buildQuestRegistryCsv } from '../lib/archive'
import type { Journal } from '../lib/journal'
import type { Lang, Strings } from '../i18n'
import { sanitizeCharacterName } from '../pdf/filename'
import { Divider } from './Ornaments'

interface Props {
  journal: Journal
  tr: Strings
  lang: Lang
}

/** Saves the quest registry as a local CSV — a Blob download, no network. */
function downloadQuestRegistryCsv(ids: readonly number[], characterName: string) {
  const blob = new Blob([buildQuestRegistryCsv(ids)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    const safe = sanitizeCharacterName(characterName)
    anchor.download = safe ? `QuestRegistry_${safe}.csv` : 'QuestRegistry.csv'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}

/**
 * Character Archive (FJ-WEB-06 + FJ-WEB-07): the SavedVariables-only section
 * between the introduction and the chapters. Everything shown comes from the
 * shared view model (src/lib/archive.ts) — the same data the PDF renders.
 * Journals without archive data (FJBOOK1) render nothing here.
 */
export default function ArchiveSection({ journal, tr, lang }: Props) {
  const view = buildArchiveView(journal, tr, lang)
  if (!view) return null

  return (
    <section className="sheet sheet--archive" aria-label={view.title}>
      <header className="chapter-head">
        <Divider />
        <h2 className="chapter-head__title">{view.title}</h2>
        <Divider />
      </header>

      {view.snapshot && (
        <section className="archive__block" aria-label={view.snapshot.title}>
          <h3 className="archive__subtitle">{view.snapshot.title}</h3>
          <div className="stats">
            {view.snapshot.stats.map((stat) => (
              <div className="stat" key={stat.label}>
                <span className="stat__value">{stat.value}</span>
                <span className="stat__label">{stat.label}</span>
              </div>
            ))}
          </div>
          <p className="archive__note">{view.snapshot.note}</p>
        </section>
      )}

      {view.economy && (
        <section className="archive__block" aria-label={view.economy.title}>
          <h3 className="archive__subtitle">{view.economy.title}</h3>
          <div className="stats">
            {view.economy.rows.map((row) => (
              <div className="stat" key={row.label}>
                <span className="stat__value">{row.value}</span>
                <span className="stat__label">{row.label}</span>
              </div>
            ))}
          </div>
          <p className="archive__note">{view.economy.note}</p>
        </section>
      )}

      {view.quests && (
        <section className="archive__block" aria-label={view.quests.title}>
          <h3 className="archive__subtitle">{view.quests.title}</h3>
          <div className="stats">
            {view.quests.counter && (
              <div className="stat">
                <span className="stat__value">{view.quests.counter.value}</span>
                <span className="stat__label">{view.quests.counter.label}</span>
              </div>
            )}
            {view.quests.savedIds && (
              <div className="stat">
                <span className="stat__value">{view.quests.savedIds.value}</span>
                <span className="stat__label">{view.quests.savedIds.label}</span>
              </div>
            )}
          </div>
          <p className="archive__note">{view.quests.note}</p>
          {view.quests.mismatchNote && (
            <p className="archive__note archive__note--mismatch">{view.quests.mismatchNote}</p>
          )}
          {view.quests.ids.length > 0 && (
            <details className="quests__details">
              <summary className="quests__summary">{view.quests.idsToggle}</summary>
              <ul className="quests__ids" aria-label={view.quests.idsToggle}>
                {view.quests.ids.map((id) => (
                  <li className="quests__id" key={id}>
                    {id}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {view.quests.ids.length > 0 && (
            <button
              type="button"
              className="quests__csv"
              onClick={() => downloadQuestRegistryCsv(view.quests?.ids ?? [], journal.character.name)}
            >
              ⬇ {view.quests.csvLabel}
            </button>
          )}
        </section>
      )}

      {view.professions && (
        <section className="archive__block" aria-label={view.professions.title}>
          <h3 className="archive__subtitle">{view.professions.title}</h3>
          <ul className="professions">
            {view.professions.items.map((profession, index) => (
              <li className="profession" key={`${profession.name}-${index}`}>
                <p className="profession__head">
                  <span className="profession__name">{profession.name}</span>
                  {profession.skill && (
                    <span className="profession__skill">{profession.skill}</span>
                  )}
                </p>
                {profession.progress !== undefined && (
                  <div
                    className="profession__bar"
                    role="presentation"
                    aria-hidden="true"
                    title={`${profession.progress}%`}
                  >
                    <span
                      className="profession__bar-fill"
                      style={{ width: `${profession.progress}%` }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.zones && (
        <section className="archive__block" aria-label={view.zones.title}>
          <h3 className="archive__subtitle">{view.zones.title}</h3>
          <ul className="zones">
            {view.zones.items.map((zone, index) => (
              <li className="zone" key={`${zone.name}-${index}`}>
                <span className="zone__name">{zone.name}</span>
                {zone.firstSeen && <span className="zone__date">{zone.firstSeen}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.counterNote && <p className="archive__counter-note">{view.counterNote}</p>}
    </section>
  )
}
