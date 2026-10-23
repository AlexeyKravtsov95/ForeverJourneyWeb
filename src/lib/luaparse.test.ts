import { describe, expect, it } from 'vitest'
import { luaToArray, parseLuaAssignments, MAX_DEPTH, MAX_FILE_BYTES, MAX_STRING_BYTES } from './luaparse'

const ok = (source: string) => {
  const result = parseLuaAssignments(source)
  if (!result.ok) throw new Error(`expected ok, got ${result.code} at line ${result.line}`)
  return result.globals
}

const fails = (source: string | Uint8Array) => {
  const result = parseLuaAssignments(source)
  if (result.ok) throw new Error('expected a parse failure')
  return result
}

describe('literals and tables', () => {
  it('parses the WoW serialization style: bracketed keys, nested tables, CRLF', () => {
    const globals = ok(
      'ForeverJourneyDB = {\r\n\t["schemaVersion"] = 3,\r\n\t["characters"] = {\r\n\t\t["Гордунни:Аэлириэн"] = {\r\n\t\t\t["createdAt"] = 1741199000,\r\n\t\t},\r\n\t},\r\n}\r\n'
    )
    const db = globals.ForeverJourneyDB as {
      schemaVersion: number
      characters: Record<string, { createdAt: number }>
    }
    expect(db.schemaVersion).toBe(3)
    expect(db.characters['Гордунни:Аэлириэн'].createdAt).toBe(1741199000)
  })

  it('parses numbers in every shape WoW writes: int, float, exponent, hex, negative', () => {
    const globals = ok(
      'A = { ["a"] = 42, ["b"] = -1.5, ["c"] = 1e+15, ["d"] = 0x10, ["e"] = .5, ["f"] = -0.001, ["g"] = 1712345678, }'
    )
    const a = globals.A as Record<string, number>
    expect(a).toEqual({ a: 42, b: -1.5, c: 1e15, d: 16, e: 0.5, f: -0.001, g: 1712345678 })
  })

  it('parses booleans and skips nil assignments', () => {
    const globals = ok('X = { ["yes"] = true, ["no"] = false, ["gone"] = nil, ["kept"] = "v" }\nY = nil\n')
    expect(globals.X).toEqual({ yes: true, no: false, kept: 'v' })
    expect('Y' in globals).toBe(false)
  })

  it('parses string keys, numeric keys and bare identifier keys', () => {
    const globals = ok('T = { ["name"] = "a", [1] = "one", [2.5] = "x", plain = "b" }')
    expect(globals.T).toEqual({ name: 'a', '1': 'one', '2.5': 'x', plain: 'b' })
  })

  it('parses positional array fields, separators and empty tables', () => {
    const globals = ok('L = { "a", "b", { "inner" }, ; }\nE = { }\n')
    expect(globals.L).toEqual({ '1': 'a', '2': 'b', '3': { '1': 'inner' } })
    expect(globals.E).toEqual({})
  })

  it('keeps duplicate keys last-wins like Lua assignment', () => {
    const globals = ok('D = { ["k"] = "first", ["k"] = "second" }')
    expect(globals.D).toEqual({ k: 'second' })
  })

  it('accepts line comments and a UTF-8 BOM', () => {
    const bom = new Uint8Array([
      0xef, 0xbb, 0xbf, ...new TextEncoder().encode('-- leading comment\nV = 1\n'),
    ])
    const result = parseLuaAssignments(bom)
    expect(result.ok).toBe(true)
  })
})

describe('string escapes', () => {
  it('decodes simple escapes and decimal byte escapes', () => {
    const globals = ok(String.raw`S = "line\nbreak\ttab\"quoted\"\\back\065\66"`)
    expect(globals.S).toBe('line\nbreak\ttab"quoted"\\backAB')
  })

  it('decodes \\ddd sequences that split a UTF-8 character into bytes', () => {
    // "Ф" is D0 A4 in UTF-8
    const globals = ok('K = "\\208\\164"')
    expect(globals.K).toBe('Ф')
  })

  it('keeps literal UTF-8 text and mixed literal/escaped content', () => {
    const globals = ok('M = "Привет, \\nмир"')
    expect(globals.M).toBe('Привет, \nмир')
  })

  it('supports single quotes and escaped line continuation', () => {
    const globals = ok("Q = 'a\\b' \nW = 'one\\\ntwo'")
    expect(globals.Q).toBe('a\b')
    expect(globals.W).toBe('onetwo')
  })

  it('rejects invalid escapes, raw newlines and unterminated strings', () => {
    expect(fails('X = "\\x41"').code).toBe('PARSE_ERROR')
    expect(fails('X = "\\z   "').code).toBe('PARSE_ERROR')
    expect(fails('X = "\\u{41}"').code).toBe('PARSE_ERROR')
    expect(fails('X = "\\256"').code).toBe('PARSE_ERROR')
    expect(fails('X = "raw\nnewline"').code).toBe('PARSE_ERROR')
    expect(fails('X = "unterminated').code).toBe('PARSE_ERROR')
  })
})

describe('rejects executable Lua', () => {
  it('rejects function calls and method calls', () => {
    expect(fails('os.execute("rm -rf /")').code).toBe('PARSE_ERROR')
    expect(fails('X = string.rep("A", 100)').code).toBe('PARSE_ERROR')
    expect(fails('X = ("a"):upper()').code).toBe('PARSE_ERROR')
  })

  it('rejects statements, operators and concatenation', () => {
    expect(fails('while true do end').code).toBe('PARSE_ERROR')
    expect(fails('local x = 1').code).toBe('PARSE_ERROR')
    expect(fails('return 1').code).toBe('PARSE_ERROR')
    expect(fails('X = "a" .. "b"').code).toBe('PARSE_ERROR')
    expect(fails('X = 1 + 2').code).toBe('PARSE_ERROR')
    expect(fails('X = setmetatable({}, {})').code).toBe('PARSE_ERROR')
    expect(fails('loadstring("print(1)")()').code).toBe('PARSE_ERROR')
    expect(fails('for i = 1, 10 do end').code).toBe('PARSE_ERROR')
  })

  it('rejects long-bracket strings, block comments and malformed tables', () => {
    expect(fails('X = [[long]]').code).toBe('PARSE_ERROR')
    expect(fails('X = [==[long]==]').code).toBe('PARSE_ERROR')
    expect(fails('--[[ block comment ]]\nX = 1').code).toBe('PARSE_ERROR')
    expect(fails('X = { ["k"] = "v"').code).toBe('PARSE_ERROR')
    expect(fails('X = }').code).toBe('PARSE_ERROR')
    expect(fails('X = { ["k"] }').code).toBe('PARSE_ERROR')
    expect(fails('X = { [k] = 1 }').code).toBe('PARSE_ERROR') // bare key must be a literal
  })

  it('reports a line number and never leaks file contents into the error', () => {
    const failure = fails('SECRET_VALUE = "s3cr3t"\nos.execute("rm")')
    expect(failure.code).toBe('PARSE_ERROR')
    expect(failure.line).toBe(2)
    expect(JSON.stringify(failure)).not.toContain('s3cr3t')
  })
})

describe('limits', () => {
  it('rejects empty input and oversized files', () => {
    const empty = parseLuaAssignments('')
    expect(empty).toMatchObject({ ok: false, code: 'EMPTY_INPUT' })
    const huge = new Uint8Array(MAX_FILE_BYTES + 1)
    const result = parseLuaAssignments(huge)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('FILE_TOO_LARGE')
  })

  it('rejects nesting deeper than the depth limit', () => {
    const deep = 'X = ' + '{'.repeat(MAX_DEPTH + 2) + '}'.repeat(MAX_DEPTH + 2)
    const result = parseLuaAssignments(deep)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('TOO_DEEP')
    // exactly at the limit is fine
    expect(parseLuaAssignments('X = ' + '{'.repeat(MAX_DEPTH) + '}'.repeat(MAX_DEPTH)).ok).toBe(true)
  })

  it('rejects strings beyond the per-string byte cap', () => {
    const bomb = 'X = "' + 'a'.repeat(MAX_STRING_BYTES + 1) + '"'
    const result = parseLuaAssignments(bomb)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('STRING_TOO_LONG')
  })

  it('bounds the total number of parsed values', () => {
    const many = 'X = {' + Array.from({ length: 200_001 }, (_, i) => i).join(',') + '}'
    const result = parseLuaAssignments(many)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('TOO_MANY_VALUES')
  })
})

describe('luaToArray', () => {
  it('collects the array part in order and ignores named keys', () => {
    const globals = ok('M = { [1] = "a", [2] = "b", [3] = "c", ["named"] = "x" }')
    expect(luaToArray(globals.M as never)).toEqual(['a', 'b', 'c'])
  })

  it('sorts sparse integer keys and tolerates non-tables', () => {
    const globals = ok('M = { [3] = "c", [1] = "a" }')
    expect(luaToArray(globals.M as never)).toEqual(['a', 'c'])
    expect(luaToArray('plain' as never)).toEqual([])
    expect(luaToArray(42 as never)).toEqual([])
  })
})
