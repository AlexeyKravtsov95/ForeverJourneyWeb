import { useState, type FormEvent } from 'react'
import {
  importJournal,
  type ImportError,
  type ImportMeta,
  type NeedsParts,
} from '../lib/fjbook'
import type { Journal } from '../lib/journal'
import { buildDemoCode } from '../demo/demoJournal'
import { fmt, type Lang, type Strings } from '../i18n'
import { Divider } from './Ornaments'

interface Props {
  tr: Strings
  lang: Lang
  onLangChange: (lang: Lang) => void
  onImported: (journal: Journal, meta: ImportMeta) => void
}

function errorMessage(error: ImportError, tr: Strings): string {
  return fmt(tr.errors[error.code], {
    detail: error.detail ?? '',
    part: error.part ?? '',
  })
}

export default function Landing({ tr, lang, onLangChange, onImported }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<ImportError | null>(null)
  const [needsParts, setNeedsParts] = useState<NeedsParts | null>(null)

  function runImport(text: string) {
    const result = importJournal(text)
    if (result.status === 'ok') {
      setError(null)
      setNeedsParts(null)
      onImported(result.journal, result.meta)
    } else if (result.status === 'needs-parts') {
      setError(null)
      setNeedsParts(result)
    } else {
      setNeedsParts(null)
      setError(result)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    runImport(code)
  }

  function onDemo() {
    const demo = buildDemoCode()
    setCode(demo)
    runImport(demo)
  }

  return (
    <main className="landing">
      <div className="landing__head">
        <p className="landing__kicker">{tr.landingKicker}</p>
        <h1 className="landing__title">{tr.brandName}</h1>
        <p className="landing__subtitle">{tr.landingSubtitle}</p>
        <Divider className="landing__divider" />
      </div>

      <form className="panel" onSubmit={onSubmit}>
        <label className="panel__label" htmlFor="fj-code">
          {tr.importLabel}
        </label>
        <textarea
          id="fj-code"
          className="panel__textarea"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={tr.importPlaceholder}
          spellCheck={false}
          autoComplete="off"
          rows={6}
        />
        {needsParts && (
          <p className="panel__status panel__status--info" role="status">
            {fmt(tr.waitingParts, {
              received: needsParts.received,
              total: needsParts.total,
              missing: needsParts.missing.join(', '),
            })}
          </p>
        )}
        {error && (
          <p className="panel__status panel__status--error" role="alert">
            <strong>{tr.errorTitle}</strong> {errorMessage(error, tr)}
          </p>
        )}
        <div className="panel__actions">
          <button type="submit" className="btn btn--primary">
            {tr.importButton}
          </button>
          <button type="button" className="btn btn--ghost" onClick={onDemo}>
            {tr.demoButton}
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
        </div>
      </form>

      <section className="howto">
        <h2 className="howto__title">{tr.howTitle}</h2>
        <ol className="howto__steps">
          {tr.howSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <p className="landing__privacy">{tr.privacyNote}</p>
      <p className="landing__version">FJBOOK1 · FJJOURNAL v1</p>
    </main>
  )
}
