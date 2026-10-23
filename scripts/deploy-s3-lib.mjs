// Pure helpers for scripts/deploy-s3.mjs. No side effects beyond reading the
// dist/ tree, so npm test can cover MIME types, cache policy, endpoint
// validation and bucket-name rules without touching the network.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

// Explicit content types for everything a Vite build of this project emits
// plus common extras; the S3 API has no MIME guessing of its own.
export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.svgz': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
}

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable'
export const REVALIDATE_CACHE = 'public, max-age=0, must-revalidate'

export function contentTypeFor(key) {
  const dot = key.lastIndexOf('.')
  const ext = dot === -1 ? '' : key.slice(dot).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

// Vite emits content-hashed files under assets/ — the hash changes whenever
// the content does, so they are safe to cache forever. Everything else
// (index.html, any future root-level file) must always be revalidated.
export function cacheControlFor(key) {
  return key.startsWith('assets/') ? IMMUTABLE_CACHE : REVALIDATE_CACHE
}

const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/

export function isValidBucketName(name) {
  return typeof name === 'string' && BUCKET_RE.test(name) && !name.includes('..')
}

// The one production publish target. The deploy refuses to send signed S3
// requests anywhere else, no matter what environment variables say — the
// allowlist is checked before the S3 client is created.
export const PRODUCTION_TARGET = {
  bucket: 'foreverjourney-web',
  endpoint: 'https://hb.ru-msk.vkcloud-storage.ru',
  publicUrl: 'https://journal.mythweld.com',
}

export function isAllowedTarget(bucket, endpoint) {
  if (bucket !== PRODUCTION_TARGET.bucket) return false
  let origin = ''
  try {
    origin = new URL(endpoint).origin
  } catch {
    return false
  }
  return origin === new URL(PRODUCTION_TARGET.endpoint).origin
}

function isIPv4(host) {
  const parts = host.split('.')
  return (
    parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  )
}

// Loopback, private, CGNAT, link-local, multicast and reserved IPv4/IPv6
// addresses plus localhost-style names. Used to keep the deploy script from
// ever sending S3 credentials to a non-public endpoint.
export function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true
  if (isIPv4(host)) {
    const [a, b] = host.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }
  if (host.includes(':')) {
    const h = host.replace(/^\[|\]$/g, '')
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) {
      return true
    }
    const mapped = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
    return mapped !== null && isPrivateHost(mapped[1])
  }
  return false
}

// The deploy script only talks to http/https endpoints. Real uploads
// (`network: true`) must use HTTPS and are additionally checked against
// loopback/private/reserved addresses; dry runs make no request at all, so
// they tolerate plain http for inspecting a plan.
export function validateEndpoint(raw, { network = true } = {}) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: `endpoint is not a valid URL: ${raw}` }
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: `endpoint protocol must be http or https, got ${url.protocol}` }
  }
  if (url.username || url.password) {
    return { ok: false, error: 'endpoint URL must not contain credentials' }
  }
  if (network && url.protocol !== 'https:') {
    return { ok: false, error: 'production uploads require an https endpoint' }
  }
  if (network && isPrivateHost(url.hostname)) {
    return {
      ok: false,
      error: `endpoint host is a loopback/private/reserved address: ${url.hostname}`,
    }
  }
  return { ok: true, url }
}

function toPosix(path) {
  return sep === '\\' ? path.split(sep).join('/') : path
}

function collectKeys(dir, base, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) collectKeys(full, base, out)
    else if (entry.isFile()) out.push(toPosix(relative(base, full)))
  }
  return out
}

// Builds the upload plan for a build output directory. Throws when the
// directory is missing or has no index.html — an upload without the entry
// page would leave the site broken.
export function planUploads(distDir) {
  if (!existsSync(distDir)) {
    throw new Error(`dist directory not found: ${distDir}`)
  }
  const keys = collectKeys(distDir, distDir, []).sort()
  if (!keys.includes('index.html')) {
    throw new Error(`index.html is missing from ${distDir}`)
  }
  return keys.map((key) => ({
    key,
    contentType: contentTypeFor(key),
    cacheControl: cacheControlFor(key),
    size: statSync(join(distDir, key)).size,
  }))
}

// The full PutObjectCommand input. Deliberately carries no ACL: public
// reading is granted by the bucket policy (anonymous s3:GetObject only),
// objects stay under the bucket owner's control.
export async function buildPutObjectInput(bucket, distDir, item) {
  return {
    Bucket: bucket,
    Key: item.key,
    Body: await readFile(join(distDir, item.key)),
    ContentType: item.contentType,
    CacheControl: item.cacheControl,
  }
}
