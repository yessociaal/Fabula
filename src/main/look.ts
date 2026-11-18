import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import {
  LOOK_FIELDS,
  applyLookText,
  readLookText,
  type ApplyLookResult,
  type LookField,
  type LookFieldResult,
  type LookFile,
  type LookReadEntry,
  type LookUpload
} from '@shared/look'
import { BACKUPS_DIR, timestamp } from './exporter'

/**
 * Look & Feel in the Ren'Py game: read each field from gui.rpy / options.rpy / gui/, and write the ones the user asked for.
 * Writing is single-line replacement only (see src/shared/look.ts); a file is rewritten only when one of its lines changed,
 * and then every other byte, including line endings and a byte order mark, is kept.
 */

export interface ApplyLookOptions {
  /** Injected so tests get a fixed backup folder name. */
  now?: () => Date
}

const FONT_TARGET = /^fonts\/[A-Za-z0-9_.-]+\.(?:ttf|otf)$/i

function safeParts(path: string): string[] | null {
  if (path === '' || isAbsolute(path)) return null
  const parts = path.split(/[\\/]+/)
  if (parts.some((p) => p === '' || p === '..' || p === '.')) return null
  return parts
}

interface TextFile {
  path: string
  /** Missing, or not valid UTF-8 (then it is not touched). */
  state: 'ok' | 'missing' | 'unreadable'
  original: string
  text: string
}

function loadText(gameDir: string, name: LookFile): TextFile {
  const path = join(gameDir, name)
  if (!existsSync(path)) return { path, state: 'missing', original: '', text: '' }
  const bytes = readFileSync(path)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) return { path, state: 'unreadable', original: '', text: '' }
  return { path, state: 'ok', original: text, text }
}

/** Read every field from the game's files. A missing or unreadable file makes its fields "not found" (or "edited by hand" when unreadable). */
export function readLook(projectDir: string): LookReadEntry[] {
  const gameDir = join(projectDir, 'game')
  const files = new Map<LookFile, TextFile>()
  const file = (name: LookFile): TextFile => {
    const known = files.get(name)
    if (known) return known
    const loaded = loadText(gameDir, name)
    files.set(name, loaded)
    return loaded
  }
  return LOOK_FIELDS.map((field): LookReadEntry => {
    if (field.type === 'image-file') {
      const target = field.imageTarget ?? field.key
      const there = existsSync(join(gameDir, ...target.split('/')))
      return { key: field.key, found: there, value: there ? target : null, editedByHand: false }
    }
    const f = file(field.file)
    if (f.state === 'missing') return { key: field.key, found: false, value: null, editedByHand: false }
    if (f.state === 'unreadable') return { key: field.key, found: false, value: null, editedByHand: true }
    const read = readLookText(field, f.text)
    return { key: field.key, found: read.found, value: read.value, editedByHand: read.editedByHand }
  })
}

function sameBytes(a: string, b: string): boolean {
  try {
    if (statSync(a).size !== statSync(b).size) return false
    return readFileSync(a).equals(readFileSync(b))
  } catch {
    return false
  }
}

/**
 * Apply the given values and uploads to the game. Only the fields that appear in `values` or `uploads` are touched.
 * Each result says what happened to its field; a field whose line was edited by hand is reported and left alone.
 */
export function applyLook(
  projectDir: string,
  editorDir: string,
  values: Record<string, string>,
  uploads: Record<string, LookUpload>,
  options: ApplyLookOptions = {}
): ApplyLookResult {
  const gameDir = join(projectDir, 'game')
  if (!existsSync(gameDir)) return { ok: false, error: `"${projectDir}" does not contain a Ren'Py game (no game folder).`, results: [], backupDir: null }

  const backupRoot = join(editorDir, BACKUPS_DIR, timestamp((options.now ?? (() => new Date()))()))
  let backupUsed = false
  const backedUp = new Set<string>()
  /** Copy a game file to backups/<timestamp>/<game-relative path>, once per Apply. */
  const backUp = (rel: string): void => {
    if (backedUp.has(rel)) return
    const from = join(gameDir, ...rel.split('/'))
    if (!existsSync(from)) return
    const to = join(backupRoot, ...rel.split('/'))
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
    backedUp.add(rel)
    backupUsed = true
  }

  const files = new Map<LookFile, TextFile>()
  const file = (name: LookFile): TextFile => {
    const known = files.get(name)
    if (known) return known
    const loaded = loadText(gameDir, name)
    files.set(name, loaded)
    return loaded
  }
  const copyChanges: { rel: string; from: string }[] = []

  /** Copy an uploaded file to game/<rel> when the file there is missing or different. Returns whether it will be copied. */
  const planCopy = (rel: string, from: string): boolean => {
    const dest = join(gameDir, ...rel.split('/'))
    return !(existsSync(dest) && sameBytes(from, dest))
  }

  try {
    const results: LookFieldResult[] = []
    for (const field of LOOK_FIELDS) {
      if (!(field.key in values) && !(field.key in uploads)) continue
      results.push(applyField(field))
    }

    function applyField(field: LookField): LookFieldResult {
      const key = field.key
      if (field.readOnly) return { key, status: 'invalid', message: `${field.label} follows the story title. Change it in Settings.` }

      if (field.type === 'image-file') {
        const upload = uploads[key]
        const target = field.imageTarget ?? key
        if (!upload) return { key, status: 'invalid', message: `${field.label}: choose a picture from Assets.` }
        const parts = safeParts(upload.file)
        if (!parts) return { key, status: 'invalid', message: `${field.label}: the chosen file is not usable.` }
        const from = join(editorDir, 'assets', ...parts)
        if (!existsSync(from)) return { key, status: 'invalid', message: `${field.label}: the uploaded file is missing from the story folder.` }
        if (!/\.png$/i.test(upload.file)) return { key, status: 'invalid', message: `${field.label}: use a PNG picture.` }
        if (!planCopy(target, from)) return { key, status: 'unchanged' }
        copyChanges.push({ rel: target, from })
        return { key, status: 'applied' }
      }

      if (field.type === 'font-file') {
        const upload = uploads[key]
        if (!upload || !upload.to || !FONT_TARGET.test(upload.to)) return { key, status: 'invalid', message: `${field.label}: choose a font from Assets.` }
        const parts = safeParts(upload.file)
        if (!parts) return { key, status: 'invalid', message: `${field.label}: the chosen file is not usable.` }
        const from = join(editorDir, 'assets', ...parts)
        if (!existsSync(from)) return { key, status: 'invalid', message: `${field.label}: the uploaded font is missing from the story folder.` }
        const f = file(field.file)
        if (f.state === 'missing') return { key, status: 'not-found' }
        if (f.state === 'unreadable') return { key, status: 'edited-by-hand' }
        const line = applyLookText(field, f.text, upload.to)
        if (line.status !== 'applied' && line.status !== 'unchanged') return { key, status: line.status }
        f.text = line.text
        const copy = planCopy(upload.to, from)
        if (copy) copyChanges.push({ rel: upload.to, from })
        return { key, status: line.status === 'applied' || copy ? 'applied' : 'unchanged' }
      }

      const f = file(field.file)
      if (f.state === 'missing') return { key, status: 'not-found' }
      if (f.state === 'unreadable') return { key, status: 'edited-by-hand' }
      const line = applyLookText(field, f.text, values[key])
      if (line.status === 'invalid') return { key, status: 'invalid', message: `${field.label}: that is not a usable value.` }
      f.text = line.text
      return { key, status: line.status }
    }

    // Everything is decided; now write. A backup comes first, once per file.
    for (const [name, f] of files) {
      if (f.state !== 'ok' || f.text === f.original) continue
      backUp(name)
      const tmp = `${f.path}.tmp`
      writeFileSync(tmp, f.text, 'utf8')
      renameSync(tmp, f.path)
    }
    for (const c of copyChanges) {
      backUp(c.rel)
      const dest = join(gameDir, ...c.rel.split('/'))
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(c.from, dest)
    }
    return { ok: true, results, backupDir: backupUsed ? backupRoot : null }
  } catch (e) {
    return { ok: false, error: `Could not write the game files: ${e instanceof Error ? e.message : String(e)}`, results: [], backupDir: backupUsed ? backupRoot : null }
  }
}
