import { describe, expect, it } from 'vitest'
import { escapeSayText, pythonDuration, pythonString, pythonValue } from '@shared/compiler/text'

const known = ['courage', 'name']
const say = (s: string): string => escapeSayText(s, known)

describe('escapeSayText (rules of 6.4)', () => {
  it('step 1: backslash is doubled', () => {
    expect(say('a\\b')).toBe('a\\\\b')
  })
  it('step 2: double quote is escaped', () => {
    expect(say('say "hi"')).toBe('say \\"hi\\"')
  })
  it('step 3: newline becomes backslash n', () => {
    expect(say('one\ntwo')).toBe('one\\ntwo')
    expect(say('one\r\ntwo')).toBe('one\\ntwo')
  })
  it('step 4: known [name] is kept', () => {
    expect(say('You have [courage] points')).toBe('You have [courage] points')
  })
  it('step 4: unknown [name] becomes [[', () => {
    expect(say('see [bogus] here')).toBe('see [[bogus] here')
  })
  it('step 4: lone [ and unclosed names become [[', () => {
    expect(say('a [ b')).toBe('a [[ b')
    expect(say('[courage')).toBe('[[courage')
    expect(say('[]')).toBe('[[]')
  })
  it('step 4: a doubled bracket: the first [ is doubled, the second is checked on its own', () => {
    expect(say('[[courage]')).toBe('[[[courage]')
  })
  it('step 4: names are case-sensitive', () => {
    expect(say('[Courage]')).toBe('[[Courage]')
  })
  it('step 4: with no known names every [ is doubled', () => {
    expect(escapeSayText('[courage]', [])).toBe('[[courage]')
  })
  it('step 5: whitelisted tags are kept', () => {
    expect(say('{b}a{/b} {i}b{/i} {u}c{/u}')).toBe('{b}a{/b} {i}b{/i} {u}c{/u}')
  })
  it('step 5: other braces are doubled', () => {
    expect(say('{color=#f00}x{/color}')).toBe('{{color=#f00}x{/color}')
    expect(say('{B}x')).toBe('{{B}x')
    expect(say('{ b}')).toBe('{{ b}')
    expect(say('{')).toBe('{{')
  })
  it('a closing brace alone is untouched', () => {
    expect(say('a } b')).toBe('a } b')
  })
  it('percent signs are doubled because Ren\'Py lint rejects a lone % in dialogue', () => {
    expect(say('100%')).toBe('100%%')
    expect(say('50% off\nok')).toBe('50%% off\\nok')
  })
  it('combined: all rules in one string', () => {
    expect(say('A "q" \\ [name] [x] {b}b{/b} {z} 100%\nend')).toBe(
      'A \\"q\\" \\\\ [name] [[x] {b}b{/b} {{z} 100%%\\nend'
    )
  })
  it('a backslash before [ is escaped and the name is still kept', () => {
    expect(say('\\[name]')).toBe('\\\\[name]')
  })
  it('empty text stays empty', () => {
    expect(say('')).toBe('')
  })
})

describe('pythonString', () => {
  it('applies steps 1 to 3 only and wraps in quotes', () => {
    expect(pythonString('Dr. "D" \\ x\ny')).toBe('"Dr. \\"D\\" \\\\ x\\ny"')
  })
  it('does not touch brackets, braces or percent signs', () => {
    expect(pythonString('[a] {b} 5%')).toBe('"[a] {b} 5%"')
  })
})

describe('pythonValue and pythonDuration', () => {
  it('booleans', () => {
    expect(pythonValue(true)).toBe('True')
    expect(pythonValue(false)).toBe('False')
  })
  it('integers print without decimals', () => {
    expect(pythonValue(3)).toBe('3')
    expect(pythonValue(-2)).toBe('-2')
    expect(pythonValue(0)).toBe('0')
  })
  it('other numbers use String(n)', () => {
    expect(pythonValue(2.5)).toBe('2.5')
  })
  it('strings are quoted and escaped', () => {
    expect(pythonValue('Bob "B"')).toBe('"Bob \\"B\\""')
  })
  it('durations always have one decimal', () => {
    expect(pythonDuration(1)).toBe('1.0')
    expect(pythonDuration(1.5)).toBe('1.5')
    expect(pythonDuration(0.25)).toBe('0.25')
    expect(pythonDuration(10)).toBe('10.0')
  })
})
