import type { Journal } from '../lib/journal'
import { formatDate, formatPlayed } from '../lib/format'
import { introLeadText } from '../lib/localize'
import type { Lang, Strings } from '../i18n'
import { Divider } from './Ornaments'

interface Props {
  journal: Journal
  tr: Strings
  lang: Lang
}

interface Stat {
  label: string
  value: string
}

export default function Introduction({ journal, tr, lang }: Props) {
  const { character, journey, memories } = journal
  const favorites = memories.filter((memory) => memory.favorite).length

  const stats: Stat[] = [
    { label: tr.statStarted, value: formatDate(journey.startedAt, lang) || tr.unknownDate },
    ...(character.level > 0
      ? [{ label: tr.statLevel, value: String(character.level) }]
      : []),
    { label: tr.statDeaths, value: String(journey.deaths) },
    { label: tr.statQuests, value: String(journey.completedQuests) },
    { label: tr.statPlayed, value: formatPlayed(journey.totalPlayed, lang) },
    { label: tr.statMemories, value: String(memories.length) },
    ...(favorites > 0 ? [{ label: tr.statFavorites, value: String(favorites) }] : []),
  ]

  return (
    <section className="sheet sheet--intro" aria-label={tr.introTitle}>
      <header className="chapter-head">
        <Divider />
        <h2 className="chapter-head__title">{tr.introTitle}</h2>
        <Divider />
      </header>
      <p className="intro-lead">
        {introLeadText(
          tr,
          character.name,
          formatDate(journey.startedAt, lang) || tr.unknownDate
        )}
      </p>
      <p className="intro-text">{tr.introText}</p>
      <div className="stats">
        {stats.map((stat) => (
          <div className="stat" key={stat.label}>
            <span className="stat__value">{stat.value}</span>
            <span className="stat__label">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
