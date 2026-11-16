import type { Asset, Id, Project } from '../model'
import type { NameTable } from '../naming'

export interface AssetCopy {
  assetId: Id
  from: string
  to: string
}

export function fileExtension(asset: Asset): string {
  const name = asset.file.slice(asset.file.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/** Export path (relative to game/) of a background, or null when it is not a background. */
export function backgroundPath(asset: Asset, names: NameTable): string | null {
  const image = names.backgrounds[asset.id]
  if (asset.kind !== 'background' || image === undefined) return null
  return `images/bg/${image}${fileExtension(asset)}`
}

export function spritePath(asset: Asset, tag: string, attribute: string): string | null {
  if (asset.kind !== 'sprite') return null
  return `images/characters/${tag} ${attribute}${fileExtension(asset)}`
}

export function audioPath(asset: Asset, names: NameTable): string | null {
  const stem = names.stems[asset.id]
  if (stem === undefined) return null
  if (asset.kind === 'music') return `audio/music/${stem}${fileExtension(asset)}`
  if (asset.kind === 'sound') return `audio/sfx/${stem}${fileExtension(asset)}`
  if (asset.kind === 'ambient') return `audio/ambient/${stem}${fileExtension(asset)}`
  if (asset.kind === 'voice') return `audio/voice/${stem}${fileExtension(asset)}`
  return null
}

export function moviePath(asset: Asset, names: NameTable): string | null {
  const stem = names.stems[asset.id]
  if (asset.kind !== 'movie' || stem === undefined) return null
  return `movies/${stem}${fileExtension(asset)}`
}

/** The side image file of a character: `images/characters/side <tag>.<ext>`. */
export function sidePath(asset: Asset, tag: string): string | null {
  if (asset.kind !== 'sprite') return null
  return `images/characters/side ${tag}${fileExtension(asset)}`
}

export function lookupAsset(project: Project, id: Id | null): Asset | null {
  return id === null ? null : (project.assets[id] ?? null)
}
