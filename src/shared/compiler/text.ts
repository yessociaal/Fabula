import type { Scalar } from '../model'

function escapeBasic(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r\n?|\n/g, '\\n')
}

/** Steps 1 to 3 of the escaping rules, wrapped in double quotes. */
export function pythonString(s: string): string {
  return `"${escapeBasic(s)}"`
}

const KEPT_TAGS = ['{b}', '{/b}', '{i}', '{/i}', '{u}', '{/u}']

/** Escapes text for a Ren'Py say, menu or prompt string (without the surrounding quotes). */
export function escapeSayText(text: string, knownVariableNames: Iterable<string>): string {
  const known = new Set(knownVariableNames)
  const s = escapeBasic(text)
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '[') {
      const m = /^\[([^[\]]*)\]/.exec(s.slice(i))
      if (m && known.has(m[1])) {
        out += m[0]
        i += m[0].length
      } else {
        out += '[['
        i += 1
      }
    } else if (ch === '{') {
      const tag = KEPT_TAGS.find((t) => s.startsWith(t, i))
      if (tag) {
        out += tag
        i += tag.length
      } else {
        out += '{{'
        i += 1
      }
    } else if (ch === '%') {
      out += '%%'
      i += 1
    } else {
      out += ch
      i += 1
    }
  }
  return out
}

export function pythonNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(n)
}

export function pythonValue(v: Scalar): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return pythonNumber(v)
  return pythonString(v)
}

/** Durations always show at least one decimal: 1 -> "1.0", 1.5 -> "1.5". */
export function pythonDuration(n: number): string {
  if (!Number.isFinite(n)) return '0.0'
  return Number.isInteger(n) ? n.toFixed(1) : String(n)
}
