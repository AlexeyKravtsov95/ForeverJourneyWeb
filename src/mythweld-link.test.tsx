import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import Landing from './components/Landing'
import { strings } from './i18n'

// Force the manual credit flag on for this suite only (vi.mock is hoisted and
// file-wide, which is exactly why the shipped-default checks live in
// app.test.tsx). Everything else comes from the real module.
vi.mock('./lib/externalLinks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/externalLinks')>()
  return { ...actual, MYTHWELD_LINK_ENABLED: true }
})

const { MYTHWELD_URL } = await import('./lib/externalLinks')

const landing = (lang: 'en' | 'ru') =>
  renderToString(
    <Landing
      tr={strings[lang]}
      lang={lang}
      onLangChange={() => undefined}
      onImported={() => undefined}
      onSavedVariables={() => undefined}
    />
  )

describe('GROWTH-01 review: the Mythweld credit when the manual flag is on', () => {
  it('EN renders the credit with the fixed URL, new tab and reader notice', () => {
    const html = landing('en')
    expect(html).toContain('class="landing__mythweld"')
    expect(html).toContain(`href="${MYTHWELD_URL}"`)
    expect(html).toContain('By Mythweld')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('(opens in a new tab)')
  })

  it('RU рендерит кредит; язык переключается, состояние флага — нет', () => {
    // the flag is a module constant: EN and RU render the very same link,
    // only its label localizes
    const html = landing('ru')
    expect(html).toContain('class="landing__mythweld"')
    expect(html).toContain(`href="${MYTHWELD_URL}"`)
    expect(html).toContain('Проект Mythweld')
    expect(html).toContain('(открывается в новой вкладке)')
  })
})
