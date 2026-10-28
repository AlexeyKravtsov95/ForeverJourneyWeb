import { useEffect, useState } from 'react'
import { checkSiteAvailable } from './externalLinks'

/**
 * True only after the site answered the availability probe. The link must
 * never render for a dead site, so it starts hidden and stays hidden on any
 * failure — including offline visitors. Server rendering never runs the
 * effect, so server-rendered markup contains no probe and no link.
 */
export function useSiteAvailable(url: string): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let cancelled = false
    checkSiteAvailable(url).then((ok) => {
      if (!cancelled) setAvailable(ok)
    })
    return () => {
      cancelled = true
    }
  }, [url])
  return available
}
