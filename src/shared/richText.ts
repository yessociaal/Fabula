/** A run of dialogue text with its style, or a line break. */
export type RichSpan = { kind: 'text'; text: string; bold: boolean; italic: boolean; underline: boolean } | { kind: 'br' }

const STYLE_TAG = /^(\/?)([biu])$/

/**
 * Turn Ren'Py-style dialogue text into styled spans.
 * - `{b}` `{i}` `{u}` and their closing tags set bold, italic, underline. Any other `{tag}` is ignored.
 * - `{{` and `[[` are literal `{` and `[`.
 * - `[name]` becomes `variable(name)` when that returns a string, otherwise stays as written.
 * - A newline is a line break.
 */
export function parseRichText(text: string, variable?: (name: string) => string | undefined): RichSpan[] {
  const spans: RichSpan[] = []
  let depth = { b: 0, i: 0, u: 0 }
  let buffer = ''

  const flush = (): void => {
    if (buffer === '') return
    const style = { bold: depth.b > 0, italic: depth.i > 0, underline: depth.u > 0 }
    const last = spans[spans.length - 1]
    if (last && last.kind === 'text' && last.bold === style.bold && last.italic === style.italic && last.underline === style.underline) {
      last.text += buffer
    } else {
      spans.push({ kind: 'text', text: buffer, ...style })
    }
    buffer = ''
  }

  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '\n') {
      flush()
      spans.push({ kind: 'br' })
      i++
    } else if (ch === '{') {
      if (text[i + 1] === '{') {
        buffer += '{'
        i += 2
        continue
      }
      const close = text.indexOf('}', i + 1)
      if (close < 0) {
        buffer += ch
        i++
        continue
      }
      const m = STYLE_TAG.exec(text.slice(i + 1, close))
      if (m) {
        flush()
        const key = m[2] as 'b' | 'i' | 'u'
        depth = { ...depth, [key]: m[1] ? Math.max(0, depth[key] - 1) : depth[key] + 1 }
      }
      i = close + 1
    } else if (ch === '[') {
      if (text[i + 1] === '[') {
        buffer += '['
        i += 2
        continue
      }
      const close = text.indexOf(']', i + 1)
      if (close < 0) {
        buffer += ch
        i++
        continue
      }
      const name = text.slice(i + 1, close)
      const value = variable?.(name)
      buffer += value !== undefined ? value : `[${name}]`
      i = close + 1
    } else {
      buffer += ch
      i++
    }
  }
  flush()
  return spans
}
