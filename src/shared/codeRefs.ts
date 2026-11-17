/**
 * `@scene(Scene name)` (in a Ren'Py code block) and `@exit(name)` (in a code ending) are the only two things
 * Fabula changes inside code the author typed. They stand for a label that Fabula picks, and are replaced by it
 * on export. Everything else in the text is left exactly as it was written.
 */

export type RefTag = 'scene' | 'exit'

export interface CodeRef {
  /** Offsets in the text: `text.slice(start, end)` is the whole `@scene(...)` / `@exit(...)`. */
  start: number
  end: number
  /** The name written between the brackets (for an unknown name: the text up to the first `)` or line end). */
  name: string
  /** The name is one of the `names` that were passed in. */
  known: boolean
}

/**
 * Every `@tag(name)` in `text`, in order. A name is "known" when it is exactly one of `names` (so a name may itself
 * contain brackets, like `Act (1)`); otherwise the reference is reported as unknown.
 */
export function findCodeRefs(text: string, tag: RefTag, names: readonly string[]): CodeRef[] {
  const open = `@${tag}(`
  const candidates = [...new Set(names.filter((n) => n !== ''))].sort((a, b) => b.length - a.length)
  const out: CodeRef[] = []
  let from = 0
  for (;;) {
    const at = text.indexOf(open, from)
    if (at < 0) break
    const nameStart = at + open.length
    const hit = candidates.find((n) => text.startsWith(`${n})`, nameStart))
    if (hit !== undefined) {
      const end = nameStart + hit.length + 1
      out.push({ start: at, end, name: hit, known: true })
      from = end
      continue
    }
    let to = nameStart
    while (to < text.length && text[to] !== ')' && text[to] !== '\n') to++
    const end = text[to] === ')' ? to + 1 : to
    out.push({ start: at, end, name: text.slice(nameStart, to), known: false })
    from = Math.max(end, nameStart)
  }
  return out
}

/**
 * Replace every known `@tag(name)` by `replacement(name)`. A reference that is unknown, or whose replacement is
 * null, stays exactly as typed (the validator reports it before anything is exported).
 */
export function replaceCodeRefs(
  text: string,
  tag: RefTag,
  names: readonly string[],
  replacement: (name: string) => string | null
): string {
  const refs = findCodeRefs(text, tag, names)
  if (refs.length === 0) return text
  let out = ''
  let at = 0
  for (const ref of refs) {
    const label = ref.known ? replacement(ref.name) : null
    if (label === null) continue
    out += text.slice(at, ref.start) + label
    at = ref.end
  }
  return out + text.slice(at)
}

/** The first non-empty line of some code, trimmed on the right (for one-line summaries). Empty when there is none. */
export function firstCodeLine(code: string): string {
  for (const line of code.split('\n')) {
    if (line.trim() !== '') return line.trim()
  }
  return ''
}

/** Whether the text contains a `return` or `jump` anywhere (a heuristic for "this code leaves the scene"). */
export function mentionsLeaving(code: string): boolean {
  return /\b(return|jump)\b/.test(code)
}
