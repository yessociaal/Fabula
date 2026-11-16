import type { Block, Id, Project, StagePosition } from './model'
import type { CustomPlacement } from './placement'
import { listOf, type BlockPath } from './blockTree'

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

/** Blocks that change the stage when a container runs in full: an If runs its Then branch, an inline Choice its first option. */
function expandInto(blocks: Block[], out: Block[]): void {
  for (const b of blocks) {
    if (b.type === 'if') expandInto(b.then, out)
    else if (b.type === 'inlineChoice') expandInto(b.options[0]?.blocks ?? [], out)
    else out.push(b)
  }
}

/**
 * The plain blocks that have run, in order, when the block at `path` has just run (or, with `inclusive` false, is about to run).
 *
 * NESTING RULE (also what the stage preview shows):
 * - Blocks before the target at every level above it apply.
 * - Inside a branch, only that branch's blocks before the target apply. The other branches are ignored.
 * - A container that is passed over (it sits before the target, or is the selected block itself) counts as
 *   its Then branch for an If, and as its first option for an inline Choice. When the player's real path is
 *   unknown the preview shows the first one rather than guessing.
 * - A Visit block changes nothing: what the visited scene does to the stage is not simulated.
 */
export function appliedBlocks(blocks: Block[], path: BlockPath, inclusive = true): Block[] {
  const out: Block[] = []
  const go = (list: Block[], steps: BlockPath): void => {
    const step = steps[0]
    for (let j = 0; j < step.i && j < list.length; j++) expandInto([list[j]], out)
    const target = list[step.i]
    if (!target) return
    if (steps.length === 1) {
      if (inclusive) expandInto([target], out)
      return
    }
    const inner = step.in === undefined ? undefined : listOf(target, step.in)
    if (inner) go(inner, steps.slice(1))
  }
  if (path.length > 0) go(blocks, path)
  return out
}

/** Stage after the block at `path` (inclusive), or just before it when `inclusive` is false. See `appliedBlocks` for the nesting rule. */
export function computeStageAt(project: Project, sceneId: Id, path: BlockPath, inclusive = true): StageState {
  const state: StageState = { background: null, sprites: [], music: null }
  const scene = project.scenes[sceneId]
  if (!scene) return state
  for (const b of appliedBlocks(scene.blocks, path, inclusive)) applyBlockToStage(state, b)
  return state
}

/**
 * State of the stage after the top-level block at `blockIndex` has run (inclusive).
 * Use -1 for "before the first block". Carry-over from earlier scenes is not computed.
 * For blocks inside containers use `computeStageAt`.
 */
export function computeStage(project: Project, sceneId: Id, blockIndex: number): StageState {
  const scene = project.scenes[sceneId]
  if (!scene || blockIndex < 0) return { background: null, sprites: [], music: null }
  return computeStageAt(project, sceneId, [{ i: Math.min(blockIndex, scene.blocks.length - 1) }])
}
