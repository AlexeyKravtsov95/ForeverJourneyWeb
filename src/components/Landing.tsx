import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  importJournal,
  type ImportError,
  type NeedsParts,
} from '../lib/fjbook'
import { MAX_FILE_BYTES, readSavedVariables, type SavedVariablesOk } from '../lib/savedvariables'
import type { Journal } from '../lib/journal'
import type { ImportSummary } from './Book'
import { buildDemoCode } from '../demo/demoJournal'
import { fmt, type Lang, type Strings } from '../i18n'
import { Divider } from './Ornaments'

interface Props {
  tr: Strings
  lang: Lang
  onLangChange: (lang: Lang) => void
  onImported: (journal: Journal, meta: ImportSummary) => void
  onSavedVariables: (sv: SavedVariablesOk, fileName: string) => void
}

function errorMessage(error: ImportError, tr: Strings): string {
  return fmt(tr.errors[error.code], {
    detail: error.detail ?? '',
    part: error.part ?? '',
  })
}

export default function Landing({ tr, lang, onLangChange, onImported, onSavedVariables }: Props) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<ImportError | null>(null)
  const [needsParts, setNeedsParts] = useState<NeedsParts | null>(null)
  const [svError, setSvError] = useState<{
    code: keyof Strings['svErrors']
    detail?: string
  } | null>(null)
  const [svBusy, setSvBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  function runImport(text: string) {
    const result = importJournal(text)
    if (result.status === 'ok') {
      setError(null)
      setNeedsParts(null)
      onImported(result.journal, { kind: 'fjbook', parts: result.meta.parts })
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

  // Reads and parses the file fully in the browser; nothing leaves the page.
  async function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow picking the same file again after an error
    if (!file) return
    setSvError(null)
    if (file.size > MAX_FILE_BYTES) {
      setSvError({ code: 'FILE_TOO_LARGE' })
      return
    }
    setSvBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const result = readSavedVariables(bytes)
      if (result.status === 'ok') onSavedVariables(result, file.name)
      else setSvError({ code: result.code, detail: result.detail })
    } catch {
      setSvError({ code: 'PARSE_ERROR', detail: '' })
    } finally {
      setSvBusy(false)
    }
  }

  return (
    <main className="landing">
      <div className="landing__head">
        <p className="landing__kicker">{tr.landingKicker}</p>
        <h1 className="landing__title">{tr.brandName}</h1>
        <p className="landing__subtitle">{tr.landingSubtitle}</p>
        <Divider className="landing__divider" />
      </div>

      <section className="panel panel--sv">
        <span className="panel__label">{tr.importSvLabel}</span>
        <p className="panel__hint">{tr.importSvHint}</p>
        <input
          ref={fileInput}
          id="fj-sv-file"
          className="panel__file-input"
          type="file"
          accept=".lua,text/plain,application/octet-stream"
          onChange={onFileChosen}
        />
        <div className="panel__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => fileInput.current?.click()}
            disabled={svBusy}
            aria-busy={svBusy}
          >
            {tr.importSvButton}
          </button>
        </div>
        {svError && (
          <p className="panel__status panel__status--error" role="alert">
            <strong>{tr.errorTitle}</strong>{' '}
            {fmt(tr.svErrors[svError.code], { detail: svError.detail ?? '' })}
          </p>
        )}
        <details className="sv-how">
          <summary>{tr.svPathTitle}</summary>
          <ol className="sv-how__steps">
            {tr.svHowSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      </section>

      <form className="panel" onSubmit={onSubmit}>
        <label className="panel__label" htmlFor="fj-code">
          {tr.importLabel}
        </label>
        <p className="panel__hint">{tr.importFjbookHint}</p>
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
      <p className="landing__version">FJBOOK1 · FJJOURNAL v1 · SavedVariables schema 3</p>
    </main>
  )
}
