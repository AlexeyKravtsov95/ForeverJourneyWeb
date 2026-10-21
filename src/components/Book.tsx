import { useMemo } from 'react'
import type { ImportMeta } from '../lib/fjbook'
import type { Journal, JournalMemory } from '../lib/journal'
import { monthKey, monthLabel, toRoman } from '../lib/format'
import { fmt, type Lang, type Strings } from '../i18n'
import Cover from './Cover'
import Introduction from './Introduction'
import MemoryEntry from './MemoryEntry'
import { Crest, Divider } from './Ornaments'

interface Props {
  tr: Strings
  lang: Lang
  onLangChange: (lang: Lang) => void
  journal: Journal
  meta: ImportMeta
  onBack: () => void
}

interface Chapter {
  key: string
  label: string
  memories: JournalMemory[]
}

export default function Book({ tr, lang, onLangChange, journal, meta, onBack }: Props) {
  const chapters = useMemo<Chapter[]>(() => {
    const sorted = [...journal.memories].sort((a, b) => {
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
    return [...groups.entries()].map(([key, memories]) => {
      const firstDated = memories.find((memory) => memory.timestamp !== undefined)
      return {
        key,
        label: firstDated ? monthLabel(firstDated.timestamp as number, lang) : tr.undatedChapter,
        memories,
      }
    })
  }, [journal, lang, tr])

  return (
    <div className="book-view">
      <header className="toolbar">
        <button type="button" className="toolbar__btn" onClick={onBack}>
          ← {tr.toolbarBack}
        </button>
        <span className="toolbar__meta">{fmt(tr.importedMeta, { parts: meta.parts })}</span>
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
            className="toolbar__btn toolbar__btn--print"
            onClick={() => window.print()}
          >
            {tr.toolbarPrint}
          </button>
        </div>
      </header>

      <div className="book">
        <Cover journal={journal} tr={tr} lang={lang} />
        <Introduction journal={journal} tr={tr} lang={lang} />

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
