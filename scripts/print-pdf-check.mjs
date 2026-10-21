#!/usr/bin/env node
// Prints the built app to real A4 PDFs through headless Chrome (CDP Page.printToPDF).
// Scenarios: demo book, 59- and 80-memory journals, and a journal with an entry
// longer than a printed page.
// Usage: node scripts/print-pdf-check.mjs [baseUrl]   (default http://127.0.0.1:4173/)
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'docs/pdf-samples')
const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/'
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
// Chrome profile lives in the OS temp dir, never inside the repository
const CHROME_PROFILE = join(tmpdir(), `fj-chrome-${Date.now()}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

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

const scenarios = [
  { name: 'demo-book', kind: 'demo' },
  { name: 'journal-59', kind: 'fixture', file: 'fixtures/journal-59.txt' },
  { name: 'journal-80', kind: 'fixture', file: 'fixtures/journal-80.txt' },
  { name: 'journal-long-entry', kind: 'fixture', file: 'fixtures/journal-long.txt' },
]

try {
  await send('Page.enable')
  await send('Runtime.enable')

  for (const scenario of scenarios) {
    await send('Page.navigate', { url: BASE_URL })
    await waitEvent('Page.loadEventFired')

    if (scenario.kind === 'demo') {
      await evaluate(`(() => {
        const btn = [...document.querySelectorAll('button')].find(
          (b) => b.textContent.includes('Try Demo') || b.textContent.includes('Демо-журнал')
        )
        if (!btn) throw new Error('demo button not found: ' + document.body.innerText.slice(0, 120))
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
        else if (Date.now() - startedAt > 15000) { clearInterval(timer); resolve('timeout') }
      }, 100)
    })`)
    if (loaded !== 'ok') throw new Error(`${scenario.name}: book did not render`)

    await sleep(400)

    const pdf = await send('Page.printToPDF', {
      landscape: false,
      printBackground: true,
      preferCSSPageSize: true,
      paperWidth: 8.267,
      paperHeight: 11.692,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      scale: 1,
    })
    const buffer = Buffer.from(pdf.data, 'base64')
    writeFileSync(resolve(OUT, `${scenario.name}.pdf`), buffer)
    console.log(`${scenario.name}.pdf — ${Math.round(buffer.length / 1024)} KB`)
  }
} finally {
  try { ws.close() } catch {}
  chrome.kill()
  for (let i = 0; i < 5; i++) {
    try { rmSync(CHROME_PROFILE, { recursive: true, force: true }); break } catch {}
    await sleep(300)
  }
}
