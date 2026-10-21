// Client-side PDF download: the heavy @react-pdf/renderer bundle (plus the
// TTF assets) is dynamically imported only after the user presses the button,
// so the initial page load stays untouched. Generation happens fully in the
// browser; no network requests carry journal data anywhere.
import type { Journal } from '../lib/journal'
import type { Lang, Strings } from '../i18n'
import { pdfFileName } from './filename'

export async function downloadJournalPdf(journal: Journal, tr: Strings, lang: Lang): Promise<void> {
  // Dynamic import keeps @react-pdf/renderer out of the initial bundle
  const [{ pdf }, { BookDocument }, { registerBookFonts }, { fontUrls }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./BookDocument'),
    import('./registerFonts'),
    import('./fontUrls'),
  ])

  registerBookFonts(fontUrls)

  const bookElement = <BookDocument journal={journal} tr={tr} lang={lang} />
  const rawBlob = await pdf(bookElement).toBlob()
  // Guarantee the MIME type even if the library changes its default
  const blob =
    rawBlob.type === 'application/pdf' ? rawBlob : new Blob([rawBlob], { type: 'application/pdf' })

  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = pdfFileName(journal.character.name)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    // give the browser a tick to start the download before revoking
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
}
