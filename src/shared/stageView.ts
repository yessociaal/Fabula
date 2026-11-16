import type { Asset, Character, Id, Project, StagePosition } from './model'
import type { CustomPlacement, StageSprite } from './stage'
import { buildNameTable } from './naming'
import type { BlockPath } from './blockTree'
import { appliedBlocks } from './stage'

export interface ResolvedSprite {
  key: string
  position: StagePosition
  placement?: CustomPlacement
  zorder?: number
  /** The uploaded image, or null when the art is missing. */
  asset: Asset | null
  /** Shown in the dashed box when there is no art, e.g. "Anna · happy". */
  label: string
}

export interface StageDialogue {
  speakerName: string | null
  speakerColor: string | null
  text: string
}

/** Find the image and a label for every sprite on stage. Never invents art: unknown expressions give `asset: null`. */
export function resolveSprites(
  characters: Record<Id, Character>,
  assets: Record<Id, Asset>,
  sprites: StageSprite[]
): ResolvedSprite[] {
  return sprites.map((s) => {
    const character = characters[s.characterId]
    const expression = character?.expressions.find((e) => e.id === s.expressionId)
    const asset = expression?.assetId ? (assets[expression.assetId] ?? null) : null
    const label = [character?.name ?? 'Unknown character', expression?.name].filter(Boolean).join(' · ')
    const out: ResolvedSprite = { key: s.characterId, position: s.position, asset, label }
    if (s.placement) out.placement = s.placement
    if (s.zorder !== undefined) out.zorder = s.zorder
    return out
  })
}

/** Speaker name and colour for a line. `characterId` null = narrator (no name). */
export function dialogueFor(project: Project, characterId: Id | null, text: string): StageDialogue {
  const character = characterId ? project.characters[characterId] : undefined
  return { speakerName: character?.name ?? null, speakerColor: character?.color ?? null, text }
}

/** `[name]` -> current value as text, for Quick play. Unknown names return undefined (shown as written). */
export function variableResolver(
  project: Project,
  values: Record<Id, boolean | number | string>
): (name: string) => string | undefined {
  const names = buildNameTable(project).variableRefs
  const byName = new Map<string, Id>()
  for (const [id, name] of Object.entries(names)) byName.set(name, id)
  return (name) => {
    const id = byName.get(name)
    if (id === undefined) return undefined
    const v = values[id]
    if (v === undefined) return undefined
    return typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v)
  }
}

/** Whether a background block that has run by the time the block at `path` has run set the background in this scene (see `appliedBlocks` for what counts as run). */
export function sceneSetsBackgroundAt(project: Project, sceneId: Id, path: BlockPath): boolean {
  const scene = project.scenes[sceneId]
  if (!scene) return false
  return appliedBlocks(scene.blocks, path).some((b) => b.type === 'background')
}

/** Whether a background block at or before the top-level block `blockIndex` has set the background in this scene. */
export function sceneSetsBackground(project: Project, sceneId: Id, blockIndex: number): boolean {
  return sceneSetsBackgroundAt(project, sceneId, [{ i: blockIndex }])
}
