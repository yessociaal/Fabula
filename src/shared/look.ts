import { pythonString } from './compiler/text'

/**
 * The Look & Feel fields: every one is a single line of the Ren'Py game's gui.rpy or options.rpy (or, for pictures, a file in game/gui/).
 * This file is pure text work: it finds a field's line in a file's text, reads its value and prints a new value in the same place.
 * Nothing here touches the disk; src/main/look.ts does that.
 */

export type LookGroup = 'Colours' | 'Fonts' | 'Dialogue box' | 'Menus' | 'Game'
export const LOOK_GROUPS: readonly LookGroup[] = ['Colours', 'Fonts', 'Dialogue box', 'Menus', 'Game']

export type LookFile = 'gui.rpy' | 'options.rpy'
export type LookValueType = 'colour' | 'font-file' | 'number' | 'boolean' | 'text' | 'multiline' | 'image-file'

export type LookStatus = 'applied' | 'unchanged' | 'edited-by-hand' | 'not-found' | 'invalid'

export interface LookField {
  /** The Ren'Py name of the line (`gui.accent_color`), or a stable id for a picture (`gui/textbox.png`). */
  key: string
  label: string
  group: LookGroup
  /** The file that holds the line. For a picture, the file that is replaced is `imageTarget`. */
  file: LookFile
  type: LookValueType
  help?: string
  /** Shown but never applied (the exporter owns it). */
  readOnly?: boolean
  /** Picture fields: the file under game/ that an upload replaces. */
  imageTarget?: string
  /** Number fields. */
  min?: number
  integer?: boolean
  /** Line fields: `define` or `default`. */
  keyword?: 'define' | 'default'
  /**
   * The exact line this field is found by: anchored to the start of the line, tolerant of ' or " quotes, of the Color(...) form
   * of a colour and of trailing spaces and a trailing # comment. Named groups: head, value, tail. Absent for pictures and the multi-line about text.
   */
  pattern?: RegExp
  /** Any line that starts like this field's line. A line that matches this but not `pattern` is "edited by hand". */
  loose?: RegExp
}

const HEX = String.raw`(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})`
const COLOUR_TOKEN = String.raw`(?:'#${HEX}'|"#${HEX}"|Color\(\s*(?:'#${HEX}'|"#${HEX}")\s*\))`
const STRING_TOKEN = String.raw`(?:"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*')`
const NUMBER_TOKEN = String.raw`-?\d+(?:\.\d+)?`
const BOOLEAN_TOKEN = String.raw`(?:True|False)`

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function linePattern(keyword: 'define' | 'default', name: string, token: string, wrap?: { open: string; close: string }): RegExp {
  const n = escapeRegExp(name)
  const open = wrap ? escapeRegExp(wrap.open) : ''
  const close = wrap ? escapeRegExp(wrap.close) : ''
  return new RegExp(`^(?<head>${keyword}[ \\t]+${n}[ \\t]*=[ \\t]*${open})(?<value>${token})(?<tail>${close}[ \\t]*(?:#.*)?)$`)
}

const looseLine = (keyword: 'define' | 'default', name: string): RegExp => new RegExp(`^${keyword}[ \\t]+${escapeRegExp(name)}(?![\\w.])`)

const TOKENS: Record<Exclude<LookValueType, 'multiline' | 'image-file'>, string> = {
  colour: COLOUR_TOKEN,
  'font-file': STRING_TOKEN,
  number: NUMBER_TOKEN,
  boolean: BOOLEAN_TOKEN,
  text: STRING_TOKEN
}

type FieldInput = Omit<LookField, 'pattern' | 'loose' | 'keyword'> & {
  keyword?: 'define' | 'default'
  wrap?: { open: string; close: string }
}

function lineField(input: FieldInput): LookField {
  const { wrap, ...rest } = input
  const keyword = input.keyword ?? 'define'
  const field: LookField = { ...rest, keyword }
  if (input.type === 'image-file') return field
  field.loose = looseLine(keyword, input.key)
  if (input.type !== 'multiline') field.pattern = linePattern(keyword, input.key, TOKENS[input.type], wrap)
  return field
}

const colour = (key: string, label: string, help: string): LookField =>
  lineField({ key, label, group: 'Colours', file: 'gui.rpy', type: 'colour', help })
const font = (key: string, label: string, help: string): LookField =>
  lineField({ key, label, group: 'Fonts', file: 'gui.rpy', type: 'font-file', help })
const size = (key: string, label: string, help: string): LookField =>
  lineField({ key, label, group: 'Fonts', file: 'gui.rpy', type: 'number', integer: true, min: 1, help })
const position = (key: string, label: string, help: string, min?: number): LookField =>
  lineField({ key, label, group: 'Dialogue box', file: 'gui.rpy', type: 'number', integer: true, min, help })

export const LOOK_FIELDS: readonly LookField[] = [
  colour('gui.accent_color', 'Accent', 'Used to label and highlight text throughout the interface, and for character names.'),
  colour('gui.idle_color', 'Buttons, idle', 'The colour of a text button that is neither selected nor hovered.'),
  colour('gui.hover_color', 'Buttons, hover', 'The colour of a button or bar the mouse is over.'),
  colour('gui.text_color', 'Dialogue text', 'The colour of dialogue and of menu choices.'),
  colour('gui.interface_text_color', 'Interface text', 'The colour of text outside the story, such as menus and screens.'),

  font('gui.text_font', 'Dialogue font', 'The font of the story text. Upload a .ttf or .otf file in Assets, then choose it here.'),
  font('gui.name_text_font', 'Name font', 'The font of the speaker names.'),
  font('gui.interface_text_font', 'Interface font', 'The font of the menus and other text outside the story.'),
  size('gui.text_size', 'Dialogue size', 'The size of dialogue text, in pixels of the game screen.'),
  size('gui.name_text_size', 'Name size', 'The size of speaker names.'),
  size('gui.interface_text_size', 'Interface size', 'The size of menu and interface text.'),

  {
    key: 'gui/textbox.png',
    label: 'Text box picture',
    group: 'Dialogue box',
    file: 'gui.rpy',
    type: 'image-file',
    imageTarget: 'gui/textbox.png',
    help: 'Replaces gui/textbox.png, the picture behind the dialogue. A PNG.'
  },
  {
    key: 'gui/namebox.png',
    label: 'Name box picture',
    group: 'Dialogue box',
    file: 'gui.rpy',
    type: 'image-file',
    imageTarget: 'gui/namebox.png',
    help: 'Replaces gui/namebox.png, the picture behind the speaker name. A PNG.'
  },
  position('gui.textbox_height', 'Box height', 'How tall the dialogue box is.', 1),
  position('gui.dialogue_xpos', 'Text, left', 'Where the dialogue starts, counted from the left edge of the box.'),
  position('gui.dialogue_ypos', 'Text, top', 'Where the dialogue starts, counted from the top edge of the box.'),
  position('gui.dialogue_width', 'Text width', 'The widest a line of dialogue can get.', 1),
  position('gui.name_xpos', 'Name, left', 'Where the speaker name sits, counted from the left edge of the box.'),
  position('gui.name_ypos', 'Name, top', 'Where the speaker name sits, counted from the top edge of the box.'),

  lineField({
    key: 'gui.show_name',
    label: 'Show the game title on the main menu',
    group: 'Menus',
    file: 'options.rpy',
    type: 'boolean',
    help: 'Turn off to hide the title on the main menu.'
  }),
  {
    key: 'gui/main_menu.png',
    label: 'Main menu picture',
    group: 'Menus',
    file: 'gui.rpy',
    type: 'image-file',
    imageTarget: 'gui/main_menu.png',
    help: 'Replaces gui/main_menu.png, the picture behind the main menu. A PNG, as large as the game screen.'
  },
  {
    key: 'gui/game_menu.png',
    label: 'Game menu picture',
    group: 'Menus',
    file: 'gui.rpy',
    type: 'image-file',
    imageTarget: 'gui/game_menu.png',
    help: 'Replaces gui/game_menu.png, the picture behind save, load and preferences. A PNG, as large as the game screen.'
  },

  lineField({
    key: 'config.name',
    label: 'Game name',
    group: 'Game',
    file: 'options.rpy',
    type: 'text',
    readOnly: true,
    wrap: { open: '_(', close: ')' },
    help: 'Follows the story title (change it in Settings); it is written on every export.'
  }),
  lineField({ key: 'config.version', label: 'Version', group: 'Game', file: 'options.rpy', type: 'text', help: 'The version of the game, such as 1.0.' }),
  lineField({
    key: 'gui.about',
    label: 'About text',
    group: 'Game',
    file: 'options.rpy',
    type: 'multiline',
    help: 'Shown on the about screen. A blank line starts a new paragraph. It is Ren\'Py text, so [ and { keep their special meaning.'
  }),
  {
    key: 'gui/window_icon.png',
    label: 'Window icon',
    group: 'Game',
    file: 'options.rpy',
    type: 'image-file',
    imageTarget: 'gui/window_icon.png',
    help: 'Replaces gui/window_icon.png, the icon on the taskbar. A PNG.'
  },
  lineField({
    key: 'preferences.text_cps',
    label: 'Default text speed',
    group: 'Game',
    file: 'options.rpy',
    type: 'number',
    integer: true,
    min: 0,
    keyword: 'default',
    help: 'Characters per second. 0 shows each line at once.'
  })
]

export const findLookField = (key: string): LookField | undefined => LOOK_FIELDS.find((f) => f.key === key)

/** Fields whose value is a line in a file (everything except the pictures). */
export const isLineField = (field: LookField): boolean => field.type !== 'image-file'

// ---------- values ----------

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as written in a game file, to lower-case `#rrggbb` (alpha dropped), or null. */
export function colourToHex6(text: string): string | null {
  const m = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text.trim())
  if (!m) return null
  let h = m[1].toLowerCase()
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  return `#${h.slice(0, 6)}`
}

function unescapePython(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => (c === 'n' ? '\n' : c))
}

/** The value a token stands for: the hex of a colour, the text of a string, the number or True/False as written. */
function tokenValue(field: LookField, token: string): string {
  if (field.type === 'colour') {
    const m = /#[0-9a-fA-F]+/.exec(token)
    return m ? m[0].toLowerCase() : token
  }
  if (field.type === 'font-file' || field.type === 'text') return unescapePython(token.slice(1, -1))
  return token
}

/** Why `value` cannot be written to this field, or null when it can. */
export function lookValueProblem(field: LookField, value: string): string | null {
  switch (field.type) {
    case 'colour':
      return /^#[0-9a-fA-F]{6}$/.test(value) ? null : `${field.label}: a colour looks like #7c9cff.`
    case 'number': {
      if (value.trim() === '' || !Number.isFinite(Number(value))) return `${field.label}: this must be a number.`
      const n = Number(value)
      if (field.integer && !Number.isInteger(n)) return `${field.label}: this must be a whole number.`
      if (field.min !== undefined && n < field.min) return `${field.label}: this must be at least ${field.min}.`
      return null
    }
    case 'boolean':
      return value === 'True' || value === 'False' ? null : `${field.label}: choose on or off.`
    case 'text':
      return null
    case 'font-file':
      return value.trim() === '' ? `${field.label}: choose a font.` : null
    case 'multiline':
      return value.includes('"""') ? `${field.label}: three double quotes in a row cannot be written to the file.` : null
    case 'image-file':
      return null
  }
}

/** How the value is written after the `=` of a line, in the template's own style. */
export function printLookToken(field: LookField, value: string): string {
  switch (field.type) {
    case 'colour':
      return `'${value.toLowerCase()}'`
    case 'number':
      return String(Number(value))
    case 'boolean':
      return value
    case 'font-file':
    case 'text':
      return pythonString(value)
    default:
      return value
  }
}

/** True when `current` (as read from the file) already stands for `wanted`. */
export function lookValuesEqual(field: LookField, current: string, wanted: string): boolean {
  switch (field.type) {
    case 'colour':
      return colourToHex6(current) === colourToHex6(wanted)
    case 'number':
      return Number(current) === Number(wanted)
    case 'multiline':
      return normaliseAbout(current) === normaliseAbout(wanted)
    default:
      return current === wanted
  }
}

/** About text as it is stored: Unix line breaks, no trailing blank lines. */
export const normaliseAbout = (text: string): string => text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')

// ---------- finding and replacing a line in a file's text ----------

/** A file's text split into lines and the exact line breaks between them, so it can be joined back byte for byte. */
interface Parts {
  /** Even index: a line without its break. Odd index: the break that follows it (\r\n, \n or \r). */
  parts: string[]
}

const split = (text: string): Parts => ({ parts: text.split(/(\r\n|\n|\r)/) })
const join = (p: Parts): string => p.parts.join('')
const lineAt = (p: Parts, n: number): string => p.parts[n * 2]
const lineCount = (p: Parts): number => Math.ceil(p.parts.length / 2)

/** The text after a leading byte order mark, which is not part of the first line. */
function stripBom(text: string): { bom: string; rest: string } {
  return text.charCodeAt(0) === 0xfeff ? { bom: '﻿', rest: text.slice(1) } : { bom: '', rest: text }
}

type Located =
  | { kind: 'found'; line: number; end: number; head: string; tail: string; value: string }
  | { kind: 'edited' }
  | { kind: 'missing' }

const ABOUT_HEAD = /^define[ \t]+gui\.about[ \t]*=[ \t]*_p\([ \t]*"""[ \t]*$/
const ABOUT_END = /^"""\)[ \t]*(?:#.*)?$/

function locate(field: LookField, p: Parts): Located {
  const n = lineCount(p)
  const loose: number[] = []
  const strict: { line: number; m: RegExpExecArray }[] = []
  for (let i = 0; i < n; i++) {
    const text = lineAt(p, i)
    if (field.loose?.test(text)) {
      loose.push(i)
      const m = field.pattern?.exec(text)
      if (m) strict.push({ line: i, m })
    }
  }
  if (loose.length === 0) return { kind: 'missing' }
  if (loose.length > 1) return { kind: 'edited' }
  if (field.type === 'multiline') {
    const start = loose[0]
    if (!ABOUT_HEAD.test(lineAt(p, start))) return { kind: 'edited' }
    for (let j = start + 1; j < n; j++) {
      const text = lineAt(p, j)
      if (!text.includes('"""')) continue
      if (!ABOUT_END.test(text)) return { kind: 'edited' }
      const body: string[] = []
      for (let k = start + 1; k < j; k++) body.push(lineAt(p, k))
      if (body.some((b) => /\\/.test(b.replace(/\\\\/g, '')))) return { kind: 'edited' }
      return { kind: 'found', line: start, end: j, head: '', tail: '', value: body.join('\n').replace(/\\\\/g, '\\') }
    }
    return { kind: 'edited' }
  }
  if (strict.length !== 1) return { kind: 'edited' }
  const { line, m } = strict[0]
  const groups = m.groups as { head: string; value: string; tail: string }
  return { kind: 'found', line, end: line, head: groups.head, tail: groups.tail, value: tokenValue(field, groups.value) }
}

export interface LookTextRead {
  found: boolean
  value: string | null
  editedByHand: boolean
}

/** The current value of a line field in the text of its file. */
export function readLookText(field: LookField, text: string): LookTextRead {
  if (!isLineField(field)) return { found: false, value: null, editedByHand: false }
  const hit = locate(field, split(stripBom(text).rest))
  if (hit.kind === 'found') return { found: true, value: hit.value, editedByHand: false }
  return { found: false, value: null, editedByHand: hit.kind === 'edited' }
}

export interface LookTextApply {
  text: string
  status: LookStatus
}

/**
 * Put `value` into the field's line. Only that line (for the about text, only the lines between its triple quotes) changes: the rest of the
 * text, its line breaks and its byte order mark are returned exactly as they came in. A line that is missing, or that no longer looks like the
 * template's, is reported and left alone.
 */
export function applyLookText(field: LookField, text: string, value: string): LookTextApply {
  if (!isLineField(field)) return { text, status: 'not-found' }
  const { bom, rest } = stripBom(text)
  const p = split(rest)
  const hit = locate(field, p)
  if (hit.kind === 'missing') return { text, status: 'not-found' }
  if (hit.kind === 'edited') return { text, status: 'edited-by-hand' }
  if (lookValueProblem(field, value) !== null) return { text, status: 'invalid' }
  if (lookValuesEqual(field, hit.value, value)) return { text, status: 'unchanged' }

  if (field.type === 'multiline') {
    const lines = normaliseAbout(value) === '' ? [] : normaliseAbout(value).split('\n').map((l) => l.replace(/\\/g, '\\\\'))
    const eol = p.parts[hit.line * 2 + 1] ?? '\n'
    const before = p.parts.slice(0, hit.line * 2 + 2)
    const after = p.parts.slice(hit.end * 2)
    const body: string[] = []
    for (const l of lines) body.push(l, eol)
    return { text: bom + [...before, ...body, ...after].join(''), status: 'applied' }
  }
  p.parts[hit.line * 2] = `${hit.head}${printLookToken(field, value)}${hit.tail}`
  return { text: bom + join(p), status: 'applied' }
}

// ---------- what crosses between the view and the main process ----------

/** One field as found in the game's files right now. For a picture, `value` is its path under game/ when the file exists. */
export interface LookReadEntry {
  key: string
  found: boolean
  value: string | null
  editedByHand: boolean
}

/**
 * A file the user picked for a font or picture field. `file` is the uploaded file, relative to <editor project>/assets.
 * `to` (fonts only) is where it goes under game/, such as fonts/my_font.ttf; pictures go to the field's own imageTarget.
 */
export interface LookUpload {
  file: string
  to?: string
}

export interface LookFieldResult {
  key: string
  status: LookStatus
  /** Plain English for a status that needs one (invalid, or a file that could not be copied). */
  message?: string
}

export interface ApplyLookResult {
  ok: boolean
  error?: string
  results: LookFieldResult[]
  /** The backups folder used for this Apply, or null when nothing needed a backup. */
  backupDir: string | null
}

/** The label of a status in the view. */
export const LOOK_STATUS_LABEL: Record<LookStatus, string> = {
  applied: 'Applied',
  unchanged: 'Already set',
  'edited-by-hand': 'Edited by hand, left alone',
  'not-found': 'Not found in the game files',
  invalid: 'Not a usable value'
}
