import type { Id, Project, StagePosition } from './model'

export interface StageSprite {
  characterId: Id
  expressionId: Id | null
  position: StagePosition
}

export interface StageState {
  background: Id | null
  sprites: StageSprite[]
  music: Id | null
}

/**
 * State of the stage after the block at `blockIndex` has run (inclusive).
 * Use -1 for "before the first block". Carry-over from earlier scenes is not computed.
 */
export function computeStage(project: Project, sceneId: Id, blockIndex: number): StageState {
  const state: StageState = { background: null, sprites: [], music: null }
  const scene = project.scenes[sceneId]
  if (!scene) return state
  const last = Math.min(blockIndex, scene.blocks.length - 1)
  for (let i = 0; i <= last; i++) {
    const b = scene.blocks[i]
    switch (b.type) {
      case 'background':
        state.background = b.assetId
        state.sprites = []
        break
      case 'show': {
        if (b.characterId === null) break
        const sprite: StageSprite = { characterId: b.characterId, expressionId: b.expressionId, position: b.position }
        const at = state.sprites.findIndex((s) => s.characterId === b.characterId)
        if (at >= 0) state.sprites[at] = sprite
        else state.sprites.push(sprite)
        break
      }
      case 'hide':
        state.sprites = state.sprites.filter((s) => s.characterId !== b.characterId)
        break
      case 'playMusic':
        if (b.channel === 'music') state.music = b.assetId
        break
      case 'stopMusic':
        if (b.channel === 'music') state.music = null
        break
      default:
        break
    }
  }
  return state
}
