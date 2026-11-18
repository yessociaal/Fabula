import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { compileProject } from '@shared/compiler'
import { pythonString } from '@shared/compiler/text'
import type { ExportResult } from '@shared/ipc'
import type { LoadedKit } from '@shared/kits/types'
import type { Project } from '@shared/model'
import { listKits } from './kits'
import { validateProject } from '@shared/validate'

export const MANIFEST_FILE = 'export-manifest.json'
export const BACKUPS_DIR = 'backups'

/** Files and folders in the Ren'Py project that belong to the author and are never written or deleted. */
const PROTECTED = new Set(['gui.rpy', 'screens.rpy', 'options.rpy'])

export interface ExportOptions {
  /** Injected so tests get a fixed backup folder name. */
  now?: () => Date
  /** The kits the story can use. When left out they are read from the story's kits folder and builtInKitsDir. */
  kits?: LoadedKit[]
  /** Where the kits that come with the app are. */
  builtInKitsDir?: string
}

export const timestamp = (d: Date): string => {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** A game-relative path with forward slashes, or null when it is unsafe. */
function safeRelative(path: string): string | null {
  if (path === '' || isAbsolute(path)) return null
  const parts = path.split(/[\\/]+/)
  if (parts.some((p) => p === '' || p === '..' || p === '.')) return null
  return parts.join('/')
}

function readManifest(editorDir: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(join(editorDir, MANIFEST_FILE), 'utf8')) as { files?: unknown }
    if (!Array.isArray(raw.files)) return []
    return raw.files.filter((f): f is string => typeof f === 'string').flatMap((f) => safeRelative(f) ?? [])
  } catch {
    return []
  }
}

function sameBytes(file: string, content: Buffer): boolean {
  try {
    if (statSync(file).size !== content.length) return false
    return readFileSync(file).equals(content)
  } catch {
    return false
  }
}

function sameFile(from: string, to: string): boolean {
  try {
    const a = statSync(from)
    const b = statSync(to)
    return a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 2
  } catch {
    return false
  }
}

/** Case-insensitive, because Windows treats Gui.rpy and gui.rpy as the same file. */
const isProtected = (rel: string): boolean => {
  const lower = rel.toLowerCase()
  return PROTECTED.has(lower) || lower === 'gui' || lower.startsWith('gui/')
}

/** Replace the title in the single `define config.name = _("…")` line. Returns null when the line is not there. */
export function setConfigName(optionsText: string, title: string): string | null {
  const pattern = /^(\s*define\s+config\.name\s*=\s*_\()(?:"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')(\))/m
  if (!pattern.test(optionsText)) return null
  return optionsText.replace(pattern, (_m, head: string, tail: string) => `${head}${pythonString(title)}${tail}`)
}

/**
 * Write the compiled project into the Ren'Py project at project.renpyProjectDir.
 * Steps follow the plan: validate, compile, read the manifest, delete what the new result lacks, back up
 * files that are not ours, write, delete stale .rpyc, write the manifest, set the game name.
 */
export function exportProject(editorDir: string, project: Project, options: ExportOptions = {}): ExportResult {
  // 1. validate
  const kits = options.kits ?? listKits(editorDir, options.builtInKitsDir ?? '')
  const problems = validateProject(project, { kits })
  const errors = problems.filter((p) => p.severity === 'error')
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors.length === 1 ? 'There is 1 problem to fix before exporting.' : `There are ${errors.length} problems to fix before exporting.`,
      problems
    }
  }
  const renpyDir = project.renpyProjectDir
  if (!renpyDir) return { ok: false, error: "This story has no Ren'Py game yet. Create one first." }
  const gameDir = join(renpyDir, 'game')
  if (!existsSync(gameDir)) return { ok: false, error: `"${renpyDir}" does not contain a Ren'Py game (no game folder).` }

  // 2. compile
  const result = compileProject(project, { kits })
  const outputs = new Map<string, { kind: 'text'; content: Buffer } | { kind: 'asset'; from: string }>()
  for (const f of result.files) {
    const rel = safeRelative(f.path)
    if (rel === null || isProtected(rel)) return { ok: false, error: `The story would write "${f.path}", which is reserved.` }
    outputs.set(rel, { kind: 'text', content: Buffer.from(f.content, 'utf8') })
  }
  for (const a of result.assetCopies) {
    const rel = safeRelative(a.to)
    const from = safeRelative(a.from)
    if (rel === null || from === null || isProtected(rel)) return { ok: false, error: `The story would write "${a.to}", which is reserved.` }
    const source = join(editorDir, 'assets', ...from.split('/'))
    if (!existsSync(source)) {
      return { ok: false, error: `An uploaded file is missing from the story folder: assets/${from}. Re-upload it, or remove it from the scenes that use it.` }
    }
    outputs.set(rel, { kind: 'asset', from: source })
  }

  const changed: string[] = []
  try {
    // 3. delete what the previous export wrote and this one does not
    const manifest = readManifest(editorDir)
    const inManifest = new Set(manifest)
    for (const rel of manifest) {
      if (outputs.has(rel) || isProtected(rel)) continue
      const file = join(gameDir, ...rel.split('/'))
      if (existsSync(file)) {
        rmSync(file, { force: true })
        changed.push(rel)
      }
      // 6. a compiled leftover next to a removed script
      if (rel.endsWith('.rpy')) {
        const compiled = `${file}c`
        if (existsSync(compiled)) rmSync(compiled, { force: true })
      }
    }

    // 4 + 5. back up what is not ours, then write
    const backupRoot = join(editorDir, BACKUPS_DIR, timestamp((options.now ?? (() => new Date()))()))
    const backUp = (rel: string, file: string): void => {
      const target = join(backupRoot, ...rel.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(file, target)
    }
    for (const rel of [...outputs.keys()].sort()) {
      const out = outputs.get(rel)!
      const file = join(gameDir, ...rel.split('/'))
      const exists = existsSync(file)
      if (out.kind === 'text') {
        if (exists && sameBytes(file, out.content)) continue
        if (exists && !inManifest.has(rel)) backUp(rel, file)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, out.content)
      } else {
        if (exists && sameFile(out.from, file)) continue
        if (exists && !inManifest.has(rel)) backUp(rel, file)
        mkdirSync(dirname(file), { recursive: true })
        copyFileSync(out.from, file)
        const s = statSync(out.from)
        utimesSync(file, s.atime, s.mtime)
      }
      changed.push(rel)
    }

    // 7. the manifest lists every file this export owns
    const manifestText = `${JSON.stringify({ files: [...outputs.keys()].sort() }, null, 2)}\n`
    const manifestFile = join(editorDir, MANIFEST_FILE)
    if (!existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== manifestText) {
      const tmp = `${manifestFile}.tmp`
      writeFileSync(tmp, manifestText, 'utf8')
      renameSync(tmp, manifestFile)
    }

    // 8. the game name
    const optionsFile = join(gameDir, 'options.rpy')
    if (existsSync(optionsFile)) {
      const text = readFileSync(optionsFile, 'utf8')
      const next = setConfigName(text, project.meta.title)
      if (next !== null && next !== text) {
        writeFileSync(optionsFile, next, 'utf8')
        changed.push('options.rpy')
      }
    }
  } catch (e) {
    return { ok: false, error: `Could not write the game files: ${e instanceof Error ? e.message : String(e)}` }
  }

  return { ok: true, sceneLocations: result.sceneLocations, changed, problems }
}
