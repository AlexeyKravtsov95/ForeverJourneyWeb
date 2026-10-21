// PT Serif (SIL OFL 1.1, fonts live in src/pdf/fonts with the license file)
// covers Latin + Cyrillic and is registered locally — no CDN fetches happen
// during generation; the browser build only loads same-origin Vite assets.
import { Font } from '@react-pdf/renderer'

export const BOOK_FONT = 'PTSerif'

export interface FontSources {
  regular: string
  italic: string
  bold: string
  boldItalic: string
}

let registered = false

export function registerBookFonts(sources: FontSources) {
  if (registered) return
  Font.register({
    family: BOOK_FONT,
    fonts: [
      { src: sources.regular, fontWeight: 400, fontStyle: 'normal' },
      { src: sources.italic, fontWeight: 400, fontStyle: 'italic' },
      { src: sources.bold, fontWeight: 700, fontStyle: 'normal' },
      { src: sources.boldItalic, fontWeight: 700, fontStyle: 'italic' },
    ],
  })
  // The built-in hyphenation dictionary is English-only; disabling it keeps
  // Russian words from being mangled with wrong hyphens.
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}
