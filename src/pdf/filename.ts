// Builds the download filename: ForeverJourney_<CharacterName>.pdf
// The character name is normalized so it is safe across Windows/macOS/Linux
// filesystems: no path separators, reserved characters, control chars,
// trailing dots/spaces, and capped to a sane length. Cyrillic is kept —
// modern filesystems handle Unicode names fine.
const MAX_NAME_LENGTH = 80

/** Removes characters that are unsafe in filenames on any mainstream OS. */
export function sanitizeCharacterName(name: string): string {
  const cleaned = name
    // Windows-reserved characters + path separators + quotes + control chars
    // (tab/newline/carriage return stay — they are folded into spaces below)
    .replace(/[<>:"/\\|?*\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    // newlines and tabs folded into spaces
    .replace(/[\r\n\t]+/g, ' ')
    // collapse runs of whitespace
    .replace(/\s+/g, ' ')
    .trim()
    // Windows silently drops trailing dots/spaces — drop them ourselves
    .replace(/[. ]+$/g, '')
    .slice(0, MAX_NAME_LENGTH)
    .replace(/[. ]+$/g, '')
  return cleaned
}

export function pdfFileName(characterName: string): string {
  const safe = sanitizeCharacterName(characterName)
  return safe ? `ForeverJourney_${safe}.pdf` : 'ForeverJourney_Book.pdf'
}
