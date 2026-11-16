import type { Block, Id, Project, StagePosition } from './model'
import type { CustomPlacement } from './placement'

export type { CustomPlacement }

export interface StageSprite {
  characterId: Id
  expressionId: Id | null
  position: StagePosition
  /** Only present when the show block uses a custom placement. */
  placement?: CustomPlacement
  /** Only present when the layer order is not 0. */
  zorder?: number
}

export interface StageState {
  background: Id | null
  sprites: StageSprite[]
  music: Id | null
}

/** Apply one block to a stage state in place. Blocks that do not touch the stage change nothing. */
export function applyBlockToStage(state: StageState, b: Block): void {
  switch (b.type) {
    case 'background':
      state.background = b.assetId
      state.sprites = []
      break
    case 'show': {
      if (b.characterId === null) break
      const sprite: StageSprite = { characterId: b.characterId, expressionId: b.expressionId, position: b.position }
      if (b.placement.mode === 'custom') sprite.placement = { ...b.placement }
      if (b.zorder !== 0) sprite.zorder = b.zorder
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

/**
 * State of the stage after the block at `blockIndex` has run (inclusive).
 * Use -1 for "before the first block". Carry-over from earlier scenes is not computed.
 */
export function computeStage(project: Project, sceneId: Id, blockIndex: number): StageState {
  const state: StageState = { background: null, sprites: [], music: null }
  const scene = project.scenes[sceneId]
  if (!scene) return state
  const last = Math.min(blockIndex, scene.blocks.length - 1)
  for (let i = 0; i <= last; i++) applyBlockToStage(state, scene.blocks[i])
  return state
}
