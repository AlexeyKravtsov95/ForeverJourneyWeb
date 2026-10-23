// A safe, non-executing parser for World of Warcraft SavedVariables files.
//
// SavedVariables are Lua source, but they are produced by WoW's serializer and
// contain nothing but assignments of literal tables, strings, numbers and
// booleans. This parser accepts exactly that subset with a hand-written
// tokenizer and never evaluates anything: no eval, no Function, no Lua VM.
// Anything outside the subset — operators, function calls, `local`, loops,
// long-bracket strings, block comments — is rejected with a PARSE_ERROR.
//
// The input is scanned as raw bytes so that `\ddd` string escapes (raw bytes,
// used by the serializer for binary-ish keys) and literal UTF-8 runs both
// decode correctly. Errors report a line number only, never file contents.

export const MAX_FILE_BYTES = 32 * 1024 * 1024
export const MAX_DEPTH = 64
export const MAX_VALUES = 500_000
export const MAX_FIELDS_PER_TABLE = 100_000
export const MAX_STRING_BYTES = 1024 * 1024

export type LuaTable = { [key: string]: LuaValue }
export type LuaValue = string | number | boolean | LuaTable

export type LuaParseErrorCode =
  | 'EMPTY_INPUT'
  | 'FILE_TOO_LARGE'
  | 'PARSE_ERROR'
  | 'TOO_DEEP'
  | 'TOO_MANY_VALUES'
  | 'STRING_TOO_LONG'

export type LuaParseResult =
  | { ok: true; globals: Record<string, LuaValue> }
  | { ok: false; code: LuaParseErrorCode; line: number }

const isDigit = (b: number) => b >= 0x30 && b <= 0x39
const isHexDigit = (b: number) => isDigit(b) || ((b | 0x20) >= 0x61 && (b | 0x20) <= 0x66)
const isIdentStart = (b: number) => ((b | 0x20) >= 0x61 && (b | 0x20) <= 0x7a) || b === 0x5f
const isIdentPart = (b: number) => isIdentStart(b) || isDigit(b)

// Decimal, float and hex numerals in the exact shapes WoW's "%.14g" serializer
// can emit ("3", "-1.5", "1e+15", "0x10"). Anything else fails the regex.
const NUMBER_RE = /^(?:0[xX][0-9a-fA-F]+|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/

// String escapes of Lua 5.1, which is what WoW embeds. \ddd is a decimal byte
// value (0–255). \x, \z and \u{...} belong to newer Lua versions and WoW never
// writes them — they are rejected.
const SIMPLE_ESCAPES: Record<number, number> = {
  0x61: 0x07, // \a
  0x62: 0x08, // \b
  0x66: 0x0c, // \f
  0x6e: 0x0a, // \n
  0x72: 0x0d, // \r
  0x74: 0x09, // \t
  0x76: 0x0b, // \v
  0x5c: 0x5c, // \\
  0x22: 0x22, // \"
  0x27: 0x27, // \'
}

const decoder = new TextDecoder('utf-8') // non-fatal: bad bytes become U+FFFD

class Parser {
  private pos = 0
  private line = 1
  private values = 0

  constructor(private readonly src: Uint8Array) {}

  parse(): LuaParseResult {
    // A UTF-8 BOM is tolerated at the very start of the file.
    if (
      this.src.length >= 3 &&
      this.src[0] === 0xef &&
      this.src[1] === 0xbb &&
      this.src[2] === 0xbf
    ) {
      this.pos = 3
    }
    const globals: Record<string, LuaValue> = {}
    this.skipSpace()
    while (this.pos < this.src.length) {
      const name = this.readIdentifier()
      this.expectByte(0x3d) // '='
      const value = this.readValue(0)
      if (value !== undefined) globals[name] = value
      this.skipSpace()
      // Lua allows stray semicolons between statements; WoW never writes them.
      while (this.peek() === 0x3b) {
        this.pos++
        this.skipSpace()
      }
    }
    return { ok: true, globals }
  }

  // ---------- whitespace and comments ----------

  private skipSpace(): void {
    for (;;) {
      const b = this.peek()
      if (b === 0x20 || b === 0x09 || b === 0x0d) {
        this.pos++
      } else if (b === 0x0a) {
        this.line++
        this.pos++
      } else if (b === 0x2d && this.src[this.pos + 1] === 0x2d) {
        // line comment only; "--[" starts a block comment, which the
        // serializer never emits — reject it as an unsupported construct
        if (this.src[this.pos + 2] === 0x5b) this.fail()
        this.pos += 2
        while (this.pos < this.src.length && this.src[this.pos] !== 0x0a) this.pos++
      } else {
        return
      }
    }
  }

  // ---------- literals ----------

  private countValue(): void {
    if (++this.values > MAX_VALUES) this.failCode('TOO_MANY_VALUES')
  }

  private readValue(depth: number): LuaValue | undefined {
    this.skipSpace()
    this.countValue()
    const b = this.peek()
    if (b === 0x7b) return this.readTable(depth) // '{'
    if (b === 0x22 || b === 0x27) return this.readString(b)
    if (isDigit(b) || b === 0x2d || b === 0x2e) return this.readNumber()
    if (isIdentStart(b)) {
      const word = this.readIdentifier()
      if (word === 'true') return true
      if (word === 'false') return false
      if (word === 'nil') return undefined
      // any other identifier is a variable reference or a function call —
      // SavedVariables never contain those
      this.fail()
    }
    this.fail()
  }

  private readTable(depth: number): LuaTable {
    if (depth >= MAX_DEPTH) this.failCode('TOO_DEEP')
    this.pos++ // consume '{'
    const table: LuaTable = {}
    let fields = 0
    let nextIndex = 1
    for (;;) {
      this.skipSpace()
      const b = this.peek()
      if (b === 0x7d) {
        this.pos++
        return table
      }
      if (b === 0x2c || b === 0x3b) {
        // stray/trailing separator before `}` — Lua tolerates it
        this.pos++
        continue
      }
      if (fields >= MAX_FIELDS_PER_TABLE) this.failCode('TOO_MANY_VALUES')
      fields++

      let key: string
      if (b === 0x5b) {
        // '[' key ']' '=' value
        this.pos++
        this.skipSpace()
        const kb = this.peek()
        if (kb === 0x22 || kb === 0x27) key = this.readString(kb)
        else if (isDigit(kb) || kb === 0x2d || kb === 0x2e) key = numberKey(this.readNumber())
        else this.fail()
        this.skipSpace()
        this.expectByte(0x5d) // ']'
        this.expectByte(0x3d) // '='
      } else if (isIdentStart(b)) {
        // bare `name = value` string key (valid Lua; WoW always brackets, but
        // hand-edited files may not)
        const save = this.pos
        const name = this.readIdentifier()
        this.skipSpace()
        if (this.peek() === 0x3d) {
          this.pos++
          key = name
        } else {
          // not a keyed field after all — rewind and parse as positional value
          this.pos = save
          key = String(nextIndex)
          nextIndex++
          this.assign(table, key, this.readValue(depth + 1))
          this.skipSeparator()
          continue
        }
      } else {
        key = String(nextIndex)
        nextIndex++
      }

      const value = this.readValue(depth + 1)
      this.assign(table, key, value)
      this.skipSeparator()
    }
  }

  /** nil assignments remove the key, matching Lua table semantics. */
  private assign(table: LuaTable, key: string, value: LuaValue | undefined): void {
    if (value === undefined) delete table[key]
    else table[key] = value
  }

  /** Consumes one optional ',' or ';' after a table field. */
  private skipSeparator(): void {
    this.skipSpace()
    const b = this.peek()
    if (b === 0x2c || b === 0x3b) this.pos++
  }

  private readString(quote: number): string {
    this.pos++ // consume the opening quote
    const bytes: number[] = []
    for (;;) {
      if (this.pos >= this.src.length) this.fail()
      const b = this.src[this.pos]
      if (b === quote) {
        this.pos++
        return decoder.decode(new Uint8Array(bytes))
      }
      if (b === 0x5c) {
        // backslash escape
        this.pos++
        const e = this.src[this.pos]
        if (e === undefined) this.fail()
        if (e === 0x0a) {
          // escaped newline: line continuation, emits nothing
          this.line++
          this.pos++
          continue
        }
        if (e === 0x0d) {
          // escaped CRLF continuation
          if (this.src[this.pos + 1] === 0x0a) this.pos++
          this.line++
          this.pos++
          continue
        }
        const simple = SIMPLE_ESCAPES[e]
        if (simple !== undefined) {
          this.pushByte(bytes, simple)
          this.pos++
          continue
        }
        if (isDigit(e)) {
          let value = 0
          let digits = 0
          while (digits < 3 && isDigit(this.src[this.pos])) {
            value = value * 10 + (this.src[this.pos] - 0x30)
            this.pos++
            digits++
          }
          if (value > 255) this.fail()
          this.pushByte(bytes, value)
          continue
        }
        this.fail() // \x, \z, \u{...}, \<space>… — not Lua 5.1 / not WoW
      }
      if (b >= 0 && b < 0x20 && b !== 0x09) this.fail()
      this.pushByte(bytes, b)
      this.pos++
    }
  }

  private pushByte(bytes: number[], b: number): void {
    if (bytes.length >= MAX_STRING_BYTES) this.failCode('STRING_TOO_LONG')
    bytes.push(b)
  }

  private readNumber(): number {
    const start = this.pos
    if (this.peek() === 0x2d) this.pos++ // leading '-'
    let sawExponent = false
    for (;;) {
      const b = this.src[this.pos]
      const plain =
        isHexDigit(b) ||
        b === 0x2e ||
        (!sawExponent && (b === 0x78 || b === 0x58)) ||
        (b | 0x20) === 0x65
      if (!plain && !(sawExponent && (b === 0x2b || b === 0x2d))) break
      if ((b | 0x20) === 0x65) sawExponent = true
      this.pos++
    }
    const text = this.ascii(start, this.pos)
    const value = NUMBER_RE.test(text) ? Number(text) : NaN
    if (!Number.isFinite(value)) this.fail()
    return value
  }

  // ---------- plumbing ----------

  private readIdentifier(): string {
    this.skipSpace()
    if (!isIdentStart(this.peek())) this.fail()
    const start = this.pos
    while (isIdentPart(this.src[this.pos])) this.pos++
    return this.ascii(start, this.pos)
  }

  private expectByte(byte: number): void {
    this.skipSpace()
    if (this.peek() !== byte) this.fail()
    this.pos++
  }

  private peek(): number {
    return this.src[this.pos] ?? -1
  }

  private ascii(from: number, to: number): string {
    let out = ''
    for (let i = from; i < to; i++) out += String.fromCharCode(this.src[i])
    return out
  }

  private fail(): never {
    throw new ParseFailure('PARSE_ERROR', this.line)
  }

  private failCode(code: LuaParseErrorCode): never {
    throw new ParseFailure(code, this.line)
  }
}

class ParseFailure extends Error {
  constructor(readonly code: LuaParseErrorCode, readonly line: number) {
    super(code)
  }
}

function numberKey(value: number): string {
  return String(value)
}

/**
 * Parses the literal-assignment subset of Lua that WoW SavedVariables use.
 * The result maps every top-level `Name = value` assignment; `nil` assignments
 * are skipped. Pure function, no side effects, nothing is executed.
 */
export function parseLuaAssignments(source: Uint8Array | string): LuaParseResult {
  const bytes = typeof source === 'string' ? new TextEncoder().encode(source) : source
  if (bytes.length === 0) return { ok: false, code: 'EMPTY_INPUT', line: 1 }
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, code: 'FILE_TOO_LARGE', line: 1 }
  try {
    return new Parser(bytes).parse()
  } catch (error) {
    if (error instanceof ParseFailure) return { ok: false, code: error.code, line: error.line }
    return { ok: false, code: 'PARSE_ERROR', line: 1 }
  }
}

/**
 * Collects the array part of a Lua table: values of the integer keys 1..n in
 * order. Non-integer keys are ignored; gaps keep only the present indices
 * (in ascending order). Tables without integer keys give an empty array.
 */
export function luaToArray(table: LuaValue): LuaValue[] {
  if (typeof table !== 'object' || table === null || Array.isArray(table)) return []
  return Object.keys(table)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1)
    .sort((a, b) => a - b)
    .map((n) => table[String(n)])
}
