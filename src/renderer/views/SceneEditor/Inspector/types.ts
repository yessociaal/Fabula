import type { BlockPath } from '@shared/blockTree'
import type { Block, Id } from '@shared/model'
import { useProjectStore } from '../../../store/projectStore'

export interface InspectorProps<T extends Block> {
  sceneId: Id
  block: T
  /** Position of the block in its own list (the last step of `path`). */
  index: number
  /** Where the block is in the scene's tree of blocks. */
  path: BlockPath
}

/** Returns a function that patches this block through the store. */
export function useBlockPatch<T extends Block>(sceneId: Id, blockId: Id): (patch: Partial<Omit<T, 'id' | 'type'>>) => void {
  const updateBlock = useProjectStore((s) => s.updateBlock)
  return (patch) => updateBlock<T>(sceneId, blockId, patch)
}
