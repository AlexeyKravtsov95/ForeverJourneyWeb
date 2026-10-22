// Smoke-renders the real PDF book through the node build of @react-pdf
// (same component the browser downloads) and checks the output is a valid,
// non-trivial PDF with embedded fonts.
import { describe, expect, it } from 'vitest'
import { renderToBuffer } from '@react-pdf/renderer'
import { fileURLToPath } from 'node:url'
import { BookDocument } from './BookDocument'
import { registerBookFonts } from './registerFonts'
import { demoJournal } from '../demo/demoJournal'
import { strings } from '../i18n'
import type { Journal } from '../lib/journal'

const fontPath = (name: string) => fileURLToPath(new URL(`./fonts/${name}`, import.meta.url))

registerBookFonts({
  regular: fontPath('PT_Serif-Web-Regular.ttf'),
  italic: fontPath('PT_Serif-Web-Italic.ttf'),
  bold: fontPath('PT_Serif-Web-Bold.ttf'),
  boldItalic: fontPath('PT_Serif-Web-BoldItalic.ttf'),
})

const isPdf = (buffer: Buffer) => buffer.subarray(0, 5).toString('latin1') === '%PDF-'

// the real addon's manual-memory markers (MANUAL_MEMORY/USER) against an
// automatic RECORDED event with the same template-looking text; rendered in
// RU it must match the web preview exactly (same localizeMemory layer)
const markerJournal: Journal = {
  ...demoJournal,
  memories: [
    {
      type: 'MANUAL_MEMORY',
      typeLabel: 'MEMORY',
      source: 'USER',
      title: 'Reached Level 20',
      description: 'Your journey continues.',
      personalNote: '',
      favorite: false,
      timestamp: Date.UTC(2026, 4, 5, 12),
      location: 'Undercity',
    },
    {
      type: 'LEVEL',
      typeLabel: 'LEVEL',
      source: 'RECORDED',
      title: 'Reached Level 20',
      description: 'Reached level 20.',
      personalNote: '',
      favorite: false,
      timestamp: Date.UTC(2026, 4, 6, 12),
      location: 'Undercity',
    },
  ],
}

describe('BookDocument', () => {
  it(
    'renders the demo journal into a real PDF (EN)',
    async () => {
      const buffer = await renderToBuffer(
        <BookDocument journal={demoJournal} tr={strings.en} lang="en" />
      )
      expect(isPdf(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(10_000)
    },
    120_000
  )

  it(
    'renders the Russian localization without errors',
    async () => {
      const buffer = await renderToBuffer(
        <BookDocument journal={demoJournal} tr={strings.ru} lang="ru" />
      )
      expect(isPdf(buffer)).toBe(true)
    },
    120_000
  )

  it(
    'renders the manual-memory marker journal (RU) through the same localizeMemory layer',
    async () => {
      const buffer = await renderToBuffer(
        <BookDocument journal={markerJournal} tr={strings.ru} lang="ru" />
      )
      expect(isPdf(buffer)).toBe(true)
      expect(buffer.length).toBeGreaterThan(10_000)
    },
    120_000
  )
})
