import type { Condition, Effect } from '../model'
import { pythonNumber, pythonString } from '../compiler/text'
import { asCondition, asEffects, fieldValue, isTruthy, listItems } from './fields'
import type { KitField } from './types'

/** A mistake in a template. `line` is the 1-based line of the template file. Never thrown at the player: the validator shows it on the block. */
export class TemplateError extends Error {
  readonly line: number
  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`)
    this.name = 'TemplateError'
    this.line = line
  }
}

/** What a template needs from the story. The compiler builds one for every block and ending it renders. */
export interface TemplateHost {
  /** `{{@label}}`: the label of the scene the block or ending is in. */
  label: string
  /** Quoted, escaped like dialogue. */
  text(value: string): string
  /** Exported name of a variable (how Python refers to it) or a character. Null when it no longer exists. */
  name(kind: 'variable' | 'character', id: string): string | null
  /** Exported game-relative path of an asset. Null when the file cannot be used. */
  path(assetId: string): string | null
  /** One `$ ...` line per usable effect. */
  effects(effects: Effect[]): string[]
  /** A Python expression. */
  condition(condition: Condition): string
  /** `{{@exit}}`: the label the exit of the list item leads to, or null. */
  exitLabel(itemId: string): string | null
}

const RENDERERS = ['text', 'py', 'name', 'path', 'effects', 'condition', 'lines'] as const
const TRANSFORMS = ['lower', 'trim'] as const
const AT_NAMES = ['label', 'index', 'exit', 'first', 'last'] as const
type AtName = (typeof AT_NAMES)[number]

type Ref = { kind: 'key'; key: string } | { kind: 'at'; name: AtName }

type Node =
  | { t: 'text'; s: string }
  | { t: 'out'; ref: Ref; filters: string[]; line: number; indent: string | null; newline: boolean }
  | { t: 'each'; key: string; body: Node[]; line: number }
  | { t: 'if'; ref: Ref; then: Node[]; otherwise: Node[]; line: number }

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/

function lineOf(src: string, index: number): number {
  let n = 1
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++
  return n
}

function parseRef(text: string, line: number): Ref {
  if (text.startsWith('@')) {
    const name = text.slice(1)
    if (!(AT_NAMES as readonly string[]).includes(name)) {
      throw new TemplateError(`unknown {{${text}}}. The names that start with @ are ${AT_NAMES.map((n) => `@${n}`).join(', ')}.`, line)
    }
    return { kind: 'at', name: name as AtName }
  }
  if (!KEY.test(text)) throw new TemplateError(`"${text}" is not a key. Keys start with a letter and use letters, numbers and underscores.`, line)
  return { kind: 'key', key: text }
}

/** Parse a template into nodes. Throws TemplateError for unbalanced or malformed tags and unknown filters. */
export function parseTemplate(source: string): Node[] {
  const src = source.replace(/\r\n?/g, '\n')
  const root: Node[] = []
  interface Open {
    node: Extract<Node, { t: 'each' | 'if' }>
    list: Node[]
    inElse: boolean
  }
  const stack: Open[] = []
  const current = (): Node[] => (stack.length === 0 ? root : stack[stack.length - 1].list)

  const tag = /\{\{([\s\S]*?)\}\}/g
  let cursor = 0
  let m: RegExpExecArray | null
  const pushText = (s: string): void => {
    if (s !== '') current().push({ t: 'text', s })
  }
  while ((m = tag.exec(src)) !== null) {
    const line = lineOf(src, m.index)
    const inner = m[1].trim()
    const lineStart = src.lastIndexOf('\n', m.index - 1) + 1
    let lineEnd = src.indexOf('\n', m.index + m[0].length)
    const hasNewline = lineEnd !== -1
    if (lineEnd === -1) lineEnd = src.length
    const before = src.slice(lineStart, m.index)
    const after = src.slice(m.index + m[0].length, lineEnd)
    const alone = /^[ \t]*$/.test(before) && /^[ \t]*$/.test(after)

    // A block tag that is alone on its line takes the whole line with it; an output tag alone on its line keeps the line's indentation.
    const start = alone ? lineStart : m.index
    const end = alone ? (hasNewline ? lineEnd + 1 : lineEnd) : m.index + m[0].length
    pushText(src.slice(cursor, start))
    cursor = end

    if (inner === '') throw new TemplateError('an empty {{ }} tag. Put a key inside it.', line)
    if (inner.startsWith('#each')) {
      const key = inner.slice(5).trim()
      if (!KEY.test(key)) throw new TemplateError('{{#each}} needs the key of a list, like {{#each commands}}.', line)
      const node: Node = { t: 'each', key, body: [], line }
      current().push(node)
      stack.push({ node, list: node.body, inElse: false })
    } else if (inner.startsWith('#if')) {
      const ref = parseRef(inner.slice(3).trim(), line)
      const node: Node = { t: 'if', ref, then: [], otherwise: [], line }
      current().push(node)
      stack.push({ node, list: node.then, inElse: false })
    } else if (inner === 'else') {
      const top = stack[stack.length - 1]
      if (!top || top.node.t !== 'if') throw new TemplateError('{{else}} without a matching {{#if}}.', line)
      if (top.inElse) throw new TemplateError('a second {{else}} in the same {{#if}}.', line)
      top.inElse = true
      top.list = top.node.otherwise
    } else if (inner === '/each' || inner === '/if') {
      const want = inner === '/each' ? 'each' : 'if'
      const top = stack[stack.length - 1]
      if (!top) throw new TemplateError(`{{${inner}}} without a matching {{#${want}}}.`, line)
      if (top.node.t !== want) {
        throw new TemplateError(`{{${inner}}} closes the wrong tag: the open one is {{#${top.node.t}}} from line ${top.node.line}.`, line)
      }
      stack.pop()
    } else if (inner.startsWith('#') || inner.startsWith('/')) {
      throw new TemplateError(`unknown tag {{${inner}}}. The block tags are {{#each key}}, {{#if key}}, {{else}}, {{/each}} and {{/if}}.`, line)
    } else {
      const [head, ...filters] = inner.split('|').map((s) => s.trim())
      const ref = parseRef(head, line)
      checkFilterShape(filters, line)
      current().push({ t: 'out', ref, filters, line, indent: alone ? before : null, newline: alone && hasNewline })
    }
  }
  pushText(src.slice(cursor))
  const open = stack[stack.length - 1]
  if (open) throw new TemplateError(`{{#${open.node.t}}} is never closed. Add {{/${open.node.t}}}.`, open.node.line)
  return root
}

function checkFilterShape(filters: string[], line: number): void {
  filters.forEach((f, i) => {
    const isTransform = (TRANSFORMS as readonly string[]).includes(f)
    const isRenderer = (RENDERERS as readonly string[]).includes(f)
    if (!isTransform && !isRenderer) {
      throw new TemplateError(`unknown filter "${f}". The filters are ${[...RENDERERS, ...TRANSFORMS].join(', ')}.`, line)
    }
    if (isRenderer && i !== filters.length - 1) throw new TemplateError(`the filter "${f}" must come last (${TRANSFORMS.join(' and ')} can come before it).`, line)
  })
}

interface Scope {
  fields: readonly KitField[]
  values: Record<string, unknown>
  /** Set inside {{#each}}. */
  item?: { index: number; count: number; id: string | null }
}

function findField(scopes: Scope[], key: string): { field: KitField; value: unknown } | null {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const field = scopes[i].fields.find((f) => f.key === key)
    if (field) return { field, value: fieldValue(field, scopes[i].values) }
  }
  return null
}

function itemScope(scopes: Scope[], line: number, what: string): Scope & { item: NonNullable<Scope['item']> } {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const item = scopes[i].item
    if (item) return { ...scopes[i], item }
  }
  throw new TemplateError(`${what} can only be used inside {{#each}}.`, line)
}

/** Whether filters make sense for a field type, as a message, or null. */
function filterProblem(field: KitField, filters: string[]): string | null {
  const last = filters[filters.length - 1]
  const renderer = last !== undefined && (RENDERERS as readonly string[]).includes(last) ? last : null
  const hasTransform = filters.some((f) => (TRANSFORMS as readonly string[]).includes(f))
  const t = field.type
  const scalar = t === 'text' || t === 'multiline' || t === 'number' || t === 'boolean' || t === 'select' || t === 'color'
  if (hasTransform && !(t === 'text' || t === 'multiline' || t === 'select' || t === 'color')) {
    return `"${field.key}" is not text, so lower and trim cannot be used on it`
  }
  if (renderer === null) {
    if (scalar) return null
    const hint: Record<string, string> = {
      variable: '|name',
      character: '|name',
      asset: '|path',
      effects: '|effects',
      condition: '|condition',
      list: '{{#each}}'
    }
    return `"${field.key}" needs ${hint[t]} here (it is not plain text)`
  }
  const okFor: Record<string, boolean> = {
    text: scalar,
    py: scalar,
    lines: t === 'text' || t === 'multiline',
    name: t === 'variable' || t === 'character',
    path: t === 'asset',
    effects: t === 'effects',
    condition: t === 'condition'
  }
  return okFor[renderer] ? null : `the filter "${renderer}" cannot be used on "${field.key}", which is a ${t} field`
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? pythonNumber(value) : typeof value === 'boolean' ? (value ? 'True' : 'False') : ''
}

function applyFilters(field: KitField, value: unknown, filters: string[], host: TemplateHost, line: number): string {
  const problem = filterProblem(field, filters)
  if (problem) throw new TemplateError(problem, line)
  let v = value
  for (const f of filters) {
    if (f === 'lower') v = stringOf(v).toLowerCase()
    else if (f === 'trim') v = stringOf(v).trim()
  }
  const last = filters[filters.length - 1]
  switch (last) {
    case 'text':
      return host.text(stringOf(v))
    case 'py':
      return typeof v === 'string' ? pythonString(v) : stringOf(v)
    case 'lines': {
      const s = stringOf(v)
      return s.trim() === '' ? '' : s.split(/\r?\n/).map((l) => host.text(l)).join(', ')
    }
    case 'name': {
      if (typeof v !== 'string' || v === '') throw new TemplateError(`"${field.key}" has nothing picked. Pick a ${field.type}.`, line)
      const name = host.name(field.type === 'character' ? 'character' : 'variable', v)
      if (name === null) throw new TemplateError(`the ${field.type} picked for "${field.key}" no longer exists. Pick another.`, line)
      return name
    }
    case 'path': {
      if (typeof v !== 'string' || v === '') throw new TemplateError(`"${field.key}" has no file picked. Pick one.`, line)
      const path = host.path(v)
      if (path === null) throw new TemplateError(`the file picked for "${field.key}" is missing or cannot be used here. Pick another.`, line)
      return path
    }
    case 'effects':
      return host.effects(asEffects(v)).join('\n')
    case 'condition': {
      const c = asCondition(v)
      return c === null ? 'True' : host.condition(c)
    }
    default:
      return stringOf(v)
  }
}

function refText(ref: Ref): string {
  return ref.kind === 'at' ? `@${ref.name}` : ref.key
}

function resolveRef(ref: Ref, scopes: Scope[], host: TemplateHost, line: number): { field: KitField | null; value: unknown } {
  if (ref.kind === 'key') {
    const found = findField(scopes, ref.key)
    if (!found) throw new TemplateError(`unknown key "${ref.key}". This part has no field with that key.`, line)
    return found
  }
  switch (ref.name) {
    case 'label':
      return { field: null, value: host.label }
    case 'index':
      return { field: null, value: itemScope(scopes, line, '{{@index}}').item.index }
    case 'first':
      return { field: null, value: itemScope(scopes, line, '{{@first}}').item.index === 0 }
    case 'last': {
      const { item } = itemScope(scopes, line, '{{@last}}')
      return { field: null, value: item.index === item.count - 1 }
    }
    case 'exit': {
      const { item } = itemScope(scopes, line, '{{@exit}}')
      return { field: null, value: item.id === null ? '' : (host.exitLabel(item.id) ?? '') }
    }
  }
}

function renderNodes(nodes: Node[], scopes: Scope[], host: TemplateHost): string {
  let out = ''
  for (const node of nodes) {
    if (node.t === 'text') out += node.s
    else if (node.t === 'out') {
      const { field, value } = resolveRef(node.ref, scopes, host, node.line)
      let text: string
      if (field === null) {
        if (node.filters.length > 0 && node.ref.kind === 'at' && node.ref.name !== 'index' && node.ref.name !== 'label' && node.ref.name !== 'exit') {
          throw new TemplateError(`{{${refText(node.ref)}}} is only for {{#if}}.`, node.line)
        }
        const s = stringOf(value)
        text = node.filters.length === 0 ? s : applyAtFilters(s, node.filters, host, node.line)
      } else text = applyFilters(field, value, node.filters, host, node.line)
      if (node.indent !== null) {
        if (text === '') continue
        out += text.split('\n').map((l) => (l === '' ? l : node.indent + l)).join('\n') + (node.newline ? '\n' : '')
      } else out += text
    } else if (node.t === 'each') {
      const found = findField(scopes, node.key)
      if (!found) throw new TemplateError(`unknown key "${node.key}". This part has no field with that key.`, node.line)
      if (found.field.type !== 'list') throw new TemplateError(`{{#each ${node.key}}} needs a list field, but "${node.key}" is a ${found.field.type} field.`, node.line)
      const items = listItems(found.value)
      const fields = found.field.fields
      items.forEach((item, index) => {
        const id = typeof item.id === 'string' ? item.id : null
        out += renderNodes(node.body, [...scopes, { fields, values: item, item: { index, count: items.length, id } }], host)
      })
    } else {
      const { field, value } = resolveRef(node.ref, scopes, host, node.line)
      const yes = field === null ? value === true || (typeof value === 'string' && value !== '') : isTruthy(field, value)
      out += renderNodes(yes ? node.then : node.otherwise, scopes, host)
    }
  }
  return out
}

function applyAtFilters(s: string, filters: string[], host: TemplateHost, line: number): string {
  let v = s
  for (const f of filters) {
    if (f === 'lower') v = v.toLowerCase()
    else if (f === 'trim') v = v.trim()
    else if (f === 'text') v = host.text(v)
    else if (f === 'py') v = pythonString(v)
    else throw new TemplateError(`the filter "${f}" cannot be used on a name that starts with @.`, line)
  }
  return v
}

/**
 * Fill in a template. The output starts at column 0: the caller indents it to where the block or ending sits.
 * Throws TemplateError. Never adds a comment and never evaluates anything.
 */
export function renderTemplate(source: string, fields: readonly KitField[], params: Record<string, unknown>, host: TemplateHost): string {
  const nodes = parseTemplate(source)
  const text = renderNodes(nodes, [{ fields, values: params }], host)
  return text.replace(/^\n+/, '').replace(/\s+$/, '')
}

/** Check a template against the fields of the block or ending it belongs to, without rendering it. Throws TemplateError. */
export function checkTemplate(source: string, fields: readonly KitField[]): void {
  const walk = (nodes: Node[], scopes: Scope[]): void => {
    for (const node of nodes) {
      if (node.t === 'text') continue
      if (node.t === 'out') {
        const ref = node.ref
        if (ref.kind === 'key') {
          const found = findField(scopes, ref.key)
          if (!found) throw new TemplateError(`unknown key "${ref.key}". This part has no field with that key.`, node.line)
          const problem = filterProblem(found.field, node.filters)
          if (problem) throw new TemplateError(problem, node.line)
        } else if (ref.name === 'index' || ref.name === 'exit' || ref.name === 'first' || ref.name === 'last') {
          itemScope(scopes, node.line, `{{@${ref.name}}}`)
        }
      } else if (node.t === 'each') {
        const found = findField(scopes, node.key)
        if (!found) throw new TemplateError(`unknown key "${node.key}". This part has no field with that key.`, node.line)
        if (found.field.type !== 'list') throw new TemplateError(`{{#each ${node.key}}} needs a list field, but "${node.key}" is a ${found.field.type} field.`, node.line)
        walk(node.body, [...scopes, { fields: found.field.fields, values: {}, item: { index: 0, count: 1, id: null } }])
      } else {
        if (node.ref.kind === 'key' && !findField(scopes, node.ref.key)) throw new TemplateError(`unknown key "${node.ref.key}". This part has no field with that key.`, node.line)
        if (node.ref.kind === 'at' && node.ref.name !== 'label') itemScope(scopes, node.line, `{{@${node.ref.name}}}`)
        walk(node.then, scopes)
        walk(node.otherwise, scopes)
      }
    }
  }
  walk(parseTemplate(source), [{ fields, values: {} }])
}
