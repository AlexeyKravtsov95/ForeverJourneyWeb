/**
 * External sites the landing links to (GROWTH-01).
 */
export const ADDON_PAGE_URL = 'https://www.curseforge.com/wow/addons/forever-journey'
export const MYTHWELD_URL = 'https://mythweld.com/'

/**
 * Manual gate for the Mythweld credit (GROWTH-01 review). A runtime probe
 * cannot prove the page actually serves — an opaque no-cors response hides
 * the HTTP status, so a 404 would look "available" — and it would contact a
 * third-party domain from every visitor's browser. Flip this to true only
 * after checking that https://mythweld.com/ loads in a real browser; the
 * app itself never contacts the domain.
 */
export const MYTHWELD_LINK_ENABLED = false
