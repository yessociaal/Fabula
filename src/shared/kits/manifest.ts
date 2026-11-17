import { z } from 'zod'
import { KIT_FIELD_TYPES, type KitField, type KitManifest } from './types'

const KEY = /^[A-Za-z][A-Za-z0-9_]*$/
const KIT_ID = /^[a-z][a-z0-9_-]{0,39}$/
const ASSET_KINDS = ['background', 'sprite', 'music', 'sound', 'ambient', 'voice', 'movie', 'ui', 'font'] as const

/** Game files Fabula or the Ren'Py project template owns. A kit may not write them (compared in lower case, with or without the `c` of a compiled file). */
const RESERVED_STEMS = ['script', 'gui', 'screens', 'options', 'interface']
const WINDOWS_BAD = /[<>:"|?*\u0000-\u001f]/

/**
 * Why `path` is not a safe relative path with forward slashes, or null when it is fine. Used for every path in a manifest:
 * nothing may be absolute, use backslashes or drive letters, or climb out of its folder with `..`.
 */
export function kitPathProblem(path: string): string | null {
  if (path.trim() === '') return 'is empty'
  if (path.includes('\\')) return 'uses a backslash; write paths with forward slashes'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'is an absolute path; it must be relative'
  if (WINDOWS_BAD.test(path)) return 'contains a character that is not allowed in file names'
  const parts = path.split('/')
  for (const part of parts) {
    if (part === '') return 'has an empty part (two slashes in a row, or a slash at the end)'
    if (part === '..') return 'uses ".." to leave its folder, which is not allowed'
    if (part === '.') return 'uses "." which is not allowed'
    if (/[. ]$/.test(part)) return 'has a part that ends with a dot or a space'
  }
  return null
}

/** Why a kit file may not be written to `to` (game-relative), or null. Chapter and script file names are checked against the story, not here. */
export function reservedTargetProblem(to: string): string | null {
  const lower = to.toLowerCase()
  if (lower === 'gui' || lower.startsWith('gui/')) return 'is inside the gui folder, which belongs to your game'
  const m = /^([^/]+)\.rpyc?$/.exec(lower)
  if (m && RESERVED_STEMS.includes(m[1])) return `is "${lower}", a file Fabula or your Ren'Py game already uses`
  return null
}

const key = z.string().regex(KEY, 'must start with a letter and use only letters, numbers and underscores')
const text = z.string().min(1)

const base = { key, label: text, help: z.string().optional() }

const fieldSchema: z.ZodType<KitField> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ ...base, type: z.literal('text'), default: z.string().optional(), placeholder: z.string().optional() }),
    z.strictObject({ ...base, type: z.literal('multiline'), default: z.string().optional(), placeholder: z.string().optional() }),
    z.strictObject({
      ...base,
      type: z.literal('number'),
      default: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional()
    }),
    z.strictObject({ ...base, type: z.literal('boolean'), default: z.boolean().optional() }),
    z.strictObject({
      ...base,
      type: z.literal('select'),
      options: z.array(z.union([z.string(), z.strictObject({ value: z.string(), label: z.string() })])).min(1, 'needs at least one option'),
      default: z.string().optional()
    }),
    z.strictObject({ ...base, type: z.literal('color'), default: z.string().optional() }),
    z.strictObject({ ...base, type: z.literal('variable'), varType: z.enum(['boolean', 'number', 'text']).optional() }),
    z.strictObject({ ...base, type: z.literal('character') }),
    z.strictObject({ ...base, type: z.literal('asset'), kind: z.enum(ASSET_KINDS) }),
    z.strictObject({ ...base, type: z.literal('effects') }),
    z.strictObject({ ...base, type: z.literal('condition') }),
    z.strictObject({ ...base, type: z.literal('list'), itemLabel: z.string().optional(), fields: z.array(fieldSchema) })
  ])
)

const part = {
  type: z.string().regex(KEY, 'must start with a letter and use only letters, numbers and underscores'),
  name: text,
  icon: z.string().optional(),
  fields: z.array(fieldSchema),
  template: text,
  summary: z.string().optional()
}

const manifestSchema = z.strictObject({
  id: z.string().regex(KIT_ID, 'must be 1 to 40 characters: lower-case letters, numbers, "-" or "_", starting with a letter'),
  name: text,
  description: z.string().optional(),
  formatVersion: z.literal(1, { error: 'must be 1' }),
  files: z.array(z.strictObject({ from: text, to: text })).default([]),
  blocks: z.array(z.strictObject(part)).default([]),
  endings: z
    .array(
      z.strictObject({
        ...part,
        exits: z.strictObject({ list: key, when: key.optional(), name: text }).optional()
      })
    )
    .default([]),
  onlyWhenUsed: z.boolean().optional()
})

function pathText(path: readonly PropertyKey[]): string {
  let out = ''
  for (const p of path) out += typeof p === 'number' ? `[${p + 1}]` : out === '' ? String(p) : `.${String(p)}`
  return out
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const at = pathText(issue.path)
  const where = at === '' ? 'kit.json' : `kit.json, ${at}`
  if (issue.code === 'invalid_union' && issue.path[issue.path.length - 1] === 'type') {
    return `${where}: unknown field type. Use one of: ${KIT_FIELD_TYPES.join(', ')}.`
  }
  if (issue.code === 'unrecognized_keys') {
    return `${where}: unknown ${issue.keys.length === 1 ? 'key' : 'keys'} ${issue.keys.map((k) => `"${k}"`).join(', ')}.`
  }
  if (issue.code === 'invalid_type' && issue.input === undefined) return `${where}: is required.`
  return `${where}: ${issue.message}`
}

/** Every key used at one level of fields must be unique; lists are checked inside as well. */
function fieldProblems(fields: KitField[], where: string, out: string[]): void {
  const seen = new Set<string>()
  for (const f of fields) {
    if (seen.has(f.key)) out.push(`${where}: two fields are both called "${f.key}". Field keys must be unique.`)
    seen.add(f.key)
    if (f.type === 'list') fieldProblems(f.fields, `${where}, list "${f.key}"`, out)
    if (f.type === 'select') {
      const values = f.options.map((o) => (typeof o === 'string' ? o : o.value))
      if (f.default !== undefined && !values.includes(f.default)) out.push(`${where}, field "${f.key}": the default "${f.default}" is not one of the options.`)
    }
  }
}

const TEMPLATE_KEY = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g

/** The rules that need more than one field to check: unique names, exits that point at real fields, safe paths. */
function crossProblems(m: KitManifest): string[] {
  const out: string[] = []
  const seenBlocks = new Set<string>()
  for (const b of m.blocks) {
    if (seenBlocks.has(b.type)) out.push(`kit.json: two blocks are both of type "${b.type}". Block types must be unique.`)
    seenBlocks.add(b.type)
    fieldProblems(b.fields, `kit.json, block "${b.type}"`, out)
    const why = kitPathProblem(b.template)
    if (why) out.push(`kit.json, block "${b.type}": the template path "${b.template}" ${why}.`)
  }
  const seenEndings = new Set<string>()
  for (const e of m.endings) {
    if (seenEndings.has(e.type)) out.push(`kit.json: two endings are both of type "${e.type}". Ending types must be unique.`)
    seenEndings.add(e.type)
    const where = `kit.json, ending "${e.type}"`
    fieldProblems(e.fields, where, out)
    const why = kitPathProblem(e.template)
    if (why) out.push(`${where}: the template path "${e.template}" ${why}.`)
    if (e.exits) {
      const list = e.fields.find((f) => f.key === e.exits?.list)
      if (!list || list.type !== 'list') {
        out.push(`${where}: exits.list is "${e.exits.list}" but there is no list field with that key.`)
      } else {
        const items = list.fields
        if (e.exits.when !== undefined) {
          const when = items.find((f) => f.key === e.exits?.when)
          if (!when || when.type !== 'boolean') out.push(`${where}: exits.when is "${e.exits.when}" but the items of "${list.key}" have no true/false field with that key.`)
        }
        for (const match of e.exits.name.matchAll(TEMPLATE_KEY)) {
          if (!items.some((f) => f.key === match[1])) out.push(`${where}: exits.name uses {{${match[1]}}}, which is not a field of the items of "${list.key}".`)
        }
      }
    }
  }
  const seenTo = new Set<string>()
  for (const f of m.files) {
    const from = kitPathProblem(f.from)
    if (from) out.push(`kit.json, files: the "from" path "${f.from}" ${from}.`)
    const to = kitPathProblem(f.to)
    if (to) out.push(`kit.json, files: the "to" path "${f.to}" ${to}.`)
    else {
      const reserved = reservedTargetProblem(f.to)
      if (reserved) out.push(`kit.json, files: the "to" path "${f.to}" ${reserved}.`)
      if (seenTo.has(f.to.toLowerCase())) out.push(`kit.json, files: two files are both copied to "${f.to}".`)
      seenTo.add(f.to.toLowerCase())
    }
  }
  return out
}

export type ManifestResult = { ok: true; manifest: KitManifest } | { ok: false; errors: string[]; error: string }

/** Check a parsed `kit.json`. Every error is a plain sentence that names the part of the file it is about. */
export function parseKitManifest(raw: unknown): ManifestResult {
  const parsed = manifestSchema.safeParse(raw)
  if (!parsed.success) {
    const errors = parsed.error.issues.map(describeIssue)
    return { ok: false, errors, error: errors.join('\n') }
  }
  const manifest = parsed.data as KitManifest
  const errors = crossProblems(manifest)
  if (errors.length > 0) return { ok: false, errors, error: errors.join('\n') }
  return { ok: true, manifest }
}
