import { parseKitManifest } from './manifest'
import { TemplateError, checkTemplate } from './template'
import type { KitSource, LoadedKit } from './types'

export const KIT_FILE = 'kit.json'
/** Nothing in a kit folder may be larger than this many characters (kits are small text files). */
export const MAX_KIT_TEXT = 1_000_000

export interface KitFolder {
  /** The folder's own name, used as the kit's id when kit.json cannot be read. */
  name: string
  source: KitSource
  /** Absolute path, shown to the author ("Open folder"). Empty in the browser mock. */
  folder: string
  /** The text of a file inside the kit folder (a manifest path such as `templates/print.txt`), or null when there is none. */
  readText(relativePath: string): string | null
}

function failed(folder: KitFolder, error: string, id?: string): LoadedKit {
  return { id: id ?? folder.name, source: folder.source, folder: folder.folder, manifest: null, error, templates: {}, files: [] }
}

function normalise(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/**
 * Read one kit from a folder: kit.json, every template and every file it lists. A kit that has any problem is returned
 * with `manifest: null` and an `error` that says what is wrong in plain words (several problems are on separate lines).
 */
export function loadKit(folder: KitFolder): LoadedKit {
  const raw = folder.readText(KIT_FILE)
  if (raw === null) return failed(folder, `The folder has no ${KIT_FILE}.`)
  let json: unknown
  try {
    json = JSON.parse(normalise(raw))
  } catch (e) {
    return failed(folder, `${KIT_FILE} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  const parsed = parseKitManifest(json)
  if (!parsed.ok) {
    const id = typeof (json as { id?: unknown })?.id === 'string' ? (json as { id: string }).id : undefined
    return failed(folder, parsed.error, id)
  }
  const manifest = parsed.manifest
  const errors: string[] = []

  const templates: Record<string, string> = {}
  for (const part of [...manifest.blocks.map((b) => ({ ...b, what: 'block' })), ...manifest.endings.map((e) => ({ ...e, what: 'ending' }))]) {
    const text = folder.readText(part.template)
    if (text === null) {
      errors.push(`The ${part.what} "${part.type}" uses the template "${part.template}", but that file is not in the kit folder.`)
      continue
    }
    if (text.length > MAX_KIT_TEXT) {
      errors.push(`The template "${part.template}" is too large.`)
      continue
    }
    const source = normalise(text)
    templates[part.template] = source
    try {
      checkTemplate(source, part.fields)
    } catch (e) {
      if (e instanceof TemplateError) errors.push(`${part.template}, ${e.message}`)
      else throw e
    }
  }

  const files: LoadedKit['files'] = []
  for (const file of manifest.files) {
    const text = folder.readText(file.from)
    if (text === null) {
      errors.push(`kit.json lists the file "${file.from}", but it is not in the kit folder.`)
      continue
    }
    if (text.length > MAX_KIT_TEXT) {
      errors.push(`The file "${file.from}" is too large.`)
      continue
    }
    files.push({ from: file.from, to: file.to, content: normalise(text) })
  }

  if (errors.length > 0) return { ...failed(folder, errors.join('\n'), manifest.id) }
  return { id: manifest.id, source: folder.source, folder: folder.folder, manifest, error: null, templates, files }
}

export const OVERRIDE_NOTE = 'This kit replaces the built-in kit with the same id.'

/**
 * Combine the built-in kits and the story's own. A story kit with the same id as a built-in one replaces it (with a note);
 * a second story kit with an id that is already taken is shown as an error so nothing disappears silently.
 * The result is sorted by name.
 */
export function mergeKits(builtIn: LoadedKit[], story: LoadedKit[]): LoadedKit[] {
  const byId = new Map<string, LoadedKit>()
  for (const kit of builtIn) if (!byId.has(kit.id)) byId.set(kit.id, kit)
  const storyIds = new Set<string>()
  const extra: LoadedKit[] = []
  for (const kit of story) {
    if (storyIds.has(kit.id)) {
      extra.push({ ...kit, id: `${kit.id}@${kit.folder}`, manifest: null, error: `Another kit in your kits folder already uses the id "${kit.id}". Change the id in this kit's kit.json.`, templates: {}, files: [] })
      continue
    }
    storyIds.add(kit.id)
    const replaced = byId.get(kit.id)
    byId.set(kit.id, replaced && replaced.source === 'built-in' ? { ...kit, note: OVERRIDE_NOTE } : kit)
  }
  const label = (k: LoadedKit): string => (k.manifest?.name ?? k.id).toLowerCase()
  return [...byId.values(), ...extra].sort((a, b) => (label(a) < label(b) ? -1 : label(a) > label(b) ? 1 : 0))
}
