import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SITE_URL = 'https://journal.mythweld.com/'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('SEO metadata (GROWTH-01)', () => {
  const html = read('../index.html')

  it('declares a canonical URL for the production site', () => {
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}" />`)
  })

  it('carries the Open Graph card with the social image', () => {
    expect(html).toContain(`<meta property="og:url" content="${SITE_URL}" />`)
    expect(html).toContain('<meta property="og:type" content="website" />')
    expect(html).toContain('<meta property="og:title" content="Forever Journey — Book Creator" />')
    expect(html).toMatch(/<meta\s+property="og:description"\s+content="[^"]+"/)
    expect(html).toContain(`<meta property="og:image" content="${SITE_URL}og-image.png" />`)
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta property="og:locale" content="en_US" />')
    expect(html).toContain('<meta property="og:locale:alternate" content="ru_RU" />')
  })

  it('carries the Twitter summary_large_image card', () => {
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<meta name="twitter:title" content="Forever Journey — Book Creator" />')
    expect(html).toMatch(/<meta\s+name="twitter:description"\s+content="[^"]+"/)
    expect(html).toContain(`<meta name="twitter:image" content="${SITE_URL}og-image.png" />`)
  })

  it('never advertises the social image over plain http', () => {
    expect(html).not.toMatch(/content="http:\/\//)
  })

  it('robots.txt allows crawling and points to the sitemap', () => {
    const robots = read('../public/robots.txt')
    expect(robots).toContain('User-agent: *')
    expect(robots).toContain('Allow: /')
    expect(robots).toContain(`Sitemap: ${SITE_URL}sitemap.xml`)
  })

  it('sitemap.xml lists the production home page', () => {
    const sitemap = read('../public/sitemap.xml')
    expect(sitemap).toContain(`<loc>${SITE_URL}</loc>`)
    // a declarative file only — entity declarations have no business here
    expect(sitemap).not.toMatch(/<!DOCTYPE|<!ENTITY/)
  })

  it('the social image is a real 1200×630 PNG shipped with the build', () => {
    const bytes = readFileSync(new URL('../public/og-image.png', import.meta.url))
    expect(bytes.length).toBeGreaterThan(10_000)
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    // IHDR: width and height as big-endian uint32 right after the signature
    expect(bytes.readUInt32BE(16)).toBe(1200)
    expect(bytes.readUInt32BE(20)).toBe(630)
  })
})
