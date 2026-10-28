/**
 * External sites the landing links to (GROWTH-01). Both URLs are fixed
 * literals — the guards below keep an accidental edit from ever turning the
 * availability probe into a request to somewhere it must not go.
 */
export const ADDON_PAGE_URL = 'https://www.curseforge.com/wow/addons/forever-journey'
export const MYTHWELD_URL = 'https://mythweld.com/'

/** Default probe budget; past it the site counts as unreachable and the link stays hidden. */
const PROBE_TIMEOUT_MS = 6000

const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/** True for IPv4 ranges a public site can never live in (loopback, LAN, link-local, reserved). */
function isPrivateIpv4(host: string): boolean {
  if (!IPV4.test(host)) return false
  const octets = host.split('.').map(Number)
  if (octets.some((octet) => octet > 255)) return true // malformed → reject
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  )
}

/**
 * The URL parser normalizes IPv4-mapped IPv6 to hex groups (`::ffff:a00:1`
 * for 10.0.0.1), so the IPv4 tail must be reassembled from two hex groups.
 */
function ipv4FromMappedIpv6(host: string): string | null {
  const match = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!match) return null
  const hi = Number.parseInt(match[1], 16)
  const lo = Number.parseInt(match[2], 16)
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`
}

/**
 * A URL the page may fetch for the availability probe: https only, a bare
 * hostname (no credentials), and never localhost/loopback/private/reserved
 * addresses.
 */
export function isSafeExternalUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false
  if (host.includes(':')) {
    // IPv6 literal: loopback and unspecified, unique-local and link-local
    // scopes, and IPv4-mapped private ranges are all rejected
    const dotted = ipv4FromMappedIpv6(host)
    if (dotted) return !isPrivateIpv4(dotted)
    if (host === '::1' || host === '::') return false
    return !/^[fcel]/.test(host)
  }
  if (IPV4.test(host)) return !isPrivateIpv4(host)
  return true // a plain DNS name — only address literals need the range check
}

export interface AvailabilityOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Learns only whether the site answers at all — a `no-cors` probe returns an
 * opaque response, so nothing about the visitor or this page leaks either
 * way, and no credentials ride along. Any failure (DNS, refused connection,
 * timeout, offline) resolves to false: a link to a dead site must never
 * render, so no error path can flip it back on.
 */
export async function checkSiteAvailable(url: string, options: AvailabilityOptions = {}): Promise<boolean> {
  if (!isSafeExternalUrl(url)) return false
  const doFetch = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined)
  if (!doFetch) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PROBE_TIMEOUT_MS)
  try {
    await doFetch(url, {
      mode: 'no-cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
