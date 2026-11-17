import type { Condition, Effect } from '../model'
import { selectOptions, type KitEndingDef, type KitField } from './types'

/** The value a field has before anyone has touched it. */
export function defaultFieldValue(field: KitField): unknown {
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'color':
      return field.default ?? ''
    case 'number':
      return field.default ?? 0
    case 'boolean':
      return field.default ?? false
    case 'select':
      return field.default ?? selectOptions(field)[0]?.value ?? ''
    case 'variable':
    case 'character':
    case 'asset':
    case 'condition':
      return null
    case 'effects':
    case 'list':
      return []
  }
}

/** Params for a new block or ending: every field with its default. */
export function defaultParams(fields: readonly KitField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) out[f.key] = defaultFieldValue(f)
  return out
}

/** The value of a field in `params`, falling back to its default when the key is missing. */
export function fieldValue(field: KitField, params: Record<string, unknown>): unknown {
  return Object.prototype.hasOwnProperty.call(params, field.key) ? params[field.key] : defaultFieldValue(field)
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The items of a list field's value (anything that is not an object is dropped). */
export function listItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function asEffects(value: unknown): Effect[] {
  return Array.isArray(value) ? (value.filter(isRecord) as unknown as Effect[]) : []
}

export function asCondition(value: unknown): Condition | null {
  return isRecord(value) && Array.isArray(value.clauses) ? (value as unknown as Condition) : null
}

/** Whether a value counts as "filled in" for `{{#if key}}`. */
export function isTruthy(field: KitField, value: unknown): boolean {
  switch (field.type) {
    case 'boolean':
      return value === true
    case 'text':
    case 'multiline':
    case 'color':
    case 'select':
      return typeof value === 'string' && value.trim() !== ''
    case 'number':
      return typeof value === 'number' && value !== 0
    case 'variable':
    case 'character':
    case 'asset':
      return typeof value === 'string' && value !== ''
    case 'effects':
      return asEffects(value).length > 0
    case 'condition':
      return (asCondition(value)?.clauses.length ?? 0) > 0
    case 'list':
      return listItems(value).length > 0
  }
}

/** A new item for a list field, with its own id and every field at its default. */
export function newListItem(field: Extract<KitField, { type: 'list' }>, id: string): Record<string, unknown> {
  return { id, ...defaultParams(field.fields) }
}

/** The text of a scalar value for `{{key}}` in summaries and names. Other kinds of value give ''. */
export function plainText(field: KitField, value: unknown): string {
  switch (field.type) {
    case 'text':
    case 'multiline':
    case 'color':
    case 'select':
      return typeof value === 'string' ? value : ''
    case 'number':
      return typeof value === 'number' ? String(value) : ''
    case 'boolean':
      return value === true ? 'True' : 'False'
    default:
      return ''
  }
}

/** Fill `{{key}}` in `template` from `values`, using the field kinds to print each value. Unknown keys print nothing. */
export function interpolate(template: string, fields: readonly KitField[], values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_m, key: string) => {
    const field = fields.find((f) => f.key === key)
    return field ? plainText(field, fieldValue(field, values)) : ''
  })
}

/** One line for a kit block: the manifest `summary` filled in, or the block name when it has none. */
export function summaryLine(summary: string | undefined, name: string, fields: readonly KitField[], params: Record<string, unknown>): string {
  return summary === undefined ? name : interpolate(summary, fields, params)
}

/** The items an ending's `exits` rule turns into exits, in list order. */
export function exitItems(def: KitEndingDef, params: Record<string, unknown>): Record<string, unknown>[] {
  const rule = def.exits
  if (!rule) return []
  const list = def.fields.find((f) => f.key === rule.list)
  if (!list || list.type !== 'list') return []
  const items = listItems(fieldValue(list, params))
  const when = rule.when === undefined ? undefined : list.fields.find((f) => f.key === rule.when)
  return items.filter((item) => typeof item.id === 'string' && (when === undefined || fieldValue(when, item) === true))
}
