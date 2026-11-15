import { describe, expect, it } from 'vitest'
import { parseRichText } from '@shared/richText'

const plain = (t: string, v?: (n: string) => string | undefined): string =>
  parseRichText(t, v)
    .map((s) => (s.kind === 'br' ? '|' : s.text))
    .join('')

describe('parseRichText', () => {
  it('returns one plain span for plain text', () => {
    expect(parseRichText('Hello')).toEqual([{ kind: 'text', text: 'Hello', bold: false, italic: false, underline: false }])
  })
  it('renders b / i / u tags as styles', () => {
    expect(parseRichText('a{b}b{/b}{i}c{/i}{u}d{/u}e')).toEqual([
      { kind: 'text', text: 'a', bold: false, italic: false, underline: false },
      { kind: 'text', text: 'b', bold: true, italic: false, underline: false },
      { kind: 'text', text: 'c', bold: false, italic: true, underline: false },
      { kind: 'text', text: 'd', bold: false, italic: false, underline: true },
      { kind: 'text', text: 'e', bold: false, italic: false, underline: false }
    ])
  })
  it('nests styles', () => {
    expect(parseRichText('{b}x{i}y{/i}{/b}')).toEqual([
      { kind: 'text', text: 'x', bold: true, italic: false, underline: false },
      { kind: 'text', text: 'y', bold: true, italic: true, underline: false }
    ])
  })
  it('ignores unknown tags and stray closing tags', () => {
    expect(plain('a{color=#f00}b{/color}c{w}d{/b}e')).toBe('abcde')
    expect(parseRichText('{/b}x')[0]).toMatchObject({ bold: false })
  })
  it('unescapes {{ and [[', () => {
    expect(plain('a {{b} [[c]')).toBe('a {b} [c]')
    expect(plain('{{b}}')).toBe('{b}}')
  })
  it('keeps an unclosed brace or bracket as written', () => {
    expect(plain('a { b [ c')).toBe('a { b [ c')
  })
  it('shows [name] literally without a resolver, and the value with one', () => {
    expect(plain('Hi [name]!')).toBe('Hi [name]!')
    expect(plain('Hi [name]!', (n) => (n === 'name' ? 'Al' : undefined))).toBe('Hi Al!')
    expect(plain('Hi [other]!', () => undefined)).toBe('Hi [other]!')
  })
  it('does not treat the inside of a resolved value as markup', () => {
    expect(plain('[v]', () => '{b}x')).toBe('{b}x')
    expect(parseRichText('[v]', () => '{b}x')[0]).toMatchObject({ bold: false })
  })
  it('turns newlines into line breaks', () => {
    expect(parseRichText('a\nb')).toEqual([
      { kind: 'text', text: 'a', bold: false, italic: false, underline: false },
      { kind: 'br' },
      { kind: 'text', text: 'b', bold: false, italic: false, underline: false }
    ])
  })
  it('handles the empty string', () => {
    expect(parseRichText('')).toEqual([])
  })
})
