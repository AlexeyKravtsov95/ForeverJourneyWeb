#!/usr/bin/env node
// E2E check of the real client-side Download PDF flow (FJ-WEB-02) in headless
// Chrome via CDP. For every scenario it imports a journal, presses the
// Download PDF button and verifies:
//   - the blob handed to the browser is MIME application/pdf and starts with %PDF
//   - a real file lands in the download folder with the sanitized
//     ForeverJourney_<Name>.pdf name
//   - the button shows the busy state and returns to normal afterwards
//   - during generation every network request stays same-origin
//     (fonts/library load from our own origin; journal data never leaves)
// Usage: node scripts/download-pdf-check.mjs [baseUrl]  (default http://127.0.0.1:4173/)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
const CHROME_PROFILE = join(tmpdir(), `fj-chrome-dl-${Date.now()}`)
const DOWNLOAD_DIR = join(tmpdir(), `fj-downloads-${Date.now()}`)
mkdirSync(DOWNLOAD_DIR, { recursive: true })

const scenarios = [
  { name: 'demo', kind: 'demo' },
  // FJ-WEB-02.1: the enUS demo journal read in Russian — the preview must show
  // localized system events before the (same-language) PDF is downloaded.
  {
    name: 'demo-ru-localized',
    kind: 'demo',
    switchLang: 'ru',
    previewContains: ['Зона открыта', 'Запись в дневнике', 'Достигнут уровень 5.', '5 д 18 ч'],
    previewNotContains: ['Zone Discovered', 'г..'],
  },
  { name: 'empty', kind: 'fixture', file: 'fixtures/sample-empty.txt' },
  { name: 'journal-59', kind: 'fixture', file: 'fixtures/journal-59.txt' },
  { name: 'journal-80', kind: 'fixture', file: 'fixtures/journal-80.txt' },
  { name: 'journal-long-entry', kind: 'fixture', file: 'fixtures/journal-long.txt' },
  { name: 'journal-500', kind: 'fixture', file: 'fixtures/journal-500.txt' },
]

// fixtures/ is gitignored; fail fast with a clear hint instead of an ENOENT
// stack once Chrome is already running
const missing = scenarios
  .filter((scenario) => scenario.file)
  .filter((scenario) => !existsSync(resolve(ROOT, scenario.file)))
if (missing.length > 0) {
  console.error(
    `Missing test data: ${missing.map((s) => s.file).join(', ')}\n` +
      'Fixtures are generated locally and not shipped with the repository. Run:\n' +
      '  npm run generate:codes'
  )
  process.exit(2)
}

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
    '--hide-scrollbars',
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
let networkLog = []

ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve: res, reject: rej } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) rej(new Error(message.error.message))
    else res(message.result)
  } else if (message.method) {
    if (message.method === 'Network.requestWillBeSent') {
      networkLog.push(message.params.request.url)
    }
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

function waitEvent(name, timeoutMs = 60000) {
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

let failures = 0

async function importJournal(scenario) {
  if (scenario.kind === 'demo') {
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.includes('Try Demo') || b.textContent.includes('Демо-журнал')
      )
      if (!btn) throw new Error('demo button not found')
      btn.click()
      return true
    })()`)
  } else {
    const code = readFileSync(resolve(ROOT, scenario.file), 'utf8')
    await evaluate(`(() => {
      const textarea = document.getElementById('fj-code')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(textarea, ${JSON.stringify(code)})
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      document.querySelector('button[type="submit"]').click()
      return true
    })()`)
  }
  const loaded = await evaluate(`new Promise((resolve) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (document.querySelector('.sheet--cover')) { clearInterval(timer); resolve('ok') }
      else if (Date.now() - startedAt > 20000) { clearInterval(timer); resolve('timeout') }
    }, 100)
  })`)
  if (loaded !== 'ok') throw new Error(`${scenario.name}: book did not render`)
}

async function runScenario(scenario) {
  console.log(`\n=== ${scenario.name} ===`)
  for (const f of readdirSync(DOWNLOAD_DIR)) rmSync(join(DOWNLOAD_DIR, f))

  await send('Page.navigate', { url: BASE_URL })
  await waitEvent('Page.loadEventFired')
  await importJournal(scenario)
  await sleep(300)

  if (scenario.switchLang) {
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.lang-switch button')].find(
        (b) => b.textContent.trim() === ${JSON.stringify(scenario.switchLang.toUpperCase())}
      )
      if (!btn) throw new Error('language switch button not found')
      btn.click()
      return true
    })()`)
    await sleep(300)
  }
  if (scenario.previewContains || scenario.previewNotContains) {
    const checks = await evaluate(`(() => {
      const text = document.querySelector('.book-view').textContent
      return {
        contains: ${JSON.stringify(scenario.previewContains ?? [])}.map((n) => ({ n, ok: text.includes(n) })),
        notContains: ${JSON.stringify(scenario.previewNotContains ?? [])}.map((n) => ({ n, ok: !text.includes(n) })),
      }
    })()`)
    for (const { n, ok } of [...checks.contains, ...checks.notContains]) {
      if (!ok) {
        failures++
        console.log(`  FAIL: preview text ${JSON.stringify(n)}`)
      }
    }
    console.log(`  preview checks: ${[...checks.contains, ...checks.notContains].length} assertions`)
  }

  // observe the blob the app hands to the browser without breaking the download
  await evaluate(`(() => {
    window.__fjBlob = null
    window.__fjBlobHead = null
    const orig = URL.createObjectURL
    URL.createObjectURL = function (blob) {
      if (blob instanceof Blob && blob.type === 'application/pdf' && !window.__fjBlob) {
        window.__fjBlob = { type: blob.type, size: blob.size }
        blob.arrayBuffer().then((buf) => {
          window.__fjBlobHead = Array.from(new Uint8Array(buf.slice(0, 8)))
        })
      }
      return orig.call(this, blob)
    }
    return true
  })()`)

  networkLog = []
  const clicked = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.includes('Download PDF') || b.textContent.includes('Скачать PDF')
    )
    if (!btn) throw new Error('Download PDF button not found')
    // catch the busy state even if generation finishes within one frame
    window.__busySeen = false
    window.__errorSeen = false
    new MutationObserver(() => {
      if (btn.getAttribute('aria-busy') === 'true') window.__busySeen = true
    }).observe(btn, { attributes: true, attributeFilter: ['aria-busy'] })
    new MutationObserver(() => {
      if (document.querySelector('.pdf-error')) window.__errorSeen = true
    }).observe(document.body, { childList: true, subtree: true })
    btn.click()
    return btn.textContent.trim()
  })()`)
  if (!clicked) throw new Error('button not clicked')

  // wait for the actual file on disk
  let file = null
  for (let i = 0; i < 240; i++) {
    const files = readdirSync(DOWNLOAD_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'))
    if (files.length === 1) {
      file = files[0]
      break
    }
    await sleep(250)
  }
  if (!file) throw new Error('downloaded PDF never appeared on disk')
  await sleep(300)
  const blobInfo = await evaluate(`window.__fjBlob`)
  const blobHead = await evaluate(`window.__fjBlobHead`)
  const busySeen = await evaluate(`({ busy: window.__busySeen, error: window.__errorSeen })`)

  const issues = []
  if (!busySeen.busy) issues.push('busy state (Generating PDF…) was never shown')
  if (busySeen.error) issues.push('error banner appeared')
  if (!blobInfo || blobInfo.type !== 'application/pdf') {
    issues.push(`blob MIME is ${blobInfo ? blobInfo.type : 'missing'}`)
  }
  const headOk = blobHead && String.fromCharCode(...blobHead).startsWith('%PDF-')
  if (!headOk) issues.push(`blob bytes do not start with %PDF- (head: ${JSON.stringify(blobHead)})`)
  // data:/blob: URIs are local (e.g. the inline WASM react-pdf uses) — only
  // real http(s) requests to other origins would leak journal data
  const origin = new URL(BASE_URL).origin
  const external = networkLog.filter(
    (url) => (url.startsWith('http://') || url.startsWith('https://')) && !url.startsWith(origin + '/') && url !== origin
  )
  if (external.length) {
    issues.push(`external requests during generation: ${external.map((u) => u.slice(0, 120)).join(', ')}`)
  }

  const bytes = readFileSync(join(DOWNLOAD_DIR, file))
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') issues.push('file is not a PDF')
  if (!/^ForeverJourney_.+\.pdf$/.test(file)) issues.push(`unexpected file name: ${file}`)

  console.log(
    `downloaded ${file} — ${Math.round(bytes.length / 1024)} KB, ` +
      `MIME ${blobInfo ? blobInfo.type : '?'}, network requests: ${networkLog.length} (all same-origin)`
  )
  for (const issue of issues) {
    failures++
    console.log(`  FAIL: ${issue}`)
  }
  if (!issues.length) console.log('  OK')
}

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  })

  for (const scenario of scenarios) {
    await runScenario(scenario)
  }
} finally {
  try {
    ws.close()
  } catch {}
  chrome.kill()
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(CHROME_PROFILE, { recursive: true, force: true })
      break
    } catch {}
    await sleep(300)
  }
}

console.log(failures === 0 ? '\nALL DOWNLOAD CHECKS OK' : `\n${failures} ISSUE(S) FOUND`)
process.exit(failures === 0 ? 0 : 1)
