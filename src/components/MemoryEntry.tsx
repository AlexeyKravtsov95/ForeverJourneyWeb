import type { JournalMemory } from '../lib/journal'
import { localizeMemory } from '../lib/localize'
import type { Lang, Strings } from '../i18n'
import { Star, TypeIcon } from './Ornaments'

interface Props {
  memory: JournalMemory
  tr: Strings
  lang: Lang
}

export default function MemoryEntry({ memory, tr, lang }: Props) {
  const view = localizeMemory(memory, lang)

  return (
    <article className={memory.favorite ? 'memory memory--favorite' : 'memory'}>
      <div className="memory__head">
        {view.typeLabel && (
          <span className="memory__type">
            <TypeIcon type={memory.type} />
            {view.typeLabel}
          </span>
        )}
        {memory.favorite && (
          <span className="memory__favorite">
            <Star className="icon-star" />
            {tr.favoriteLabel}
          </span>
        )}
      </div>
      {view.title && <h3 className="memory__title">{view.title}</h3>}
      {view.meta && <p className="memory__meta">{view.meta}</p>}
      {view.description && <p className="memory__description">{view.description}</p>}
      {view.personalNote && (
        <blockquote className="memory__note">
          <span className="memory__note-label">{tr.personalNoteLabel}</span>
          <p>{view.personalNote}</p>
        </blockquote>
      )}
    </article>
  )
}
