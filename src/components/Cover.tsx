import type { Journal } from '../lib/journal'
import { coverDateRange } from '../lib/format'
import { fmt, type Lang, type Strings } from '../i18n'
import { CornerFlourish, Crest } from './Ornaments'

interface Props {
  journal: Journal
  tr: Strings
  lang: Lang
}

export default function Cover({ journal, tr, lang }: Props) {
  const { character } = journal

  const metaParts = [character.race, character.class]
  if (character.level > 0) metaParts.push(fmt(tr.levelN, { level: character.level }))

  const dates = coverDateRange(journal, lang)

  return (
    <section className="sheet sheet--cover" aria-label={tr.coverTitle}>
      <div className="cover-frame" aria-hidden="true">
        <CornerFlourish className="cover-corner cover-corner--tl" />
        <CornerFlourish className="cover-corner cover-corner--tr" />
        <CornerFlourish className="cover-corner cover-corner--br" />
        <CornerFlourish className="cover-corner cover-corner--bl" />
      </div>
      <div className="cover-content">
        <p className="cover__kicker">{tr.brandName}</p>
        <Crest className="cover__crest" />
        <h1 className="cover__title">{tr.coverTitle}</h1>
        <p className="cover__name">{character.name}</p>
        {metaParts.length > 0 && <p className="cover__meta">{metaParts.join(' · ')}</p>}
        {dates && <p className="cover__dates">{dates}</p>}
      </div>
    </section>
  )
}
