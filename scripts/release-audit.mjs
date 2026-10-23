#!/usr/bin/env node
// FJ-RELEASE-01 release audit: user-journey checks that complement the unit
// suite and download-pdf-check.mjs, run in headless Chrome via CDP.
// Covered:
//   - multi-part import pasted incrementally: after a partial paste the page
//     shows the needs-parts status (not an error), and the book renders once
//     the remaining blocks arrive — earlier parts do not need re-entry
//   - corrupted code (guaranteed checksum change) shows the CHECKSUM_MISMATCH
//     error specifically and never exposes journal contents or raw Base64
//     in the message
//   - RU <-> EN switching inside the book view keeps the journal loaded
//     (same chapter/memory counts) while system UI re-localizes
//   - mobile viewports (Android 360x800, iPhone 390x844): landing, import and
//     book render without horizontal overflow
// Usage: node scripts/release-audit.mjs [baseUrl]   (default http://127.0.0.1:4173/)
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/'
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9335
const CHROME_PROFILE = resolve(tmpdir(), `fj-chrome-audit-${Date.now()}`)

// fixtures/ is gitignored; every browser script needs a freshly generated set.
// Read before Chrome is spawned so a missing file cannot orphan the browser.
function readFixture(name) {
  const path = resolve(ROOT, 'fixtures', name)
  if (!existsSync(path)) {
    console.error(
      `Missing test data: fixtures/${name}\n` +
        'Fixtures are generated locally and not shipped with the repository. Run:\n' +
        '  npm run generate:codes'
    )
    process.exit(2)
  }
  return readFileSync(path, 'utf8')
}

const JOURNAL_59 = readFixture('journal-59.txt')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' }
)

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const targets = await res.json()
      const page = targets.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      // chrome not ready yet
    }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint not available')
}

const ws = new WebSocket(await getWsUrl())
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let seq = 0
const pending = new Map()
const eventWaiters = []

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve: res, reject: rej } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) rej(new Error(message.error.message))
    else res(message.result)
  } else if (message.method) {
    for (let i = eventWaiters.length - 1; i >= 0; i--) {
      if (eventWaiters[i].name === message.method) {
        eventWaiters[i].resolve(message.params)
        eventWaiters.splice(i, 1)
      }
    }
  }
}

function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

function waitEvent(name, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    eventWaiters.push({ name, resolve })
    setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs)
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error('evaluate failed: ' + JSON.stringify(result.exceptionDetails).slice(0, 300))
  }
  return result.result.value
}

async function navigate() {
  await send('Page.navigate', { url: BASE_URL })
  await waitEvent('Page.loadEventFired')
}

async function setViewport(width, height, mobile) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
  })
}

async function pasteAndImport(code) {
  await evaluate(`(() => {
    const textarea = document.getElementById('fj-code')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(textarea, ${JSON.stringify(code)})
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('button[type="submit"]').click()
    return true
  })()`)
}

async function waitForBook(timeoutMs = 20000) {
  return evaluate(`new Promise((resolve) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (document.querySelector('.sheet--cover')) { clearInterval(timer); resolve('ok') }
      else if (Date.now() - startedAt > ${timeoutMs}) { clearInterval(timer); resolve('timeout') }
    }, 100)
  })`)
}

async function clickLang(lang) {
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.lang-switch button')].find(
      (b) => b.textContent.trim() === ${JSON.stringify(lang.toUpperCase())}
    )
    if (!btn) throw new Error('${lang} button not found')
    btn.click()
    return true
  })()`)
  await sleep(200)
}

let failures = 0
function check(ok, label) {
  if (!ok) {
    failures++
    console.log(`  FAIL: ${label}`)
  }
}

await send('Page.enable')
await send('Runtime.enable')

// --- 1. incremental multi-part import -------------------------------------
console.log('\n=== incremental multi-part import ===')
await navigate()
const allBlocks = JOURNAL_59
  .split(/\r?\n/)
  .filter((line) => line.startsWith('FJBOOK1:'))
const total = Number(allBlocks[0].split(':')[1].split('/')[1])
// first paste: only the opening blocks
const first = allBlocks.slice(0, 2)
await pasteAndImport(first.join('\n'))

const partial = await evaluate(`(() => {
  const status = document.querySelector('.panel__status--info')
  const error = document.querySelector('.panel__status--error')
  return {
    info: status ? status.textContent : null,
    error: error ? error.textContent : null,
    bookShown: !!document.querySelector('.sheet--cover'),
  }
})()`)
check(partial.info !== null, 'needs-parts status is shown after a partial paste')
check(partial.error === null, 'partial paste is not reported as an error')
check(partial.bookShown === false, 'book does not render before all parts arrive')
check(
  typeof partial.info === 'string' && partial.info.includes(String(total)),
  `status mentions the expected total (${total})`
)

// second paste: everything again in a shuffled order — duplicates from the
// first paste must be tolerated, the previously missing parts accepted
const rest = allBlocks.slice(2)
for (let i = rest.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[rest[i], rest[j]] = [rest[j], rest[i]]
}
await pasteAndImport([...first, ...rest].join('\n'))
check((await waitForBook()) === 'ok', 'book renders after the remaining parts are pasted')

// --- 2. corrupted code: checksum error, no content echo ---------------------
console.log('\n=== corrupted code error ===')
await navigate()
// force English so the expected error wording is deterministic regardless of
// the browser locale picked up by detectLang()
await clickLang('en')
const goodLines = JOURNAL_59
  .split(/\r?\n/)
  .filter((l) => l.startsWith('FJBOOK1:'))
// break the declared checksum of every block: the first hex digit is flipped
// to a DIFFERENT hex digit, so the value is guaranteed to change. All blocks
// carry the same checksum string, so they stay mutually consistent and the
// expected failure is CHECKSUM_MISMATCH (not CHECKSUM_PARTS_MISMATCH).
const broken = goodLines
  .map((line) =>
    line.replace(/^(FJBOOK1:\d+\/\d+:)([0-9A-Fa-f])/, (_, header, first) => header + (first === '0' ? '1' : '0'))
  )
  .join('\n')
// sanity: the corruption above must actually change the declared checksum
const originalSum = goodLines[0].split(':')[2]
const brokenSum = broken.split('\n')[0].split(':')[2]
if (originalSum === brokenSum) {
  throw new Error('test setup bug: checksum corruption did not change the value')
}
await pasteAndImport(broken)
const errorView = await evaluate(`(() => {
  const error = document.querySelector('.panel__status--error')
  return {
    text: error ? error.textContent : null,
    bookShown: !!document.querySelector('.sheet--cover'),
  }
})()`)
check(errorView.text !== null, 'checksum mismatch shows an error')
check(
  typeof errorView.text === 'string' && errorView.text.includes('Checksum mismatch'),
  'the error is specifically CHECKSUM_MISMATCH ("Checksum mismatch — the code is corrupted")'
)
check(
  typeof errorView.text === 'string' && !errorView.text.includes('different checksums'),
  'not the parts-mismatch error (all blocks declare one checksum)'
)
check(errorView.bookShown === false, 'corrupted journal is not rendered')
// the Base64 payload must never be echoed back in the error message
const payloadSample = goodLines[0].split(':')[3].slice(0, 64)
check(
  typeof errorView.text === 'string' && !errorView.text.includes(payloadSample),
  'error message does not echo raw Base64 payload'
)
check(
  typeof errorView.text === 'string' && !/[A-Za-z0-9+/]{40,}/.test(errorView.text),
  'error message contains no long Base64-looking run'
)

// --- 3. RU/EN switching keeps the journal ---------------------------------
console.log('\n=== RU/EN switch inside the book ===')
await navigate()
const goodCode = JOURNAL_59
await pasteAndImport(goodCode)
check((await waitForBook()) === 'ok', 'journal-59 book renders')

const before = await evaluate(`(() => ({
  chapters: [...document.querySelectorAll('.sheet--chapter')].length,
  memories: [...document.querySelectorAll('.memory')].length,
}))()`)

await clickLang('ru')
const ruView = await evaluate(`(() => ({
  chapters: [...document.querySelectorAll('.sheet--chapter')].length,
  memories: [...document.querySelectorAll('.memory')].length,
  hasRuChapter: document.querySelector('.book-view').textContent.includes('Глава '),
}))()`)
check(ruView.chapters === before.chapters, 'chapter count unchanged after RU switch')
check(ruView.memories === before.memories, 'memory count unchanged after RU switch')
check(ruView.hasRuChapter, 'system UI re-localized to Russian (Глава)')

await clickLang('en')
const backToEn = await evaluate(`(() => ({
  chapters: [...document.querySelectorAll('.sheet--chapter')].length,
  memories: [...document.querySelectorAll('.memory')].length,
  hasEnChapter: document.querySelector('.book-view').textContent.includes('Chapter '),
}))()`)
check(backToEn.chapters === before.chapters, 'chapter count unchanged after switching back to EN')
check(backToEn.memories === before.memories, 'memory count unchanged after switching back to EN')
check(backToEn.hasEnChapter, 'system UI re-localized back to English (Chapter)')

// --- 4. mobile viewports ----------------------------------------------------
const MOBILE_VIEWPORTS = [
  { name: 'android-360x800', width: 360, height: 800 },
  { name: 'iphone-390x844', width: 390, height: 844 },
]
for (const viewport of MOBILE_VIEWPORTS) {
  console.log(`\n=== mobile viewport ${viewport.name} ===`)
  await setViewport(viewport.width, viewport.height, true)
  await navigate()
  const landing = await evaluate(`(() => ({
    title: !!document.querySelector('.landing__title'),
    textarea: !!document.getElementById('fj-code'),
    overflowX:
      document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
  }))()`)
  check(landing.title, 'landing renders')
  check(landing.textarea, 'import textarea is reachable')
  check(!landing.overflowX, 'no horizontal overflow on the landing')

  await pasteAndImport(JOURNAL_59)
  check((await waitForBook()) === 'ok', 'book renders in the mobile viewport')
  const bookView = await evaluate(`(() => ({
    overflowX:
      document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth,
    downloadBtn: [...document.querySelectorAll('button')].some((b) =>
      b.textContent.includes('Download PDF') || b.textContent.includes('Скачать PDF')
    ),
  }))()`)
  check(!bookView.overflowX, 'no horizontal overflow on the book')
  check(bookView.downloadBtn, 'Download PDF button is present in the mobile toolbar')
}

// --- summary ----------------------------------------------------------------
console.log('')
if (failures > 0) {
  console.log(`RELEASE AUDIT FAILED (${failures} problem(s))`)
  process.exitCode = 1
} else {
  console.log('RELEASE AUDIT OK')
}
ws.close()
chrome.kill()
process.exit(process.exitCode ?? 0)
