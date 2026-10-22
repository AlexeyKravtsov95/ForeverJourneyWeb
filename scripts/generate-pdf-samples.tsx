// Generates sample books with the SAME React components the browser uses on
// Download PDF (@react-pdf/renderer node build). Produces docs/pdf-samples/
// client-*.pdf for every scenario of FJ-WEB-02 (0 / demo / 59 / 80 / 500
// memories + an entry longer than a page) and prints generation timings.
// Usage: npm run pdf:samples   (after npm run generate:codes for fixtures)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToBuffer } from '@react-pdf/renderer'

import { BookDocument } from '../src/pdf/BookDocument'
import { registerBookFonts } from '../src/pdf/registerFonts'
import { strings } from '../src/i18n'
import { demoJournal } from '../src/demo/demoJournal'
import { importJournal, type Journal } from '../src/lib/fjbook'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/pdf-samples')

const fontPath = (name: string) =>
  fileURLToPath(new URL(`../src/pdf/fonts/${name}`, import.meta.url))

registerBookFonts({
  regular: fontPath('PT_Serif-Web-Regular.ttf'),
  italic: fontPath('PT_Serif-Web-Italic.ttf'),
  bold: fontPath('PT_Serif-Web-Bold.ttf'),
  boldItalic: fontPath('PT_Serif-Web-BoldItalic.ttf'),
})

function fixtureJournal(file: string): Journal {
  const code = readFileSync(resolve(ROOT, 'fixtures', file), 'utf8')
  const result = importJournal(code)
  if (result.status !== 'ok') throw new Error(`${file} did not import: ${result.code}`)
  return result.journal
}

const scenarios: Array<{ name: string; journal: Journal; lang: 'en' | 'ru' }> = [
  { name: 'client-demo-book', journal: demoJournal, lang: 'en' },
  { name: 'client-journal-empty', journal: fixtureJournal('sample-empty.txt'), lang: 'ru' },
  { name: 'client-journal-59', journal: fixtureJournal('journal-59.txt'), lang: 'ru' },
  { name: 'client-journal-80', journal: fixtureJournal('journal-80.txt'), lang: 'ru' },
  { name: 'client-journal-long-entry', journal: fixtureJournal('journal-long.txt'), lang: 'ru' },
  { name: 'client-journal-500', journal: fixtureJournal('journal-500.txt'), lang: 'ru' },
]

mkdirSync(OUT, { recursive: true })
for (const { name, journal, lang } of scenarios) {
  const started = Date.now()
  const buffer = await renderToBuffer(
    <BookDocument journal={journal} tr={strings[lang]} lang={lang} />
  )
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  writeFileSync(resolve(OUT, `${name}.pdf`), buffer)
  console.log(
    `${name}.pdf — ${Math.round(buffer.length / 1024)} KB, ` +
      `${journal.memories.length} memories, generated in ${seconds}s`
  )
}
