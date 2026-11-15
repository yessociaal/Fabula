import type { Asset, Character, Id, Project, StagePosition } from './model'
import type { StageSprite } from './stage'
import { buildNameTable } from './naming'

export interface ResolvedSprite {
  key: string
  position: StagePosition
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
    return { key: s.characterId, position: s.position, asset, label }
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
  const names = buildNameTable(project).variables
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

/** Whether a background block at or before `blockIndex` has set the background in this scene. */
export function sceneSetsBackground(project: Project, sceneId: Id, blockIndex: number): boolean {
  const scene = project.scenes[sceneId]
  if (!scene) return false
  return scene.blocks.slice(0, blockIndex + 1).some((b) => b.type === 'background')
}
