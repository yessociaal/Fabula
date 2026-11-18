import { LOOK_FIELDS, findLookField, lookValuesEqual, type LookReadEntry, type LookUpload } from './look'
import type { Project } from './model'
import { buildNameTable } from './naming'
import { fontPath } from './compiler/assets'

/** What `Api.applyLook` is given, built from the story's saved Look & Feel values. */
export interface LookRequest {
  /** Colours, numbers, text and on/off values, keyed by the Ren'Py name. */
  values: Record<string, string>
  /** Fonts and pictures: the uploaded file for each field. */
  uploads: Record<string, LookUpload>
  /** Saved values that could not be turned into a request (the picked asset is gone, or a picture is not a PNG), with the reason. */
  skipped: { key: string; reason: string }[]
}

/**
 * The saved values of a story as an Apply request. For a font or a picture the saved value is the id of the asset; the file is that asset's
 * upload, and a font goes to fonts/<name>.<ext> with the same name the screen compiler would give it. Pass `only` to take just some fields.
 */
export function lookRequest(project: Project, only?: readonly string[]): LookRequest {
  const values: Record<string, string> = {}
  const uploads: Record<string, LookUpload> = {}
  const skipped: { key: string; reason: string }[] = []
  const names = buildNameTable(project)
  for (const [key, value] of Object.entries(project.look)) {
    if (only && !only.includes(key)) continue
    const field = findLookField(key)
    if (!field || field.readOnly) continue
    if (field.type === 'font-file' || field.type === 'image-file') {
      const asset = project.assets[value]
      if (!asset) {
        skipped.push({ key, reason: `${field.label}: the chosen file was removed from Assets.` })
        continue
      }
      if (field.type === 'font-file') {
        const to = fontPath(asset, names)
        if (to === null) skipped.push({ key, reason: `${field.label}: choose a font from Assets.` })
        else uploads[key] = { file: asset.file, to }
      } else if (!asset.file.toLowerCase().endsWith('.png')) {
        skipped.push({ key, reason: `${field.label}: use a PNG picture.` })
      } else {
        uploads[key] = { file: asset.file }
      }
      continue
    }
    values[key] = value
  }
  return { values, uploads, skipped }
}

/** One sentence for a toast: how many fields changed, and how many could not be (left alone, missing or unusable). */
export function lookSummary(results: readonly { status: string }[], skipped = 0): string {
  const count = (s: string): number => results.filter((r) => r.status === s).length
  const applied = count('applied')
  const parts: string[] = []
  parts.push(applied === 0 ? 'Nothing needed changing' : applied === 1 ? '1 setting written to the game' : `${applied} settings written to the game`)
  const byHand = count('edited-by-hand')
  if (byHand > 0) parts.push(byHand === 1 ? '1 left alone because you edited it by hand' : `${byHand} left alone because you edited them by hand`)
  const notFound = count('not-found')
  if (notFound > 0) parts.push(notFound === 1 ? '1 not found in the game files' : `${notFound} not found in the game files`)
  const bad = count('invalid') + skipped
  if (bad > 0) parts.push(bad === 1 ? '1 could not be used' : `${bad} could not be used`)
  return `${parts.join(', ')}.`
}

/**
 * The saved values that would change something in the game right now: the ones that differ from what the game's files say, plus every
 * saved font or picture that is usable and was not applied yet (`applied` maps a key to the value that was last written in this session).
 * Fields whose line was edited by hand or is not in the game's files are left out: Apply would not touch them.
 */
export function pendingLookKeys(project: Project, entries: readonly LookReadEntry[], applied: Readonly<Record<string, string>> = {}): string[] {
  const names = buildNameTable(project)
  const out: string[] = []
  for (const field of LOOK_FIELDS) {
    const value = project.look[field.key]
    if (value === undefined || field.readOnly) continue
    if (field.type === 'image-file') {
      const asset = project.assets[value]
      if (asset && asset.file.toLowerCase().endsWith('.png') && applied[field.key] !== value) out.push(field.key)
      continue
    }
    const entry = entries.find((e) => e.key === field.key)
    if (!entry || !entry.found) continue
    if (field.type === 'font-file') {
      const asset = project.assets[value]
      const to = asset ? fontPath(asset, names) : null
      if (to !== null && entry.value !== to) out.push(field.key)
    } else if (!lookValuesEqual(field, entry.value ?? '', value)) {
      out.push(field.key)
    }
  }
  return out
}
