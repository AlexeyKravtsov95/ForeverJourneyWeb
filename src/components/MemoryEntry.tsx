import type { JournalMemory } from '../lib/journal'
import { formatDate } from '../lib/format'
import type { Lang, Strings } from '../i18n'
import { Star, TypeIcon } from './Ornaments'

interface Props {
  memory: JournalMemory
  tr: Strings
  lang: Lang
}

export default function MemoryEntry({ memory, tr, lang }: Props) {
  const meta = [formatDate(memory.timestamp, lang), memory.location].filter(Boolean).join(' · ')

  return (
    <article className={memory.favorite ? 'memory memory--favorite' : 'memory'}>
      <div className="memory__head">
        {memory.typeLabel && (
          <span className="memory__type">
            <TypeIcon type={memory.type} />
            {memory.typeLabel}
          </span>
        )}
        {memory.favorite && (
          <span className="memory__favorite">
            <Star className="icon-star" />
            {tr.favoriteLabel}
          </span>
        )}
      </div>
      {memory.title && <h3 className="memory__title">{memory.title}</h3>}
      {meta && <p className="memory__meta">{meta}</p>}
      {memory.description && <p className="memory__description">{memory.description}</p>}
      {memory.personalNote && (
        <blockquote className="memory__note">
          <span className="memory__note-label">{tr.personalNoteLabel}</span>
          <p>{memory.personalNote}</p>
        </blockquote>
      )}
    </article>
  )
}
