import type { ImportErrorCode } from './lib/fjbook'

export type Lang = 'en' | 'ru'

export function detectLang(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru')) {
    return 'ru'
  }
  return 'en'
}

/** Replaces {placeholders} in a translation string. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}

export interface Strings {
  brandName: string
  landingKicker: string
  landingSubtitle: string
  importLabel: string
  importPlaceholder: string
  importButton: string
  demoButton: string
  errorTitle: string
  waitingParts: string
  howTitle: string
  howSteps: string[]
  privacyNote: string
  errors: Record<ImportErrorCode, string>
  toolbarBack: string
  toolbarPrint: string
  toolbarDownload: string
  toolbarDownloadBusy: string
  pdfError: string
  importedMeta: string
  coverTitle: string
  levelN: string
  introTitle: string
  introLead: string
  introText: string
  unknownDate: string
  statStarted: string
  statLevel: string
  statDeaths: string
  statQuests: string
  statPlayed: string
  statMemories: string
  statFavorites: string
  chapterKicker: string
  undatedChapter: string
  personalNoteLabel: string
  favoriteLabel: string
  emptyChronicle: string
  endTitle: string
}

export const strings: Record<Lang, Strings> = {
  en: {
    brandName: 'Forever Journey',
    landingKicker: 'World of Warcraft: Forever',
    landingSubtitle: 'Turn your adventures into a story worth keeping',
    importLabel: 'Export code',
    importPlaceholder: 'Paste the FJBOOK1 export code here…',
    importButton: 'Import Journal',
    demoButton: 'Try Demo Journal',
    errorTitle: 'Import failed.',
    waitingParts:
      'Received {received} of {total} parts. Still waiting for part(s) {missing} — paste the remaining blocks into the same field and press Import Journal again.',
    howTitle: 'How to get the code',
    howSteps: [
      'In game, open the Forever Journey journal (/fj).',
      'Press "Export Book" — the addon will show one or more code blocks starting with FJBOOK1:.',
      'Copy every block. Parts may arrive in several messages — paste them all here in any order.',
      'Press Import Journal, and your book will be bound before your eyes.',
    ],
    privacyNote:
      'Private by design: the journal is decoded and rendered entirely in your browser — nothing is ever uploaded.',
    errors: {
      EMPTY_INPUT: 'Paste the export code from the addon first.',
      NOT_FJBOOK1:
        'This does not look like a Forever Journey export. The code must contain blocks starting with FJBOOK1:.',
      TOO_LARGE: 'The pasted code is too large.',
      TOO_MANY_PARTS: 'Too many code parts.',
      INVALID_PART_HEADER: 'One of the code parts has a broken header: {detail}',
      TOTAL_MISMATCH:
        'The parts declare different total counts. Make sure all parts come from the same export.',
      DUPLICATE_PART: 'Part {part} appears twice with different contents.',
      CHECKSUM_PARTS_MISMATCH:
        'The parts carry different checksums — they seem to come from different exports.',
      INVALID_BASE64: 'The payload is not valid Base64 data.',
      PAYLOAD_TOO_LARGE: 'The decoded journal is too large.',
      CHECKSUM_MISMATCH:
        'Checksum mismatch — the code is corrupted. Please copy it from the addon again.',
      INVALID_UTF8: 'The payload is corrupted (invalid UTF-8).',
      INVALID_JSON: 'The payload is corrupted (invalid JSON).',
      WRONG_FORMAT: 'This is not a Forever Journey journal (unexpected "format" field).',
      UNSUPPORTED_VERSION:
        'Unsupported journal version {detail}. This app supports formatVersion 1.',
      INVALID_SCHEMA: 'The journal structure is damaged: {detail}.',
    },
    toolbarBack: 'New import',
    toolbarPrint: 'Print',
    toolbarDownload: 'Download PDF',
    toolbarDownloadBusy: 'Generating PDF…',
    pdfError: 'Could not generate the PDF. Please try again.',
    importedMeta: 'Import verified · {parts} part(s) · Adler-32 OK',
    coverTitle: 'My Journey',
    levelN: 'Level {level}',
    introTitle: 'Introduction',
    introLead: 'The journey of {name} began on {date}.',
    introText:
      'What follows is a chronicle of roads, battles and quiet moments — recorded by the Forever Journey addon and bound into this book. May it remember what the years make us forget.',
    unknownDate: '—',
    statStarted: 'Journey started',
    statLevel: 'Level',
    statDeaths: 'Deaths',
    statQuests: 'Quests completed',
    statPlayed: 'Time played',
    statMemories: 'Memories',
    statFavorites: 'Favorites',
    chapterKicker: 'Chapter {roman}',
    undatedChapter: 'Undated memories',
    personalNoteLabel: 'Personal note',
    favoriteLabel: 'Favorite',
    emptyChronicle: 'The chronicle awaits its first entry.',
    endTitle: 'The journey continues…',
  },
  ru: {
    brandName: 'Forever Journey',
    landingKicker: 'World of Warcraft: Forever',
    landingSubtitle: 'Превратите свои приключения в историю, которую хочется сохранить',
    importLabel: 'Экспортный код',
    importPlaceholder: 'Вставьте здесь экспортный код FJBOOK1…',
    importButton: 'Импортировать журнал',
    demoButton: 'Демо-журнал',
    errorTitle: 'Не удалось импортировать.',
    waitingParts:
      'Получено {received} из {total} частей. Не хватает частей: {missing} — вставьте оставшиеся блоки в то же поле и снова нажмите «Импортировать журнал».',
    howTitle: 'Как получить код',
    howSteps: [
      'Откройте в игре журнал Forever Journey (команда /fj).',
      'Нажмите «Export Book» — аддон покажет один или несколько блоков кода, начинающихся с FJBOOK1:.',
      'Скопируйте все блоки. Части могут прийти несколькими сообщениями — вставьте их сюда в любом порядке.',
      'Нажмите «Импортировать журнал», и книга соберётся прямо на ваших глазах.',
    ],
    privacyNote:
      'Приватность по замыслу: журнал декодируется и собирается целиком в вашем браузере — ничего никуда не отправляется.',
    errors: {
      EMPTY_INPUT: 'Сначала вставьте экспортный код из аддона.',
      NOT_FJBOOK1:
        'Это не похоже на экспорт Forever Journey. Код должен содержать блоки, начинающиеся с FJBOOK1:.',
      TOO_LARGE: 'Вставленный код слишком велик.',
      TOO_MANY_PARTS: 'Слишком много частей кода.',
      INVALID_PART_HEADER: 'У одной из частей повреждён заголовок: {detail}',
      TOTAL_MISMATCH:
        'Части объявляют разное общее количество. Убедитесь, что все части из одного экспорта.',
      DUPLICATE_PART: 'Часть {part} встречается дважды с разным содержимым.',
      CHECKSUM_PARTS_MISMATCH:
        'Части несут разные контрольные суммы — похоже, они из разных экспортов.',
      INVALID_BASE64: 'Данные не являются корректным Base64.',
      PAYLOAD_TOO_LARGE: 'Декодированный журнал слишком велик.',
      CHECKSUM_MISMATCH:
        'Контрольная сумма не совпала — код повреждён. Скопируйте его из аддона заново.',
      INVALID_UTF8: 'Данные повреждены (недопустимый UTF-8).',
      INVALID_JSON: 'Данные повреждены (некорректный JSON).',
      WRONG_FORMAT: 'Это не журнал Forever Journey (неожиданное поле «format»).',
      UNSUPPORTED_VERSION: 'Неподдерживаемая версия журнала {detail}. Приложение работает с formatVersion 1.',
      INVALID_SCHEMA: 'Структура журнала повреждена: {detail}.',
    },
    toolbarBack: 'Новый импорт',
    toolbarPrint: 'Печать',
    toolbarDownload: 'Скачать PDF',
    toolbarDownloadBusy: 'Создание PDF…',
    pdfError: 'Не удалось создать PDF. Попробуйте ещё раз.',
    importedMeta: 'Импорт проверен · частей: {parts} · Adler-32 OK',
    coverTitle: 'Моё путешествие',
    levelN: 'Уровень {level}',
    introTitle: 'Вступление',
    introLead: 'Путешествие {name} началось {date}.',
    introText:
      'Перед вами — летопись дорог, битв и тихих минут, записанная аддоном Forever Journey и переплетённая в эту книгу. Пусть она хранит то, что годы заставляют нас забывать.',
    unknownDate: '—',
    statStarted: 'Начало пути',
    statLevel: 'Уровень',
    statDeaths: 'Смертей',
    statQuests: 'Квестов выполнено',
    statPlayed: 'Времени в игре',
    statMemories: 'Воспоминаний',
    statFavorites: 'Избранных',
    chapterKicker: 'Глава {roman}',
    undatedChapter: 'Воспоминания без даты',
    personalNoteLabel: 'Личная заметка',
    favoriteLabel: 'Избранное',
    emptyChronicle: 'Летопись ждёт первой записи.',
    endTitle: 'Путешествие продолжается…',
  },
}
