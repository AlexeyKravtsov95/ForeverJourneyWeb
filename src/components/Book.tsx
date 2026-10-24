import { useMemo, useState } from 'react'
import type { Journal } from '../lib/journal'
import { buildChapters, type Chapter } from '../lib/chapters'
import { toRoman } from '../lib/format'
import { fmt, type Lang, type Strings } from '../i18n'
import { downloadJournalPdf } from '../pdf/download'
import ArchiveSection from './ArchiveSection'
import Cover from './Cover'
import Introduction from './Introduction'
import MemoryEntry from './MemoryEntry'
import { Crest, Divider } from './Ornaments'

/** Which way the journal got into the app — shown (and localized) in the toolbar. */
export type ImportSummary =
  | { kind: 'fjbook'; parts: number }
  | { kind: 'savedvariables'; schema: number; memories: number; archive: boolean }

interface Props {
  tr: Strings
  lang: Lang
  onLangChange: (lang: Lang) => void
  journal: Journal
  meta: ImportSummary
  onBack: () => void
}

export default function Book({ tr, lang, onLangChange, journal, meta, onBack }: Props) {
  const chapters = useMemo<Chapter[]>(
    () => buildChapters(journal.memories, lang, tr.undatedChapter),
    [journal, lang, tr]
  )
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState(false)

  const handleDownloadPdf = async () => {
    if (pdfBusy) return
    setPdfBusy(true)
    setPdfError(false)
    try {
      await downloadJournalPdf(journal, tr, lang)
    } catch (error) {
      console.error('PDF generation failed', error)
      setPdfError(true)
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="book-view">
      <header className="toolbar">
        <button type="button" className="toolbar__btn" onClick={onBack}>
          ← {tr.toolbarBack}
        </button>
        <span className="toolbar__meta">
          {meta.kind === 'fjbook'
            ? fmt(tr.importedMeta, { parts: meta.parts })
            : fmt(tr.svImportedMeta, { schema: meta.schema, memories: meta.memories }) +
              (meta.archive ? ` · ${tr.svArchiveBadge}` : '')}
        </span>
        <div className="toolbar__right">
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
          <button
            type="button"
            className="toolbar__btn"
            onClick={() => window.print()}
            disabled={pdfBusy}
            title={tr.toolbarPrint}
          >
            🖨 {tr.toolbarPrint}
          </button>
          <button
            type="button"
            className="toolbar__btn toolbar__btn--download"
            onClick={handleDownloadPdf}
            disabled={pdfBusy}
            aria-busy={pdfBusy}
          >
            {pdfBusy ? tr.toolbarDownloadBusy : `⬇ ${tr.toolbarDownload}`}
          </button>
        </div>
      </header>
      {pdfError && (
        <div className="pdf-error" role="alert">
          {tr.pdfError}{' '}
          <button type="button" className="pdf-error__retry" onClick={handleDownloadPdf}>
            {tr.toolbarDownload}
          </button>
        </div>
      )}

      <div className="book">
        <Cover journal={journal} tr={tr} lang={lang} />
        <Introduction journal={journal} tr={tr} lang={lang} />
        <ArchiveSection journal={journal} tr={tr} lang={lang} />

        {chapters.length === 0 ? (
          <section className="sheet sheet--chapter">
            <p className="book-empty">{tr.emptyChronicle}</p>
          </section>
        ) : (
          chapters.map((chapter, index) => (
            <section className="sheet sheet--chapter" key={chapter.key} aria-label={chapter.label}>
              <header className="chapter-head">
                <Divider />
                <p className="chapter-head__kicker">
                  {fmt(tr.chapterKicker, { roman: toRoman(index + 1) })}
                </p>
                <h2 className="chapter-head__title">{chapter.label}</h2>
                <Divider />
              </header>
              {chapter.memories.map((memory, memoryIndex) => (
                <MemoryEntry key={memoryIndex} memory={memory} tr={tr} lang={lang} />
              ))}
            </section>
          ))
        )}

        <section className="sheet sheet--end">
          <Crest />
          <p className="book-end">{tr.endTitle}</p>
        </section>
      </div>
    </div>
  )
}
