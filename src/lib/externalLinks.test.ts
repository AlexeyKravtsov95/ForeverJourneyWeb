import { describe, expect, it, vi } from 'vitest'
import { ADDON_PAGE_URL, MYTHWELD_URL, checkSiteAvailable, isSafeExternalUrl } from './externalLinks'

describe('isSafeExternalUrl', () => {
  it('accepts the two real link targets', () => {
    expect(isSafeExternalUrl(MYTHWELD_URL)).toBe(true)
    expect(isSafeExternalUrl(ADDON_PAGE_URL)).toBe(true)
  })

  it('accepts other public https sites but no other scheme', () => {
    expect(isSafeExternalUrl('https://example.com/some/path')).toBe(true)
    expect(isSafeExternalUrl('http://mythweld.com/')).toBe(false)
    expect(isSafeExternalUrl('ftp://example.com/')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('/relative/path')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('rejects hostnames that can never be a public site', () => {
    for (const url of [
      'https://localhost/',
      'https://app.localhost/',
      'https://router.local/',
      'https://127.0.0.1/',
      'https://127.8.8.8/',
      'https://0.0.0.0/',
      'https://10.1.2.3/',
      'https://192.168.1.1/',
      'https://172.16.0.1/',
      'https://172.31.255.255/',
      'https://169.254.169.254/',
      'https://100.64.0.1/',
      'https://192.0.2.1/',
      'https://224.0.0.1/',
      'https://255.255.255.255/',
      'https://[::1]/',
      'https://[fe80::1]/',
      'https://[fc00::1]/',
      'https://[::ffff:10.0.0.1]/',
      'https://[::ffff:127.0.0.1]/',
      'https://user:pass@mythweld.com/',
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(false)
    }
  })

  it('does not confuse public hosts with private ranges', () => {
    expect(isSafeExternalUrl('https://mythweld.com/')).toBe(true)
    expect(isSafeExternalUrl('https://104.16.0.1/')).toBe(true) // public IP outside private blocks
    expect(isSafeExternalUrl('https://172.32.0.1/')).toBe(true) // just past 172.16/12
    expect(isSafeExternalUrl('https://172.15.0.1/')).toBe(true)
    expect(isSafeExternalUrl('https://192.169.0.1/')).toBe(true)
  })
})

describe('checkSiteAvailable', () => {
  it('resolves true when the probe gets any answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ type: 'opaque' })
    await expect(checkSiteAvailable('https://mythweld.com/', { fetchImpl })).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mythweld.com/',
      expect.objectContaining({ mode: 'no-cors', credentials: 'omit' })
    )
  })

  it('resolves false when the network refuses or the name does not resolve', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(checkSiteAvailable('https://mythweld.com/', { fetchImpl })).resolves.toBe(false)
  })

  it('never probes and answers false for an unsafe URL', async () => {
    const fetchImpl = vi.fn()
    await expect(checkSiteAvailable('http://mythweld.com/', { fetchImpl })).resolves.toBe(false)
    await expect(checkSiteAvailable('https://localhost/', { fetchImpl })).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('gives up after the timeout budget and answers false', async () => {
    // a fetch that ignores everything and never settles — only the abort
    // timer can end the wait, and that path must answer false
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    await expect(
      checkSiteAvailable('https://mythweld.com/', { fetchImpl, timeoutMs: 20 })
    ).resolves.toBe(false)
  })

  it('answers false when fetch is not available at all', async () => {
    // stubbing the global: Node itself provides fetch, so `fetchImpl` left
    // unset would otherwise fall through to a real network probe
    vi.stubGlobal('fetch', undefined)
    await expect(checkSiteAvailable('https://mythweld.com/')).resolves.toBe(false)
    vi.unstubAllGlobals()
  })
})
