import { walkBlocks } from './blockTree'
import type { Project, ScriptFile } from './model'
import { buildNameTable } from './naming'
import { kitsInUse } from './kits/usage'

/** File names (without `.rpy`) that Fabula or Ren'Py's own project template owns. Compared in lower case. */
const RESERVED_STEMS: readonly string[] = ['script', 'gui', 'screens', 'options', 'interface']
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const STEM_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
export const MAX_SCRIPT_FILE_STEM = 60

/** The file name without a trailing `.rpy` (any case) and without surrounding spaces. */
export function scriptFileStem(name: string): string {
  return name.trim().replace(/\.rpy$/i, '')
}

/** Where a script file is written, relative to the game folder: `<stem>.rpy`. */
export function scriptFilePath(name: string): string {
  return `${scriptFileStem(name)}.rpy`
}

/** Lower-case stems that generated files use or that are reserved (script, gui, screens, options, interface, every chapter file). */
export function reservedFileStems(project: Project): Set<string> {
  const stems = new Set<string>(RESERVED_STEMS)
  for (const file of Object.values(buildNameTable(project).chapterFiles)) stems.add(file.replace(/\.rpy$/, '').toLowerCase())
  return stems
}

/** Why a name can never be a script file name, ignoring other files, or null when the shape is fine. */
function shapeProblem(name: string): string | null {
  const stem = scriptFileStem(name)
  if (stem === '') return 'Type a file name.'
  if (!STEM_SHAPE.test(stem)) {
    return 'A file name can use letters, numbers, "_" and "-" only, and must start with a letter or number (no spaces, dots or slashes).'
  }
  if (stem.length > MAX_SCRIPT_FILE_STEM) return `A file name can be at most ${MAX_SCRIPT_FILE_STEM} characters long.`
  if (WINDOWS_DEVICE.test(stem)) return `"${stem}" is a name Windows does not allow for files. Pick another name.`
  return null
}

/**
 * Why `name` cannot be the name of a script file, in plain English, or null when it is fine. Refuses a shape that
 * is not a safe file name, a name Fabula or Ren'Py already uses (script, gui, screens, options, interface, a chapter
 * file), and a name that another script file already has (compared without regard to upper or lower case).
 * `exceptId` is the file being renamed.
 */
export function scriptFileNameProblem(project: Project, name: string, exceptId?: string): string | null {
  const shape = shapeProblem(name)
  if (shape !== null) return shape
  const stem = scriptFileStem(name)
  const lower = stem.toLowerCase()
  if (reservedFileStems(project).has(lower)) {
    return `"${lower}.rpy" is a file that Fabula or your Ren'Py game already uses. Pick another name.`
  }
  for (const other of project.scriptFiles) {
    if (other.id !== exceptId && scriptFileStem(other.name).toLowerCase() === lower) {
      return `Another script file is already called "${lower}.rpy". Pick another name.`
    }
  }
  return null
}

export interface ScriptFileProblem {
  file: ScriptFile
  message: string
}

/**
 * Every script file that cannot be written, with the reason. A file that comes after another one with the same
 * name is the one reported as a duplicate. Used by the validator.
 */
export function scriptFileProblems(project: Project): ScriptFileProblem[] {
  const reserved = reservedFileStems(project)
  const seen = new Set<string>()
  const out: ScriptFileProblem[] = []
  for (const file of project.scriptFiles) {
    const shape = shapeProblem(file.name)
    const lower = scriptFileStem(file.name).toLowerCase()
    let message: string | null = shape
    if (message === null && reserved.has(lower)) {
      message = `"${lower}.rpy" is a file that Fabula or your Ren'Py game already uses. Rename the script file.`
    }
    if (message === null && seen.has(lower)) {
      message = `Two script files are both called "${lower}.rpy". Rename one of them.`
    }
    if (shape === null) seen.add(lower)
    if (message !== null) out.push({ file, message })
  }
  return out
}

/** The script files the compiler writes: legal names only, the first file of a duplicated name wins. */
export function usableScriptFiles(project: Project): ScriptFile[] {
  const bad = new Set(scriptFileProblems(project).map((p) => p.file.id))
  return project.scriptFiles.filter((f) => !bad.has(f.id))
}

/** A free default name for a new script file: `my_script`, `my_script_2`, … */
export function nextScriptFileName(project: Project, base = 'my_script'): string {
  let n = 1
  let name = base
  while (scriptFileNameProblem(project, name) !== null) name = `${base}_${++n}`
  return name
}

/**
 * Whether the story contains any hand-written or kit code: a Ren'Py code block (at any depth), a code ending, a kit block or ending, or a script file.
 * The Ren'Py lint runs automatically after an export when this is true.
 */
export function storyHasCode(project: Project): boolean {
  if (project.scriptFiles.length > 0 || kitsInUse(project).size > 0) return true
  for (const scene of Object.values(project.scenes)) {
    if (scene.ending.type === 'code') return true
    let found = false
    walkBlocks(scene.blocks, (b) => {
      if (b.type === 'code') found = true
    })
    if (found) return true
  }
  return false
}
