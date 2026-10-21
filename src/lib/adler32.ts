const MOD_ADLER = 65521
const NMAX = 5552

/** Adler-32 checksum (RFC 1950) over a byte array. */
export function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  let i = 0
  while (i < data.length) {
    const end = Math.min(i + NMAX, data.length)
    for (; i < end; i++) {
      a += data[i]
      b += a
    }
    a %= MOD_ADLER
    b %= MOD_ADLER
  }
  return ((b << 16) | a) >>> 0
}
