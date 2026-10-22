#!/usr/bin/env node
// Reference FJBOOK1 exporter for manual testing — an independent implementation
// of the format described in FJ-WEB-01, mirroring the real addon exporter
// (JournalExport.lua): checksum via string.format("%08X", b * 65536 + a),
// Unix-second timestamps, base64 string sliced into chat-sized parts.
// Usage: npm run generate:codes  → fixtures/*.txt to paste into the site.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'fixtures')

const MOD = 65521
function adler32(buf) {
  let a = 1
  let b = 0
  for (const byte of buf) {
    a = (a + byte) % MOD
    b = (b + a) % MOD
  }
  return ((b << 16) | a) >>> 0
}

const sumUpper = (buf) => adler32(buf).toString(16).padStart(8, '0').toUpperCase()

function encode(journal, { partSize = 180, checksumStyle = 'decimal', dropPart = null, corruptChecksum = false } = {}) {
  const json = JSON.stringify(journal)
  const bytes = Buffer.from(json, 'utf8')
  let sum = checksumStyle === 'upper' ? sumUpper(bytes) : String(adler32(bytes))
  if (corruptChecksum) sum = (parseInt(sum, 16) + 1).toString(16).padStart(8, '0').toUpperCase()
  const b64 = bytes.toString('base64')
  const total = Math.max(1, Math.ceil(b64.length / partSize))
  const parts = []
  for (let i = 0; i < total; i++) {
    parts.push(`FJBOOK1:${i + 1}/${total}:${sum}:${b64.slice(i * partSize, (i + 1) * partSize)}`)
  }
  if (dropPart) parts.splice(dropPart - 1, 1)
  return parts.join('\n')
}

// Mirrors JournalExport.lua exactly: uppercase %08X checksum, base64 string slicing.
function encodeLua(journal, { partSize = 240, perPart = false } = {}) {
  const bytes = Buffer.from(JSON.stringify(journal), 'utf8')
  const sum = sumUpper(bytes)
  const parts = []
  if (!perPart) {
    const b64 = bytes.toString('base64')
    const total = Math.max(1, Math.ceil(b64.length / partSize))
    for (let i = 0; i < total; i++) {
      parts.push(`FJBOOK1:${i + 1}/${total}:${sum}:${b64.slice(i * partSize, (i + 1) * partSize)}`)
    }
  } else {
    const total = Math.ceil(bytes.length / partSize)
    for (let i = 0; i < total; i++) {
      const chunk = bytes.slice(i * partSize, (i + 1) * partSize)
      parts.push(`FJBOOK1:${i + 1}/${total}:${sum}:${Buffer.from(chunk).toString('base64')}`)
    }
  }
  return parts.join('\n')
}

// The real exporter splits the base64 string into a first block of 30000 chars
// and subsequent blocks of 12000 chars.
function encodeLuaReal(journal) {
  const bytes = Buffer.from(JSON.stringify(journal), 'utf8')
  const sum = sumUpper(bytes)
  const b64 = bytes.toString('base64')
  const sizes = []
  if (b64.length > 0) {
    sizes.push(Math.min(30000, b64.length))
    let rest = b64.length - 30000
    while (rest > 0) {
      sizes.push(Math.min(12000, rest))
      rest -= 12000
    }
  }
  const parts = []
  let offset = 0
  sizes.forEach((size, i) => {
    parts.push(`FJBOOK1:${i + 1}/${sizes.length}:${sum}:${b64.slice(offset, offset + size)}`)
    offset += size
  })
  return parts.join('\n')
}

const en = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '1.0.0',
  locale: 'enUS',
  exportedAt: '2026-10-21T12:00:00Z',
  character: { name: 'Brannagh', race: 'Dwarf', class: 'Hunter', level: 45 },
  journey: { startedAt: '2026-03-02T09:15:00Z', deaths: 11, completedQuests: 187, totalPlayed: 215400 },
  memories: [
    { type: 'zone', typeLabel: 'Zone Discovered', source: 'zone', title: 'Dun Morogh', description: 'Snow, engine smoke and the ring of hammers.', personalNote: '', favorite: false, timestamp: 1772400000, location: 'Dun Morogh' },
    { type: 'note', typeLabel: 'Journal Entry', source: 'manual', title: 'Ale and Aurora', description: 'Shared a table with a gnome tinkerer who swore the northern lights are leylines bleeding.', personalNote: 'Проверить его теорию про лей-линии.', favorite: true, timestamp: 1772500000, location: 'Kharanos' },
    { type: 'death', typeLabel: 'Death', source: 'death', title: 'Trogg Ambush', description: 'Brannagh was slain by Stonesplinter Trogg.', personalNote: '', favorite: false, timestamp: 1772650000, location: 'Coldridge Pass' },
    { type: 'achievement', typeLabel: 'Achievement', source: 'achievement', title: 'Explore Dun Morogh', description: 'Discovered every corner of Dun Morogh.', personalNote: '', favorite: false, timestamp: 1772900000, location: 'Dun Morogh' },
    { type: 'level', typeLabel: 'Level Up', source: 'level', title: 'Level 45', description: 'Reached level 45.', personalNote: 'Почти половина пути.', favorite: false, timestamp: 1769000000, location: 'Ironforge' },
  ],
}

const ru = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '1.0.0',
  locale: 'ruRU',
  exportedAt: '2026-10-21T12:00:00Z',
  character: { name: 'Свенга', race: 'Дворф', class: 'Паладин', level: 70 },
  journey: { startedAt: '2026-01-11T16:40:00Z', deaths: 34, completedQuests: 521, totalPlayed: 777000 },
  memories: [
    { type: 'zone', typeLabel: 'Зона открыта', source: 'zone', title: 'Тирисфальские леса', description: 'Туман, вороньё и колокола Подгорода.', personalNote: 'Первый день за Стеной Серебряного Бора.', favorite: false, timestamp: 1768000000, location: 'Тирисфальские леса' },
    { type: 'note', typeLabel: 'Запись в дневнике', source: 'manual', title: 'Ночь в Подгороде', description: 'Аптекарь угостил чаем. Больше никогда.', personalNote: '', favorite: true, timestamp: 1768100000, location: 'Подгород' },
    { type: 'death', typeLabel: 'Смерть', source: 'death', title: 'Погибла от рук Отрёкшихся', description: 'Свенга пала у руин Лордерона.', personalNote: 'Забыла обновить щиты.', favorite: false, timestamp: 1768300000, location: 'Руины Лордерона' },
    { type: 'achievement', typeLabel: 'Достижение', source: 'achievement', title: 'Исследователь Восточных королевств', description: 'Открыты все зоны Восточных королевств.', personalNote: '', favorite: false, timestamp: 1768600000, location: 'Восточные королевства' },
  ],
}

// Lua-parity journal: every timestamp (including exportedAt) is Unix seconds,
// as the real addon emits them.
const luaStyle = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '1.0.0',
  locale: 'ruRU',
  exportedAt: 1792850000,
  character: { name: 'Траллина', race: 'Орк', class: 'Шаман', level: 55 },
  journey: { startedAt: 1790000000, deaths: 9, completedQuests: 301, totalPlayed: 403200 },
  memories: [
    { type: 'zone', typeLabel: 'Зона открыта', source: 'zone', title: 'Дуротар', description: 'Красная земля и вечный ветер.', personalNote: '', favorite: false, timestamp: 1790003600, location: 'Дуротар' },
    { type: 'note', typeLabel: 'Запись в дневнике', source: 'manual', title: 'Громовой утёс', description: 'Лифты работают. Пока.', personalNote: 'Не стоять под лифтом. Никогда.', favorite: true, timestamp: 1790173600, location: 'Громовой Утёс' },
    { type: 'death', typeLabel: 'Смерть', source: 'death', title: 'Кабан', description: 'Траллина пала от кабана.', personalNote: '', favorite: false, timestamp: 1790300000, location: 'Степи' },
    { type: 'achievement', typeLabel: 'Достижение', source: 'achievement', title: 'Исследователь Дуротара', description: 'Открыты все уголки Дуротара.', personalNote: '', favorite: false, timestamp: 1790600000, location: 'Дуротар' },
  ],
}

const empty = { ...en, memories: [] }

function bigJournal(count, name) {
  const types = ['zone', 'note', 'achievement', 'death', 'level']
  const labels = { zone: 'Зона открыта', note: 'Запись в дневнике', achievement: 'Достижение', death: 'Смерть', level: 'Уровень' }
  return {
    format: 'FJJOURNAL',
    formatVersion: 1,
    addonVersion: '1.0.0',
    locale: 'ruRU',
    exportedAt: 1792850000,
    character: { name, race: 'Эльф крови', class: 'Маг', level: 80 },
    journey: { startedAt: 1767225600, deaths: Math.floor(count / 8), completedQuests: count * 7, totalPlayed: count * 7200 },
    memories: Array.from({ length: count }, (_, i) => ({
      type: types[i % 5],
      typeLabel: labels[types[i % 5]],
      source: types[i % 5],
      title: `Память №${i + 1}: дорога ${['через лес', 'вдоль моря', 'сквозь туман', 'к вершине', 'домой'][i % 5]}`,
      description:
        i % 3 === 0
          ? `Хроника дня ${i + 1}. Дорога шла через ${['ельник', 'пустошь', 'перевал', 'тростники'][i % 4]}, и к вечеру ${name} добрался до лагеря. Костёр, котелок и звёзды над головой — вот и всё богатство путника.`
          : `Короткая запись дня ${i + 1}.`,
      personalNote: i % 5 === 0 ? `Заметка к памяти №${i + 1}: не забыть вернуться сюда весной.` : null,
      favorite: i % 11 === 0,
      timestamp: 1767225600 + i * 3 * 86400,
      location: i % 7 === 3 ? null : ['Кель\'Талас', 'Лордерон', 'Тирисфаль', 'Серебряный Бор'][i % 4],
    })),
  }
}

const LONG_PARAGRAPH =
  'Мы шли вдоль обрыва третий день, и море внизу так и не сменило цвет — всё тот же тяжёлый свинец. ' +
  'Илан рассказывал про южные порты, где рыбу продают ещё живой, а чайки дерутся с детьми за корку хлеба. ' +
  'Я слушал вполуха и считал шаги: на восьмисотом шаге тропа сужалась, и коня приходилось вести под уздцы. ' +
  'К вечеру ветра стихали, и тогда становилось слышно, как под скалой ворочаются камни — море никогда не спит по-настоящему.'

const longJournal = {
  format: 'FJJOURNAL',
  formatVersion: 1,
  addonVersion: '1.0.0',
  locale: 'ruRU',
  exportedAt: 1792850000,
  character: { name: 'Летописец', race: 'Человек', class: 'Монах', level: 60 },
  journey: { startedAt: 1790000000, deaths: 1, completedQuests: 90, totalPlayed: 120000 },
  memories: [
    { type: 'note', typeLabel: 'Запись в дневнике', source: 'manual', title: 'Дорога вдоль обрыва', description: Array.from({ length: 26 }, (_, i) => `${LONG_PARAGRAPH} (часть ${i + 1})`).join('\n\n'), personalNote: '', favorite: true, timestamp: 1790100000, location: 'Западный край' },
    { type: 'zone', typeLabel: 'Зона открыта', source: 'zone', title: 'Сумеречный лес', description: 'Вороны считают путников.', personalNote: '', favorite: false, timestamp: 1790050000, location: 'Сумеречный лес' },
    { type: 'note', typeLabel: 'Запись в дневнике', source: 'manual', title: 'Финальная страница', description: 'Дорога закончилась там же, где началась — у старого моста.', personalNote: '', favorite: false, timestamp: 1790200000, location: 'Штормград' },
  ],
}

mkdirSync(OUT, { recursive: true })
const files = {
  'sample-en.txt': encode(en, { partSize: 400 }),
  'sample-ru.txt': encode(ru, { partSize: 260 }),
  'sample-large-80.txt': encode(bigJournal(80, 'Marathon'), { partSize: 1000 }),
  'sample-empty.txt': encode(empty),
  'hex-checksum.txt': encode(en, { partSize: 500, checksumStyle: 'decimal' }),
  'broken-checksum.txt': encode(en, { partSize: 500, corruptChecksum: true }),
  'missing-part.txt': encode(ru, { partSize: 250, dropPart: 2 }),
  // Lua-parity fixtures (JournalExport.lua): uppercase %08X checksum + Unix seconds
  'lua-style.txt': encodeLua(luaStyle, { partSize: 240 }),
  'lua-style-perpart.txt': encodeLua(luaStyle, { partSize: 240, perPart: true }),
  // real exporter block split (30000 first, 12000 after) with null fields
  'lua-style-30000.txt': encodeLuaReal(bigJournal(80, 'Спринтер')),
  // journals for the PDF print check
  'journal-59.txt': encodeLua(bigJournal(59, 'Полуночник'), { partSize: 240 }),
  'journal-80.txt': encodeLua(bigJournal(80, 'Marathon'), { partSize: 240 }),
  'journal-long.txt': encodeLua(longJournal, { partSize: 240 }),
  // large journal for the client-side PDF generator performance check
  'journal-500.txt': encodeLuaReal(bigJournal(500, 'Легенда')),
}

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), content + '\n')
  console.log(`fixtures/${name} — ${content.split('\n').length} part(s), ${content.length} chars`)
}
console.log('\nPaste these files into the site to verify the real import pipeline.')
