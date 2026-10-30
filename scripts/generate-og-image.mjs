#!/usr/bin/env node
// Renders scripts/og-image.html in headless Chrome (CDP Page.captureScreenshot)
// into public/og-image.png — the 1200×630 social image referenced by the
// og:image / twitter:image meta tags. Same CDP pattern as print-pdf-check.mjs.
// Usage: node scripts/generate-og-image.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE_URL = new URL('./og-image.html', import.meta.url).href
const OUT = resolve(ROOT, 'public/og-image.png')
const WIDTH = 1200
const HEIGHT = 630
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9334
// Chrome profile lives in the OS temp dir, never inside the repository
const CHROME_PROFILE = join(tmpdir(), `fj-og-chrome-${Date.now()}`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(resolve(ROOT, 'public'), { recursive: true })

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
    '--force-device-scale-factor=1',
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

const once = (name) =>
  new Promise((resolve) => {
    eventWaiters.push({ name, resolve })
  })

try {
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const loaded = once('Page.loadEventFired')
  await send('Page.navigate', { url: PAGE_URL })
  await loaded
  await sleep(400) // layout, fonts and paint settle

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  const bytes = Buffer.from(shot.data, 'base64')
  writeFileSync(OUT, bytes)
  console.log(`og-image: ${bytes.length} bytes -> ${OUT} (${WIDTH}x${HEIGHT})`)
} finally {
  ws.close()
  chrome.kill()
}
