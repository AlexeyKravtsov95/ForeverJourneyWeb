// Responsive contract for the stat tiles (FJ-WEB-06.1 final fix). jsdom does
// no layout, so the regression is pinned at the CSS level: the rules below
// are what kept "2 д 3 ч 2 мин 34 с" / "10 октября 2026 г." inside their
// tiles at 320–1280px (measured via scrollWidth in a real browser). If any
// of them is refactored away, the tile overflow comes back — fail loudly
// and re-measure instead.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./book.css', import.meta.url), 'utf8')

/** Collapses whitespace/comments so the rules can be matched robustly. */
const normalized = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .trim()

const rule = (selector: string): string => {
  const match = normalized.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} ?\\{([^}]*)\\}`)
  )
  return match ? match[1] : ''
}

describe('stat tiles stay responsive (FJ-WEB-06.1)', () => {
  it('the tile is a container-query sizing context', () => {
    expect(rule('.stat')).toContain('container-type: inline-size')
  })

  it('values never wrap mid-value (no orphaned «г.» line)', () => {
    expect(rule('.stat__value')).toContain('white-space: nowrap')
  })

  it('browsers with container queries scale the value type with the tile', () => {
    const supportsBlock = normalized.match(
      /@supports \(container-type: inline-size\) ?\{[^{]*\{([^}]*)\}[^}]*\}/
    )
    expect(supportsBlock).not.toBeNull()
    const declarations = (supportsBlock as RegExpMatchArray)[1]
    // clamp keeps a floor (0.9rem), the fluid tile-relative unit (cqw) and
    // the desktop ceiling (1.25rem)
    expect(declarations).toMatch(/font-size: clamp\(0\.9rem, 10cqw, 1\.25rem\)/)
  })

  it('browsers without container queries keep the fixed desktop size', () => {
    // declared outside @supports, so the declaration above only ever
    // refines it instead of replacing it
    expect(rule('.stat__value')).toMatch(/font-size: 1\.25rem/)
  })

  it('a grid track can never exceed its container (no page-level horizontal scroll)', () => {
    expect(rule('.stats')).toContain('grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr))')
  })
})
