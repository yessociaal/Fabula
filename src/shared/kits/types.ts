import type { AssetKind } from '../model'

/** What every field of a kit form has. `key` names the value inside `params`; `label` is the form label. */
interface FieldBase {
  key: string
  label: string
  help?: string
}

export interface SelectOption {
  value: string
  label: string
}

export type KitField =
  | (FieldBase & { type: 'text'; default?: string; placeholder?: string })
  | (FieldBase & { type: 'multiline'; default?: string; placeholder?: string })
  | (FieldBase & { type: 'number'; default?: number; min?: number; max?: number; step?: number })
  | (FieldBase & { type: 'boolean'; default?: boolean })
  | (FieldBase & { type: 'select'; options: (string | SelectOption)[]; default?: string })
  | (FieldBase & { type: 'color'; default?: string })
  | (FieldBase & { type: 'variable'; varType?: 'boolean' | 'number' | 'text' })
  | (FieldBase & { type: 'character' })
  | (FieldBase & { type: 'asset'; kind: AssetKind })
  | (FieldBase & { type: 'effects' })
  | (FieldBase & { type: 'condition' })
  | (FieldBase & { type: 'list'; itemLabel?: string; fields: KitField[] })

export type KitFieldType = KitField['type']

export const KIT_FIELD_TYPES: readonly KitFieldType[] = [
  'text',
  'multiline',
  'number',
  'boolean',
  'select',
  'color',
  'variable',
  'character',
  'asset',
  'effects',
  'condition',
  'list'
]

/** Which list items become exits of a kit ending. */
export interface KitExitsRule {
  /** Key of a top-level `list` field. */
  list: string
  /** Key of a boolean field of the list items. When it is true the item is an exit. Left out: every item is an exit. */
  when?: string
  /** Name of the exit, written like `{{word}}` with the keys of the list items. */
  name: string
}

interface KitPartBase {
  /** Unique inside the kit. */
  type: string
  name: string
  /** lucide icon name in kebab case (`message-square`, `eraser`); an unknown name falls back to a puzzle piece. */
  icon?: string
  fields: KitField[]
  /** Path inside the kit folder of the template file. */
  template: string
}

export interface KitBlockDef extends KitPartBase {
  /** One-line description for the block row, `{{key}}` only. */
  summary?: string
}

export interface KitEndingDef extends KitPartBase {
  summary?: string
  exits?: KitExitsRule
}

export interface KitFileRule {
  /** Path inside the kit folder. */
  from: string
  /** Path inside the game folder. */
  to: string
}

export interface KitManifest {
  id: string
  name: string
  description?: string
  formatVersion: 1
  files: KitFileRule[]
  blocks: KitBlockDef[]
  endings: KitEndingDef[]
  /** Export the kit's files only when a block or ending of the kit is used (default: whenever the kit is enabled). */
  onlyWhenUsed?: boolean
}

export type KitSource = 'built-in' | 'story'

/** A kit that was read from a folder. Either `manifest` is set (loaded) or `error` says why it could not be. */
export interface LoadedKit {
  id: string
  source: KitSource
  /** Absolute folder (empty in the browser mock). */
  folder: string
  /** Set for a story kit that replaces a built-in kit with the same id. */
  note?: string
  manifest: KitManifest | null
  error: string | null
  /** Template file text by manifest path (`templates/session.txt`). */
  templates: Record<string, string>
  /** The files to copy into the game, with their text. */
  files: { from: string; to: string; content: string }[]
}

/** What the pure functions need to know about kits. Pass it as the last argument; leaving it out means no kits are installed. */
export interface KitContext {
  kits?: readonly LoadedKit[]
}

export function findKit(ctx: KitContext | undefined, id: string): LoadedKit | undefined {
  return ctx?.kits?.find((k) => k.id === id)
}

export function findBlockDef(kit: LoadedKit | undefined, blockType: string): KitBlockDef | undefined {
  return kit?.manifest?.blocks.find((b) => b.type === blockType)
}

export function findEndingDef(kit: LoadedKit | undefined, endingType: string): KitEndingDef | undefined {
  return kit?.manifest?.endings.find((e) => e.type === endingType)
}

export function selectOptions(field: Extract<KitField, { type: 'select' }>): SelectOption[] {
  return field.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
}
