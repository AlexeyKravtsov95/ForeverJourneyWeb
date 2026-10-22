// The PDF book, mirroring the web preview (src/components/Book.tsx and friends):
// dark leather cover with gold ornaments, parchment content pages, month
// chapters that always start on a fresh page, and a final crest page.
// Text stays real text (selectable/searchable); nothing is rasterized.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { Journal, JournalMemory } from '../lib/journal'
import { buildChapters } from '../lib/chapters'
import { formatDate, formatPlayed, toRoman } from '../lib/format'
import { fmt, type Lang, type Strings } from '../i18n'
import { BOOK_FONT } from './registerFonts'
import { CornerFlourish, Crest, Divider, Star, TypeIcon } from './ornaments'

export interface BookDocumentProps {
  journal: Journal
  tr: Strings
  lang: Lang
}

const A4 = { width: 595.28, height: 841.89 }

const styles = StyleSheet.create({
  // ---------- shared ----------
  contentPage: {
    backgroundColor: '#f1e3c0',
    paddingHorizontal: 54,
    paddingVertical: 46,
  },
  pageFrame: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    bottom: 20,
    borderWidth: 0.6,
    borderColor: 'rgba(138, 106, 47, 0.30)',
  },

  chapterHead: { alignItems: 'center', marginBottom: 20 },
  chapterKicker: {
    fontFamily: BOOK_FONT,
    fontSize: 8,
    letterSpacing: 2.4,
    color: '#8a6a2f',
    marginTop: 4,
  },
  chapterTitle: {
    fontFamily: BOOK_FONT,
    fontSize: 17,
    fontWeight: 700,
    color: '#6d4c17',
    marginTop: 3,
    marginBottom: 4,
  },

  // ---------- cover ----------
  coverPage: { backgroundColor: '#271a10', color: '#e6cf9a' },
  coverFrame: {
    position: 'absolute',
    top: 24,
    left: 24,
    right: 24,
    bottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(201, 164, 92, 0.55)',
  },
  coverFrameInner: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(201, 164, 92, 0.30)',
  },
  coverCorner: { position: 'absolute', width: 46, height: 46 },
  coverContent: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 64,
  },
  coverKicker: {
    fontFamily: BOOK_FONT,
    fontSize: 9,
    letterSpacing: 3.6,
    color: '#a5814a',
  },
  coverCrest: { marginTop: 16, marginBottom: 14 },
  coverTitle: {
    fontFamily: BOOK_FONT,
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: 4,
    color: '#ecd6a0',
  },
  coverName: {
    fontFamily: BOOK_FONT,
    fontSize: 17,
    fontStyle: 'italic',
    color: '#d8bd86',
    marginTop: 9,
  },
  coverMeta: {
    fontFamily: BOOK_FONT,
    fontSize: 10,
    letterSpacing: 1.6,
    color: '#b59a63',
    marginTop: 12,
  },
  coverDates: {
    fontFamily: BOOK_FONT,
    fontSize: 9.5,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    color: '#96805a',
    marginTop: 18,
  },

  // ---------- introduction ----------
  introLead: {
    fontFamily: BOOK_FONT,
    fontSize: 12,
    fontStyle: 'italic',
    color: '#54401f',
    lineHeight: 1.6,
    textAlign: 'center',
    marginBottom: 10,
  },
  introText: {
    fontFamily: BOOK_FONT,
    fontSize: 10.5,
    color: '#4a3619',
    lineHeight: 1.7,
    textAlign: 'center',
    marginHorizontal: 22,
    marginBottom: 22,
  },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '31.5%',
    alignItems: 'center',
    paddingVertical: 9,
    borderWidth: 0.7,
    borderColor: 'rgba(138, 106, 47, 0.40)',
    backgroundColor: 'rgba(255, 248, 224, 0.35)',
  },
  statValue: { fontFamily: BOOK_FONT, fontSize: 13, color: '#6b4a15' },
  statLabel: {
    fontFamily: BOOK_FONT,
    fontSize: 6.8,
    letterSpacing: 1.2,
    color: '#8a6a2f',
    marginTop: 3,
  },

  // ---------- memory entry ----------
  memory: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 0.7,
    borderBottomColor: 'rgba(122, 90, 43, 0.28)',
  },
  memoryLast: { marginBottom: 4, paddingBottom: 4, borderBottomWidth: 0 },
  memoryFavorite: {
    backgroundColor: 'rgba(201, 164, 92, 0.12)',
    borderWidth: 0.8,
    borderColor: 'rgba(176, 138, 66, 0.50)',
    borderRadius: 4,
    padding: 12,
    paddingHorizontal: 14,
  },
  memoryHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  memoryType: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memoryTypeLabel: {
    fontFamily: BOOK_FONT,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: '#8a6a2f',
  },
  memoryFavoriteTag: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  memoryFavoriteLabel: {
    fontFamily: BOOK_FONT,
    fontSize: 7.5,
    letterSpacing: 1.5,
    color: '#a3762a',
  },
  memoryTitle: {
    fontFamily: BOOK_FONT,
    fontSize: 13.5,
    fontWeight: 700,
    color: '#4a3418',
    marginTop: 5,
  },
  memoryMeta: {
    fontFamily: BOOK_FONT,
    fontSize: 9.5,
    fontStyle: 'italic',
    color: '#7c6647',
    marginTop: 2,
  },
  memoryDescription: {
    fontFamily: BOOK_FONT,
    fontSize: 10.5,
    color: '#42301a',
    lineHeight: 1.62,
    marginTop: 7,
    orphans: 2,
    widows: 2,
  },
  memoryNote: {
    marginTop: 9,
    borderLeftWidth: 2.2,
    borderLeftColor: 'rgba(176, 138, 66, 0.65)',
    backgroundColor: 'rgba(201, 164, 92, 0.10)',
    paddingVertical: 7,
    paddingRight: 10,
    paddingLeft: 10,
  },
  memoryNoteLabel: {
    fontFamily: BOOK_FONT,
    fontSize: 7,
    letterSpacing: 1.6,
    color: '#9a7228',
  },
  memoryNoteText: {
    fontFamily: BOOK_FONT,
    fontSize: 10,
    fontStyle: 'italic',
    color: '#5c4526',
    lineHeight: 1.55,
    marginTop: 3,
    orphans: 2,
    widows: 2,
  },

  // ---------- final page ----------
  endContent: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  endTitle: {
    fontFamily: BOOK_FONT,
    fontSize: 12,
    fontStyle: 'italic',
    letterSpacing: 0.8,
    color: '#7c5c26',
    marginTop: 12,
  },

  emptyChronicle: {
    fontFamily: BOOK_FONT,
    fontSize: 11,
    fontStyle: 'italic',
    color: '#7c6647',
    textAlign: 'center',
    marginTop: 60,
  },

  // pdfkit 0.20 writes an empty ToUnicode entry when a glyph is first laid
  // out in certain mixed-script runs (observed with latin X inside a Cyrillic
  // run), which corrupts text extraction in Chrome/Preview. Rendering one
  // invisible warm-up run per font face pins valid unicode mappings for every
  // glyph the book may later address. See docs/FJ-WEB-02.md, "Known limits".
  warmup: { fontFamily: BOOK_FONT, fontSize: 0.1, color: 'rgba(0,0,0,0)' },
  warmupItalic: {
    fontFamily: BOOK_FONT,
    fontStyle: 'italic',
    fontSize: 0.1,
    color: 'rgba(0,0,0,0)',
  },
  warmupBold: {
    fontFamily: BOOK_FONT,
    fontWeight: 700,
    fontSize: 0.1,
    color: 'rgba(0,0,0,0)',
  },
  warmupBoldItalic: {
    fontFamily: BOOK_FONT,
    fontWeight: 700,
    fontStyle: 'italic',
    fontSize: 0.1,
    color: 'rgba(0,0,0,0)',
  },
})

const WARMUP_LATIN =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const WARMUP_CYRILLIC =
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя'
const WARMUP_PUNCT = '—…·№«»?!.,;:()\''

function FontWarmup() {
  const warmupText = WARMUP_LATIN + WARMUP_CYRILLIC + WARMUP_PUNCT
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1 }}>
      <Text style={styles.warmup}>{warmupText}</Text>
      <Text style={styles.warmupItalic}>{warmupText}</Text>
      <Text style={styles.warmupBold}>{warmupText}</Text>
      <Text style={styles.warmupBoldItalic}>{warmupText}</Text>
    </View>
  )
}

function Cover({ journal, tr, lang }: BookDocumentProps) {
  const { character, journey } = journal
  const times = journal.memories
    .map((memory) => memory.timestamp)
    .filter((value): value is number => typeof value === 'number')
  const firstMemory = times.length ? Math.min(...times) : undefined
  const lastMemory = times.length ? Math.max(...times) : undefined
  const start = journey.startedAt ?? firstMemory
  const end = lastMemory ?? journal.exportedAt

  const metaParts = [character.race, character.class]
  if (character.level > 0) metaParts.push(fmt(tr.levelN, { level: character.level }))
  const meta = metaParts.filter(Boolean).join(' · ').toUpperCase()

  let dates = ''
  if (start && end && start !== end) {
    dates = `${formatDate(start, lang)} — ${formatDate(end, lang)}`
  } else if (start ?? end) {
    dates = formatDate((start ?? end) as number, lang)
  }

  return (
    <Page size={A4} style={styles.coverPage}>
      <FontWarmup />
      <View style={styles.coverFrame}>
        <View style={styles.coverFrameInner} />
      </View>
      <View style={[styles.coverCorner, { top: 24, left: 24 }]}>
        <CornerFlourish size={46} />
      </View>
      <View style={[styles.coverCorner, { top: 24, right: 24, transform: 'rotate(90deg)' }]}>
        <CornerFlourish size={46} />
      </View>
      <View style={[styles.coverCorner, { bottom: 24, right: 24, transform: 'rotate(180deg)' }]}>
        <CornerFlourish size={46} />
      </View>
      <View style={[styles.coverCorner, { bottom: 24, left: 24, transform: 'rotate(270deg)' }]}>
        <CornerFlourish size={46} />
      </View>

      <View style={styles.coverContent}>
        <Text style={styles.coverKicker}>{tr.brandName.toUpperCase()}</Text>
        <View style={styles.coverCrest}>
          <Crest size={96} />
        </View>
        <Text style={styles.coverTitle}>{tr.coverTitle.toUpperCase()}</Text>
        <Text style={styles.coverName}>{character.name}</Text>
        {meta ? <Text style={styles.coverMeta}>{meta}</Text> : null}
        {dates ? <Text style={styles.coverDates}>{dates}</Text> : null}
      </View>
    </Page>
  )
}

function Introduction({ journal, tr, lang }: BookDocumentProps) {
  const { character, journey, memories } = journal
  const favorites = memories.filter((memory) => memory.favorite).length

  const stats: Array<[string, string]> = [
    [tr.statStarted, formatDate(journey.startedAt, lang) || tr.unknownDate],
    ...(character.level > 0
      ? ([[tr.statLevel, String(character.level)]] as Array<[string, string]>)
      : []),
    [tr.statDeaths, String(journey.deaths)],
    [tr.statQuests, String(journey.completedQuests)],
    [tr.statPlayed, formatPlayed(journey.totalPlayed)],
    [tr.statMemories, String(memories.length)],
    ...(favorites > 0
      ? ([[tr.statFavorites, String(favorites)]] as Array<[string, string]>)
      : []),
  ]

  return (
    <Page size={A4} style={styles.contentPage}>
      <View style={styles.pageFrame} fixed />
      <View style={styles.chapterHead} minPresenceAhead={200}>
        <Divider width={170} />
        <Text style={styles.chapterTitle}>{tr.introTitle}</Text>
        <Divider width={170} />
      </View>
      <Text style={styles.introLead}>
        {fmt(tr.introLead, {
          name: character.name,
          date: formatDate(journey.startedAt, lang) || tr.unknownDate,
        })}
      </Text>
      <Text style={styles.introText}>{tr.introText}</Text>
      <View style={styles.stats}>
        {stats.map(([label, value]) => (
          <View style={styles.stat} key={label}>
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </Page>
  )
}

function MultilineText({ text, style }: { text: string; style: Style }) {
  // react-pdf has no reliable `white-space: pre-line`, so render explicit line blocks
  const lines = text.split('\n')
  return (
    <View>
      {lines.map((line, index) => (
        <Text key={index} style={style} orphans={2} widows={2}>
          {line.trim() === '' ? '\u00A0' : line}
        </Text>
      ))}
    </View>
  )
}

// A4 content column is ~487pt wide and ~750pt tall. Entries that clearly fit
// on one page are rendered with wrap={false} (like the site's
// `break-inside: avoid`), so a heading is never stranded at a page bottom.
// Anything plausibly taller must stay splittable — long entries may not be
// cut short. The estimate deliberately overcounts lines.
const PAGE_CONTENT_HEIGHT = 750

function estimateEntryHeight(memory: JournalMemory): number {
  const headHeight = 50
  const descriptionLines = memory.description
    ? Math.ceil(memory.description.length / 75) + 1
    : 0
  const descriptionHeight = descriptionLines * 17.5
  const noteLines = memory.personalNote ? Math.ceil(memory.personalNote.length / 85) + 1 : 0
  const noteHeight = noteLines ? noteLines * 16 + 34 : 0
  const chrome = memory.favorite ? 48 : 32
  return headHeight + descriptionHeight + noteHeight + chrome
}

function MemoryEntryView({
  memory,
  tr,
  lang,
  isLast,
}: {
  memory: JournalMemory
  tr: Strings
  lang: Lang
  isLast: boolean
}) {
  const meta = [formatDate(memory.timestamp, lang), memory.location].filter(Boolean).join(' · ')

  return (
    <View
      style={[
        styles.memory,
        ...(isLast ? [styles.memoryLast] : []),
        ...(memory.favorite ? [styles.memoryFavorite] : []),
      ]}
      wrap={estimateEntryHeight(memory) >= PAGE_CONTENT_HEIGHT ? true : false}
    >
      {/* keep the head (type + title + meta) glued to the first lines of text */}
      <View style={styles.memoryHead} minPresenceAhead={100}>
        {memory.typeLabel ? (
          <View style={styles.memoryType}>
            <TypeIcon type={memory.type} />
            <Text style={styles.memoryTypeLabel}>{memory.typeLabel.toUpperCase()}</Text>
          </View>
        ) : null}
        {memory.favorite ? (
          <View style={styles.memoryFavoriteTag}>
            <Star size={10} />
            <Text style={styles.memoryFavoriteLabel}>{tr.favoriteLabel.toUpperCase()}</Text>
          </View>
        ) : null}
        {memory.title ? <Text style={styles.memoryTitle}>{memory.title}</Text> : null}
        {meta ? <Text style={styles.memoryMeta}>{meta}</Text> : null}
      </View>
      {memory.description ? (
        <MultilineText text={memory.description} style={styles.memoryDescription} />
      ) : null}
      {memory.personalNote ? (
        <View style={styles.memoryNote}>
          <Text style={styles.memoryNoteLabel}>{tr.personalNoteLabel.toUpperCase()}</Text>
          <MultilineText text={memory.personalNote} style={styles.memoryNoteText} />
        </View>
      ) : null}
    </View>
  )
}

function ChapterPage({
  label,
  roman,
  memories,
  tr,
  lang,
}: {
  label: string
  roman: string
  memories: JournalMemory[]
  tr: Strings
  lang: Lang
}) {
  return (
    <Page size={A4} style={styles.contentPage}>
      <View style={styles.pageFrame} fixed />
      <View style={styles.chapterHead} minPresenceAhead={150}>
        <Divider width={170} />
        <Text style={styles.chapterKicker}>{fmt(tr.chapterKicker, { roman }).toUpperCase()}</Text>
        <Text style={styles.chapterTitle}>{label}</Text>
        <Divider width={170} />
      </View>
      {memories.map((memory, index) => (
        <MemoryEntryView
          key={index}
          memory={memory}
          tr={tr}
          lang={lang}
          isLast={index === memories.length - 1}
        />
      ))}
    </Page>
  )
}

export function BookDocument({ journal, tr, lang }: BookDocumentProps) {
  const chapters = buildChapters(journal.memories, lang, tr.undatedChapter)

  return (
    <Document
      title={`Forever Journey — ${journal.character.name}`}
      author={journal.character.name}
      creator="Forever Journey Book Creator"
      language={lang === 'ru' ? 'ru-RU' : 'en-US'}
    >
      <Cover journal={journal} tr={tr} lang={lang} />
      <Introduction journal={journal} tr={tr} lang={lang} />
      {chapters.length === 0 ? (
        <Page size={A4} style={styles.contentPage}>
          <View style={styles.pageFrame} fixed />
          <Text style={styles.emptyChronicle}>{tr.emptyChronicle}</Text>
        </Page>
      ) : (
        chapters.map((chapter, index) => (
          <ChapterPage
            key={chapter.key}
            label={chapter.label}
            roman={toRoman(index + 1)}
            memories={chapter.memories}
            tr={tr}
            lang={lang}
          />
        ))
      )}
      <Page size={A4} style={styles.contentPage}>
        <View style={styles.pageFrame} fixed />
        <View style={styles.endContent}>
          <Crest size={84} />
          <Text style={styles.endTitle}>{tr.endTitle}</Text>
        </View>
      </Page>
    </Document>
  )
}
