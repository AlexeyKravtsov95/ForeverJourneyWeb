#!/usr/bin/env node
// Reference FJBOOK1 exporter for manual testing — an independent implementation
// of the format described in FJ-WEB-01, mirroring what the addon will produce.
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

function encode(journal, { partSize = 180, checksumStyle = 'decimal', dropPart = null, corruptChecksum = false } = {}) {
  const json = JSON.stringify(journal)
  const bytes = Buffer.from(json, 'utf8')
  let checksum = adler32(bytes)
  if (corruptChecksum) checksum = (checksum + 1) >>> 0
  const sum = checksumStyle === 'hex' ? checksum.toString(16).padStart(8, '0') : String(checksum)
  const b64 = bytes.toString('base64')
  const total = Math.max(1, Math.ceil(b64.length / partSize))
  const parts = []
  for (let i = 0; i < total; i++) {
    parts.push(`FJBOOK1:${i + 1}/${total}:${sum}:${b64.slice(i * partSize, (i + 1) * partSize)}`)
  }
  if (dropPart) parts.splice(dropPart - 1, 1)
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

const empty = { ...en, memories: [] }

const large = {
  ...en,
  character: { ...en.character, name: 'Marathon' },
  memories: Array.from({ length: 80 }, (_, i) => ({
    type: i % 4 === 0 ? 'zone' : i % 4 === 1 ? 'achievement' : i % 4 === 2 ? 'death' : 'note',
    typeLabel: 'Memory',
    source: 'test',
    title: `Память №${i + 1}`,
    description: `Длинное описание события №${i + 1} для проверки больших журналов.`,
    personalNote: i % 3 === 0 ? `Заметка к событию №${i + 1}` : '',
    favorite: i % 10 === 0,
    timestamp: 1767200000 + i * 3 * 86400,
    location: 'Азерот',
  })),
}

mkdirSync(OUT, { recursive: true })
const files = {
  'sample-en.txt': encode(en, { partSize: 400 }),
  'sample-ru.txt': encode(ru, { partSize: 260 }),
  'sample-large-80.txt': encode(large, { partSize: 1000 }),
  'sample-empty.txt': encode(empty),
  'hex-checksum.txt': encode(en, { partSize: 500, checksumStyle: 'hex' }),
  'broken-checksum.txt': encode(en, { partSize: 500, corruptChecksum: true }),
  'missing-part.txt': encode(ru, { partSize: 250, dropPart: 2 }),
}

for (const [name, content] of Object.entries(files)) {
  writeFileSync(resolve(OUT, name), content + '\n')
  console.log(`fixtures/${name} — ${content.split('\n').length} part(s), ${content.length} chars`)
}
console.log('\nPaste these files into the site to verify the real import pipeline.')
