import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  IMMUTABLE_CACHE,
  PRODUCTION_TARGET,
  REVALIDATE_CACHE,
  buildPutObjectInput,
  cacheControlFor,
  contentTypeFor,
  isAllowedTarget,
  isPrivateHost,
  isValidBucketName,
  planUploads,
  validateEndpoint,
} from './deploy-s3-lib.mjs'

const fixtures = []

function makeDist(files) {
  const dir = mkdtempSync(join(tmpdir(), 'fj-deploy-'))
  fixtures.push(dir)
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, content)
  }
  return dir
}

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop(), { recursive: true, force: true })
})

describe('contentTypeFor', () => {
  it('returns the required content types for the site file kinds', () => {
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('assets/index-B1n2h3.css')).toBe('text/css; charset=utf-8')
    expect(contentTypeFor('assets/index-C4d5e6.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('assets/manifest-F7g8h9.json')).toBe('application/json; charset=utf-8')
    expect(contentTypeFor('assets/ornament-J0k1l2.svg')).toBe('image/svg+xml')
    expect(contentTypeFor('assets/PT_Serif-Web-Regular-M3n4o5.ttf')).toBe('font/ttf')
  })

  it('is case-insensitive for extensions and falls back to a byte stream', () => {
    expect(contentTypeFor('assets/app.JS')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('assets/blob.bin')).toBe('application/octet-stream')
    expect(contentTypeFor('no-extension')).toBe('application/octet-stream')
  })
})

describe('cacheControlFor', () => {
  it('never caches index.html for long', () => {
    expect(cacheControlFor('index.html')).toBe(REVALIDATE_CACHE)
  })

  it('caches hashed Vite assets immutably', () => {
    expect(cacheControlFor('assets/index-C4d5e6.js')).toBe(IMMUTABLE_CACHE)
    expect(cacheControlFor('assets/PT_Serif-Web-Regular-M3n4o5.ttf')).toBe(IMMUTABLE_CACHE)
    expect(cacheControlFor('assets/deep/nested/index-C4d5e6.css')).toBe(IMMUTABLE_CACHE)
  })

  it('revalidates root-level files that are not hash-named', () => {
    expect(cacheControlFor('favicon.ico')).toBe(REVALIDATE_CACHE)
    expect(cacheControlFor('404.html')).toBe(REVALIDATE_CACHE)
  })
})

describe('isValidBucketName', () => {
  it('accepts the production bucket name', () => {
    expect(isValidBucketName('foreverjourney-web')).toBe(true)
  })

  it('rejects invalid or suspicious names', () => {
    expect(isValidBucketName('TalentForge')).toBe(false) // uppercase
    expect(isValidBucketName('ab')).toBe(false) // too short
    expect(isValidBucketName('a..b')).toBe(false) // empty label
    expect(isValidBucketName('')).toBe(false)
    expect(isValidBucketName(undefined)).toBe(false)
  })
})

describe('validateEndpoint', () => {
  it('accepts the VK Cloud endpoint', () => {
    const result = validateEndpoint('https://hb.ru-msk.vkcloud-storage.ru')
    expect(result.ok).toBe(true)
    expect(result.url.hostname).toBe('hb.ru-msk.vkcloud-storage.ru')
  })

  it('rejects non-http(s) schemes and malformed or credentialed URLs', () => {
    expect(validateEndpoint('ftp://hb.ru-msk.vkcloud-storage.ru').ok).toBe(false)
    expect(validateEndpoint('not-a-url').ok).toBe(false)
    expect(validateEndpoint('https://key:secret@hb.ru-msk.vkcloud-storage.ru').ok).toBe(false)
  })

  it('requires https for real uploads, dry runs may use http', () => {
    const real = validateEndpoint('http://hb.ru-msk.vkcloud-storage.ru', { network: true })
    expect(real.ok).toBe(false)
    expect(real.error).toMatch(/https/)
    expect(
      validateEndpoint('http://hb.ru-msk.vkcloud-storage.ru', { network: false }).ok,
    ).toBe(true)
  })

  it('blocks loopback and private hosts for real uploads', () => {
    for (const url of [
      'http://localhost:9000',
      'http://127.0.0.1:9000',
      'http://10.0.0.5',
      'http://172.16.0.5',
      'http://192.168.1.5',
      'http://169.254.169.254',
      'http://[::1]:9000',
      'http://224.0.0.1',
    ]) {
      expect(validateEndpoint(url, { network: true }).ok).toBe(false)
    }
  })

  it('allows private hosts for dry runs, where no request is made', () => {
    expect(validateEndpoint('http://localhost:9000', { network: false }).ok).toBe(true)
  })
})

describe('isPrivateHost', () => {
  it('classifies host kinds without DNS lookups', () => {
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('sub.localhost')).toBe(true)
    expect(isPrivateHost('0.0.0.0')).toBe(true)
    expect(isPrivateHost('::ffff:10.0.0.1')).toBe(true)
    expect(isPrivateHost('hb.ru-msk.vkcloud-storage.ru')).toBe(false)
    expect(isPrivateHost('8.8.8.8')).toBe(false)
  })
})

describe('isAllowedTarget', () => {
  it('pins the production bucket, endpoint and public URL', () => {
    expect(PRODUCTION_TARGET.bucket).toBe('foreverjourney-web')
    expect(PRODUCTION_TARGET.endpoint).toBe('https://hb.ru-msk.vkcloud-storage.ru')
    expect(PRODUCTION_TARGET.publicUrl).toBe('https://journal.mythweld.com')
  })

  it('accepts only the exact production endpoint regardless of case or trailing slash', () => {
    expect(isAllowedTarget('foreverjourney-web', 'https://hb.ru-msk.vkcloud-storage.ru')).toBe(true)
    expect(isAllowedTarget('foreverjourney-web', 'https://HB.RU-MSK.VKCLOUD-STORAGE.RU/')).toBe(true)
  })

  it('rejects third-party endpoints, plain http, other buckets and garbage', () => {
    expect(isAllowedTarget('foreverjourney-web', 'https://s3.amazonaws.com')).toBe(false)
    expect(
      isAllowedTarget('foreverjourney-web', 'https://hb.ru-msk.vkcloud-storage.ru.evil.example'),
    ).toBe(false)
    expect(isAllowedTarget('foreverjourney-web', 'http://hb.ru-msk.vkcloud-storage.ru')).toBe(false)
    expect(isAllowedTarget('talentforge', 'https://hb.ru-msk.vkcloud-storage.ru')).toBe(false)
    expect(isAllowedTarget('foreverjourney-web', 'not-a-url')).toBe(false)
  })
})

describe('buildPutObjectInput', () => {
  it('carries metadata only — no ACL, objects stay bucket-policy governed', async () => {
    const dir = makeDist({ 'index.html': '<html></html>' })
    const input = await buildPutObjectInput(
      'foreverjourney-web',
      dir,
      planUploads(dir)[0],
    )
    expect(Object.keys(input).sort()).toEqual([
      'Body',
      'Bucket',
      'CacheControl',
      'ContentType',
      'Key',
    ])
    expect('ACL' in input).toBe(false)
    expect(input.Bucket).toBe('foreverjourney-web')
    expect(input.Key).toBe('index.html')
    expect(input.ContentType).toBe('text/html; charset=utf-8')
    expect(input.CacheControl).toBe(REVALIDATE_CACHE)
    expect(String(input.Body)).toBe('<html></html>')
  })
})

describe('deploy-s3.mjs logging', () => {
  it('never passes the access keys to console output', async () => {
    const source = await readFile(new URL('./deploy-s3.mjs', import.meta.url), 'utf8')
    expect(source).not.toMatch(
      /console\.\w+\([^)]*(S3_ACCESS_KEY_ID|S3_SECRET_ACCESS_KEY|accessKeyId|secretAccessKey)/s,
    )
  })
})

describe('planUploads', () => {
  it('plans every file with its type, cache policy and size', () => {
    const dir = makeDist({
      'index.html': '<html></html>',
      'assets/index-C4d5e6.js': 'console.log(1)',
      'assets/index-F7g8h9.css': 'body{}',
      'assets/PT_Serif-Web-Regular-M3n4o5.ttf': 'font-bytes',
    })
    const plan = planUploads(dir)
    expect(plan.map((p) => p.key)).toEqual([
      'assets/PT_Serif-Web-Regular-M3n4o5.ttf',
      'assets/index-C4d5e6.js',
      'assets/index-F7g8h9.css',
      'index.html',
    ])
    const html = plan.find((p) => p.key === 'index.html')
    expect(html.contentType).toBe('text/html; charset=utf-8')
    expect(html.cacheControl).toBe(REVALIDATE_CACHE)
    expect(html.size).toBe('<html></html>'.length)
    const font = plan.find((p) => p.key === 'assets/PT_Serif-Web-Regular-M3n4o5.ttf')
    expect(font.cacheControl).toBe(IMMUTABLE_CACHE)
  })

  it('fails on a missing directory or a build without index.html', () => {
    expect(() => planUploads(join(tmpdir(), 'fj-deploy-does-not-exist'))).toThrow(/not found/)
    const broken = makeDist({ 'assets/app-C4d5e6.js': 'x' })
    expect(() => planUploads(broken)).toThrow(/index\.html/)
  })
})
