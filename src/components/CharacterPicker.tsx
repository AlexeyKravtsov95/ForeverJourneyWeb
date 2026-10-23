import { useState } from 'react'
import type { Journal } from '../lib/journal'
import { buildJournalFromSavedVariables, type SavedVariablesOk } from '../lib/savedvariables'
import { formatDate } from '../lib/format'
import { fmt, type Lang, type Strings } from '../i18n'
import { Divider } from './Ornaments'
import type { ImportSummary } from './Book'

interface Props {
  tr: Strings
  lang: Lang
  sv: SavedVariablesOk
  fileName: string
  onLangChange: (lang: Lang) => void
  onPick: (journal: Journal, meta: ImportSummary) => void
  onCancel: () => void
}

/**
 * Second step of the SavedVariables import: the file may hold many characters,
 * and their journals are never merged — the player picks exactly one and its
 * book is bound through the regular Book view.
 */
export default function CharacterPicker({
  tr,
  lang,
  sv,
  fileName,
  onLangChange,
  onPick,
  onCancel,
}: Props) {
  const [error, setError] = useState<string | null>(null)

  function choose(key: string, memories: number) {
    const journal = buildJournalFromSavedVariables(sv, key)
    if (!journal) {
      setError(tr.svErrors.MEMORIES_TOO_LARGE)
      return
    }
    onPick(journal, { kind: 'savedvariables', schema: sv.schemaVersion, memories })
  }

  return (
    <main className="landing">
      <div className="landing__head">
        <p className="landing__kicker">{tr.landingKicker}</p>
        <h1 className="landing__title">{tr.brandName}</h1>
        <p className="landing__subtitle">{tr.landingSubtitle}</p>
        <Divider className="landing__divider" />
      </div>

      <section className="panel picker">
        <header className="picker__bar">
          <button type="button" className="toolbar__btn" onClick={onCancel}>
            ← {tr.toolbarBack}
          </button>
          <div className="lang-switch" role="group" aria-label="Language">
            <button
              type="button"
              className={lang === 'en' ? 'lang-switch__btn is-active' : 'lang-switch__btn'}
              onClick={() => onLangChange('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={lang === 'ru' ? 'lang-switch__btn is-active' : 'lang-switch__btn'}
              onClick={() => onLangChange('ru')}
            >
              RU
            </button>
          </div>
        </header>

        <h2 className="picker__title">{tr.svPickTitle}</h2>
        <p className="picker__hint">
          {fmt(tr.svPickHint, { name: fileName, count: sv.characters.length })}
        </p>

        <ul className="picker__list">
          {sv.characters.map((character) => {
            const range = [
              formatDate(character.firstMemoryAt, lang),
              formatDate(character.lastMemoryAt, lang),
            ]
              .filter(Boolean)
              .join(' — ')
            const meta = [
              fmt(tr.svCharacterMemories, { memories: character.memories }),
              ...(character.favorites > 0
                ? [fmt(tr.svCharacterFavorites, { favorites: character.favorites })]
                : []),
            ].join(' · ')
            return (
              <li key={character.key}>
                <button
                  type="button"
                  className="picker__char"
                  onClick={() => choose(character.key, character.memories)}
                >
                  <span className="picker__char-name">{character.name}</span>
                  {character.realm && <span className="picker__char-realm">{character.realm}</span>}
                  <span className="picker__char-meta">{meta}</span>
                  {range && <span className="picker__char-dates">{range}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {error && (
          <p className="panel__status panel__status--error" role="alert">
            <strong>{tr.errorTitle}</strong> {error}
          </p>
        )}
      </section>

      <p className="landing__privacy">{tr.privacyNote}</p>
    </main>
  )
}
