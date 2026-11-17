import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadKit, mergeKits } from '@shared/kits/load'
import type { KitSource, LoadedKit } from '@shared/kits/types'

export const KITS_FOLDER = 'kits'

/**
 * Where the kits that come with the app live: `resources/kits` of the repository while developing, and
 * `<resources>/kits` next to the app files in an installed build. Pure so both cases can be tested.
 */
export function builtInKitsDir(opts: { isPackaged: boolean; resourcesPath: string; appPath: string }): string {
  return opts.isPackaged ? join(opts.resourcesPath, KITS_FOLDER) : join(opts.appPath, 'resources', KITS_FOLDER)
}

/** The kit-shaped subfolders of a folder (every subfolder; a folder without a kit.json shows up as a broken kit). */
function kitFolders(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => {
        try {
          return statSync(join(dir, name)).isDirectory()
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return []
  }
}

/** Read one file inside a kit folder as text. Refuses anything that would leave the folder. */
function readInside(root: string, relative: string): string | null {
  if (relative.includes('\\') || relative.startsWith('/') || relative.split('/').includes('..') || /^[A-Za-z]:/.test(relative)) return null
  const file = join(root, ...relative.split('/'))
  try {
    if (!statSync(file).isFile()) return null
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** Load every kit folder found directly inside `dir`. */
export function loadKitsIn(dir: string, source: KitSource): LoadedKit[] {
  if (!dir || !existsSync(dir)) return []
  return kitFolders(dir).map((name) => {
    const folder = join(dir, name)
    return loadKit({ name, source, folder, readText: (rel) => readInside(folder, rel) })
  })
}

/**
 * The kits available to a story: the built-in kits plus the ones in `<editorProject>/kits/`. A story kit with the same id
 * as a built-in one replaces it. A folder that cannot be read as a kit is listed with its error instead of being skipped.
 */
export function listKits(editorDir: string, builtInDir: string): LoadedKit[] {
  const story = editorDir ? loadKitsIn(join(editorDir, KITS_FOLDER), 'story') : []
  return mergeKits(loadKitsIn(builtInDir, 'built-in'), story)
}
