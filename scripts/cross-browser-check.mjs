#!/usr/bin/env node
// FJ-RELEASE-01 cross-browser check in real Firefox and WebKit via Playwright.
// Complements the Chrome CDP scripts: import (full + multi-part), RU/EN
// switch, the dynamic JS chunks behind Download PDF and the same-origin
// font/library fetches inside @react-pdf/renderer.
// Playwright is deliberately NOT a project dependency; install it on demand:
//   npm install --no-save playwright
//   npx playwright install firefox webkit
// Usage: node scripts/cross-browser-check.mjs [baseUrl] [browser ...]
//   baseUrl default http://127.0.0.1:4173/ ; browsers default: firefox webkit
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const BASE_URL = process.argv[2] || 'http://127.0.0.1:4173/'
const BROWSERS = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ['firefox', 'webkit']

let pw
try {
  pw = await import('playwright')
} catch {
  console.error(
    'playwright is not installed. Run:\n' +
      '  npm install --no-save playwright\n' +
      '  npx playwright install firefox webkit'
  )
  process.exit(2)
}

const FIXTURE = readFileSync(resolve(ROOT, 'fixtures/journal-59.txt'), 'utf8')

let failures = 0
function check(browser, ok, label) {
  if (!ok) {
    failures++
    console.log(`  FAIL: ${label}`)
  }
}

async function runBrowser(name) {
  console.log(`\n=== ${name} ===`)
  const engine = pw[name]
  if (!engine) {
    console.log('  SKIPPED: unknown browser')
    return
  }
  const browser = await engine.launch()
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  const crossOrigin = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== new URL(BASE_URL).origin) crossOrigin.push(request.url())
  })
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto(BASE_URL, { waitUntil: 'load' })
  // WebKit can hit the load event before React mounts; wait for the real DOM
  await page.waitForSelector('.landing__title', { timeout: 10000 })
  check(name, true, 'landing renders')

  // full multi-part import (126 blocks) through the real textarea
  await page.fill('#fj-code', FIXTURE)
  await page.click('button[type="submit"]')
  await page.waitForSelector('.sheet--cover', { timeout: 20000 })
  const chaptersBefore = await page.locator('.sheet--chapter').count()

  // RU switch re-localizes system UI and keeps the journal
  await page.locator('.lang-switch button', { hasText: 'RU' }).click()
  await page.waitForTimeout(200)
  const ruText = (await page.locator('.book-view').innerText()).toLowerCase()
  // the chapter kicker is CSS-uppercased in the rendered text, hence the casing
  check(name, ruText.includes('глава'), 'RU switch localizes the book')
  check(
    name,
    (await page.locator('.sheet--chapter').count()) === chaptersBefore,
    'RU switch keeps the journal loaded'
  )
  await page.locator('.lang-switch button', { hasText: 'EN' }).click()
  await page.waitForTimeout(200)

  // Download PDF: dynamic import of react-pdf + same-origin TTF fetches
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60000 }),
    page.locator('button', { hasText: 'Download PDF' }).click(),
  ])
  const path = await download.path()
  const head = path ? readFileSync(path).subarray(0, 5).toString('latin1') : ''
  const suggested = download.suggestedFilename()
  check(name, head === '%PDF-', `downloaded file is a PDF (${suggested})`)
  check(name, /^ForeverJourney_.*\.pdf$/.test(suggested), 'file name pattern')
  const size = path ? readFileSync(path).length : 0
  check(name, size > 50_000, `PDF is non-trivially sized (${size} bytes)`)

  check(name, crossOrigin.length === 0, `no cross-origin requests (saw ${crossOrigin.length})`)
  check(
    name,
    consoleErrors.length === 0 && pageErrors.length === 0,
    `no console/page errors (${consoleErrors.length + pageErrors.length})`
  )
  if (crossOrigin.length > 0) console.log('  cross-origin urls:', crossOrigin.slice(0, 5))
  if (consoleErrors.length > 0) console.log('  console errors:', consoleErrors.slice(0, 3))
  if (pageErrors.length > 0) console.log('  page errors:', pageErrors.slice(0, 3))

  await browser.close()
  console.log(
    `  pdf: ${suggested} (${Math.round(size / 1024)} KB), chapters: ${chaptersBefore}` +
      (crossOrigin.length === 0 ? '' : `, CROSS-ORIGIN: ${crossOrigin.join(', ')}`)
  )
}

for (const name of BROWSERS) {
  try {
    await runBrowser(name)
  } catch (error) {
    failures++
    console.log(`  FAIL: ${name} crashed: ${String(error).slice(0, 300)}`)
  }
}

console.log('')
if (failures > 0) {
  console.log(`CROSS-BROWSER CHECK FAILED (${failures} problem(s))`)
  process.exit(1)
} else {
  console.log('CROSS-BROWSER CHECK OK')
}
