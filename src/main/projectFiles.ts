import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { createProject, newId } from '@shared/factory'
import type { Asset, AssetKind, Project } from '@shared/model'
import { parseProject } from '@shared/schema'
import { ASSET_FOLDERS, checkAssetExtension, isImageKind } from '@shared/assetTypes'

export const STORY_FILE = 'story.fabula.json'

/** Returns width/height of an image file, or null when unknown. Injected so tests need no Electron. */
export type ReadImageSize = (filePath: string) => { width: number; height: number } | null | Promise<{ width: number; height: number } | null>

// ---------- paths ----------

/**
 * Resolve `file` (relative, forward slashes) inside <dir>/assets.
 * Returns null for anything that would land outside that folder (../, absolute paths, drive letters, NUL bytes).
 */
export function resolveAssetPath(dir: string, file: string): string | null {
  if (!dir || !file || file.includes('\0')) return null
  if (isAbsolute(file) || /^[a-zA-Z]:/.test(file) || file.startsWith('/') || file.startsWith('\\')) return null
  const root = resolve(dir, 'assets')
  const target = resolve(root, file)
  const rel = relative(root, target)
  if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return null
  return target
}

function storyPath(dir: string): string {
  return join(dir, STORY_FILE)
}

/** A folder name made from the story title that is legal on Windows. */
export function sanitiseFolderName(title: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned)) return 'Untitled story'
  return cleaned.slice(0, 80).replace(/[. ]+$/, '')
}

// ---------- project file ----------

export async function saveProject(dir: string, project: Project): Promise<void> {
  const file = storyPath(dir)
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(project, null, 2) + '\n', 'utf8')
  try {
    await rename(tmp, file)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
}

export async function createEditorProject(
  parentDir: string,
  title: string
): Promise<{ dir: string; project: Project }> {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Give the story a title first.')
  const dir = join(parentDir, sanitiseFolderName(trimmed))
  let existing: string[] | null = null
  try {
    existing = await readdir(dir)
  } catch {
    existing = null
  }
  if (existing !== null && existing.length > 0) {
    throw new Error(`The folder "${dir}" already exists and is not empty. Pick another title or location.`)
  }
  await mkdir(join(dir, 'assets'), { recursive: true })
  const project = createProject(trimmed)
  await saveProject(dir, project)
  return { dir, project }
}

export async function openEditorProject(dir: string): Promise<{ dir: string; project: Project }> {
  try {
    const s = await stat(dir)
    if (!s.isDirectory()) throw new Error('not a folder')
  } catch {
    throw new Error(`The folder "${dir}" could not be found. It may have been moved or deleted.`)
  }
  let text: string
  try {
    text = await readFile(storyPath(dir), 'utf8')
  } catch {
    throw new Error(`There is no story in "${dir}". A story folder contains a file named ${STORY_FILE}.`)
  }
  const parsed = parseProject(text.replace(/^﻿/, ''))
  if (!parsed.ok) {
    throw new Error(`This story file is damaged and could not be opened. ${parsed.error}`)
  }
  return { dir, project: parsed.project }
}

// ---------- assets ----------

async function finishAsset(
  dir: string,
  kind: AssetKind,
  fileName: string,
  ext: string,
  id: string,
  destPath: string,
  readImageSize: ReadImageSize | undefined
): Promise<Asset> {
  const info = await stat(destPath)
  let width: number | null = null
  let height: number | null = null
  if (isImageKind(kind) && readImageSize) {
    try {
      const size = await readImageSize(destPath)
      if (size) {
        width = size.width
        height = size.height
      }
    } catch {
      // unreadable image: keep dimensions unknown
    }
  }
  const name = basename(fileName, extname(fileName)) || 'Untitled'
  return { id, kind, name, file: `${ASSET_FOLDERS[kind]}/${id}${ext}`, width, height, bytes: info.size }
}

export async function importAsset(
  dir: string,
  kind: AssetKind,
  sourcePath: string,
  readImageSize?: ReadImageSize
): Promise<Asset> {
  const ext = checkAssetExtension(kind, sourcePath)
  const id = newId()
  const rel = `${ASSET_FOLDERS[kind]}/${id}${ext}`
  const dest = resolveAssetPath(dir, rel)
  if (!dest) throw new Error('Invalid asset location.')
  await mkdir(join(dest, '..'), { recursive: true })
  await copyFile(sourcePath, dest)
  return finishAsset(dir, kind, sourcePath, ext, id, dest, readImageSize)
}

export async function importAssetData(
  dir: string,
  kind: AssetKind,
  fileName: string,
  data: ArrayBuffer | Uint8Array,
  readImageSize?: ReadImageSize
): Promise<Asset> {
  const ext = checkAssetExtension(kind, fileName)
  const id = newId()
  const rel = `${ASSET_FOLDERS[kind]}/${id}${ext}`
  const dest = resolveAssetPath(dir, rel)
  if (!dest) throw new Error('Invalid asset location.')
  await mkdir(join(dest, '..'), { recursive: true })
  await writeFile(dest, data instanceof Uint8Array ? data : new Uint8Array(data))
  return finishAsset(dir, kind, fileName, ext, id, dest, readImageSize)
}

export async function deleteAssetFile(dir: string, file: string): Promise<void> {
  const target = resolveAssetPath(dir, file)
  if (!target) throw new Error('That file is not inside the story\'s assets folder.')
  await rm(target, { force: true })
}
