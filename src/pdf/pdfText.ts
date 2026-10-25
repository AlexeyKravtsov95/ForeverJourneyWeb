// Test-only helper (FJ-WEB-06.1): extracts per-page text from a rendered
// PDF through unpdf (a serverless pdf.js build), so regression tests can
// assert real page counts and page contents instead of buffer sizes.
//
// Matching goes through normalizePdfText(): the book's letter-spaced small
// caps extract as one glyph per run ("С О Х Р А Н Ё Н Н А Я …"), so all
// whitespace is collapsed and the text is lower-cased before comparing.
// The same normalization is applied to the needle, which lets tests quote
// the exact i18n strings.
import { extractText, getDocumentProxy } from 'unpdf'

export async function extractPdfPages(buffer: Buffer): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: false })
  return text as string[]
}

export function normalizePdfText(text: string): string {
  return text.replace(/[\s\u00AD\u2060\uFEFF]+/g, '').toLowerCase()
}

/** True when one page's extracted text contains the needle (whitespace-free). */
export function pdfPageContains(page: string, needle: string): boolean {
  return normalizePdfText(page).includes(normalizePdfText(needle))
}

/** True when any page of the book contains the needle. */
export function pdfContains(pages: string[], needle: string): boolean {
  return pages.some((page) => pdfPageContains(page, needle))
}

/** How many times a needle occurs inside one page (whitespace-free matching). */
export function pdfPageCount(page: string, needle: string): number {
  const haystack = normalizePdfText(page)
  const target = normalizePdfText(needle)
  if (!target) return 0
  return haystack.split(target).length - 1
}
