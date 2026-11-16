import {
  blockHeight,
  childLists,
  findBlockPath,
  fitsDepth,
  flattenBlocks,
  getBlockAt,
  isInsidePath,
  resolveList,
  splitPath,
  type BlockPath,
  type BranchKey
} from '@shared/blockTree'
import type { Block, Id, Project, Scene, Transition } from '@shared/model'
import { computeStage, computeStageAt } from '@shared/stage'

export interface TextEdit {
  text: string
  /** Where the selection (or caret, when equal) should be after the edit. */
  selStart: number
  selEnd: number
}

/** Wrap the selection in `open` / `close` (e.g. `{b}` / `{/b}`). With nothing selected the caret lands between the tags. */
export function wrapSelection(text: string, start: number, end: number, open: string, close: string): TextEdit {
  const a = Math.max(0, Math.min(start, end, text.length))
  const b = Math.max(a, Math.min(Math.max(start, end), text.length))
  return {
    text: text.slice(0, a) + open + text.slice(a, b) + close + text.slice(b),
    selStart: a + open.length,
    selEnd: b + open.length
  }
}

/** Replace the selection with `insert` and put the caret after it. */
export function insertAtSelection(text: string, start: number, end: number, insert: string): TextEdit {
  const a = Math.max(0, Math.min(start, end, text.length))
  const b = Math.max(a, Math.min(Math.max(start, end), text.length))
  const caret = a + insert.length
  return { text: text.slice(0, a) + insert + text.slice(b), selStart: caret, selEnd: caret }
}

export const TRANSITION_OPTIONS: { value: Transition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'fade', label: 'Fade' },
  { value: 'pixellate', label: 'Pixellate' },
  { value: 'hpunch', label: 'Shake sideways' },
  { value: 'vpunch', label: 'Shake up and down' },
  { value: 'wipeleft', label: 'Wipe left' },
  { value: 'wiperight', label: 'Wipe right' },
  { value: 'slideleft', label: 'Slide left' },
  { value: 'slideright', label: 'Slide right' },
  { value: 'moveinleft', label: 'Move in from the left' },
  { value: 'moveinright', label: 'Move in from the right' },
  { value: 'moveoutleft', label: 'Move out to the left' },
  { value: 'moveoutright', label: 'Move out to the right' },
  { value: 'zoomin', label: 'Zoom in' },
  { value: 'zoomout', label: 'Zoom out' }
]

export function transitionLabel(t: Transition): string {
  return TRANSITION_OPTIONS.find((o) => o.value === t)?.label ?? t
}

/** Speaker a new Dialogue block starts with: the closest earlier speaker in the scene, else the first character, else the narrator. */
export function defaultSpeaker(project: Project, scene: Scene, beforeIndex: number): Id | null {
  for (let i = Math.min(beforeIndex, scene.blocks.length) - 1; i >= 0; i--) {
    const b = scene.blocks[i]
    if (b.type === 'say' && b.characterId !== null && project.characters[b.characterId]) return b.characterId
  }
  return project.characterOrder.find((id) => project.characters[id]) ?? null
}

/** Characters on stage just before the block at `blockIndex` (they are what a Hide block can remove), then everyone else. */
export function charactersForHide(
  project: Project,
  sceneId: Id,
  blockIndex: number
): { onStage: Id[]; others: Id[] } {
  const stage = computeStage(project, sceneId, blockIndex - 1)
  const onStage = stage.sprites.map((s) => s.characterId).filter((id) => project.characters[id])
  const others = project.characterOrder.filter((id) => project.characters[id] && !onStage.includes(id))
  return { onStage, others }
}

/** Same as `charactersForHide` for a block anywhere in the tree: the stage as it is just before the block at `path`. */
export function charactersForHideAt(project: Project, sceneId: Id, path: BlockPath): { onStage: Id[]; others: Id[] } {
  const stage = computeStageAt(project, sceneId, path, false)
  const onStage = stage.sprites.map((s) => s.characterId).filter((id) => project.characters[id])
  const others = project.characterOrder.filter((id) => project.characters[id] && !onStage.includes(id))
  return { onStage, others }
}

/** Index a clicked palette entry inserts at: right after the selected block, or the end. */
export function appendIndex(blocks: Block[], selectedId: Id | null): number {
  const at = selectedId === null ? -1 : blocks.findIndex((b) => b.id === selectedId)
  return at < 0 ? blocks.length : at + 1
}

/** Which block to select after deleting the one at `deletedIndex` (the one that takes its place, else the one before). */
export function selectionAfterDelete(blocks: Block[], deletedIndex: number): Id | null {
  const rest = blocks.filter((_, i) => i !== deletedIndex)
  if (rest.length === 0) return null
  return rest[Math.min(deletedIndex, rest.length - 1)].id
}

/** Where a palette item dropped over row `overIndex` is inserted: before it, or after it when dropped on its lower half. */
export function dropInsertIndex(overIndex: number, onLowerHalf: boolean): number {
  return overIndex + (onLowerHalf ? 1 : 0)
}

/**
 * Selection moved by `delta` rows in the order the rows appear on screen (a container, then what is inside it), clamped.
 * With nothing selected, Down picks the first row and Up the last.
 */
export function neighbourId(blocks: Block[], selectedId: Id | null, delta: number): Id | null {
  const flat = flattenBlocks(blocks)
  if (flat.length === 0) return null
  const at = selectedId === null ? -1 : flat.findIndex((f) => f.block.id === selectedId)
  if (at < 0) return flat[delta > 0 ? 0 : flat.length - 1].block.id
  return flat[Math.max(0, Math.min(flat.length - 1, at + delta))].block.id
}

/** Where a click on a palette entry inserts: right after the selected block in its own list, else at the end of the scene. */
export function insertionAfter(blocks: Block[], selectedId: Id | null): BlockPath {
  const path = selectedId === null ? null : findBlockPath(blocks, selectedId)
  if (!path) return [{ i: blocks.length }]
  const { container, index } = splitPath(path)
  return [...container, { i: index + 1 }]
}

/** Key of one list of blocks: 'root' for the scene itself, else '<containerBlockId>:<branchKey>'. */
export function listKeyOf(parentId: Id | null, key: BranchKey | null): string {
  return parentId === null || key === null ? 'root' : `${parentId}:${key}`
}

/** Droppable ids: one per container area (appends to that area) and one for the end of the scene's own list. */
export const AREA_PREFIX = 'area:'
export const LIST_END = 'list-end'
export const areaId = (blockId: Id, key: BranchKey): string => `${AREA_PREFIX}${blockId}:${key}`

export interface DropTarget {
  /** Block path whose last step is the insertion index (the format the moveBlock and addBlockAt actions take). */
  path: BlockPath
  /** Identifies the list ('root' or '<blockId>:<key>') so that list can draw the insertion line. */
  listKey: string
  index: number
  /** False when a block of the dragged height would nest too deep there. */
  fits: boolean
}

/**
 * Turn "the pointer is over this droppable" into an insertion position.
 * `overId` is a block id (insert before it, or after it when `lowerHalf`), an area id (append to that area) or LIST_END.
 * `dragging` is the block being moved: nothing can be dropped on it or inside it (null). `height` is how many levels the dragged thing needs.
 */
export function resolveDrop(blocks: Block[], overId: string, lowerHalf: boolean, height = 1, dragging: Id | null = null): DropTarget | null {
  const finish = (container: BlockPath, parentId: Id | null, key: BranchKey | null, index: number): DropTarget | null => {
    const path: BlockPath = [...container, { i: index }]
    if (dragging !== null) {
      const from = findBlockPath(blocks, dragging)
      if (from && path.length > from.length && isInsidePath(path, from)) return null
    }
    return { path, listKey: listKeyOf(parentId, key), index, fits: fitsDepth(path.length, height) }
  }
  if (overId === LIST_END) return finish([], null, null, blocks.length)
  if (overId.startsWith(AREA_PREFIX)) {
    const rest = overId.slice(AREA_PREFIX.length)
    const colon = rest.indexOf(':')
    if (colon < 0) return null
    const id = rest.slice(0, colon)
    const key = rest.slice(colon + 1) as BranchKey
    const at = findBlockPath(blocks, id)
    const block = at ? getBlockAt(blocks, at) : undefined
    const list = block ? childLists(block).find((l) => l.key === key) : undefined
    if (!at || !list) return null
    const container: BlockPath = [...at.slice(0, -1), { i: at[at.length - 1].i, in: key }]
    return finish(container, id, key, list.blocks.length)
  }
  if (dragging !== null && overId === dragging) return null
  const at = findBlockPath(blocks, overId)
  if (!at) return null
  const { container, index } = splitPath(at)
  const last = container[container.length - 1]
  const parent = last ? getBlockAt(blocks, [...container.slice(0, -1), { i: last.i }]) : undefined
  return finish(container, parent ? parent.id : null, last ? (last.in as BranchKey) : null, index + (lowerHalf ? 1 : 0))
}

/** How many levels a block (and what is inside it) needs, for the depth check while dragging. */
export function dragHeight(blocks: Block[], id: Id): number {
  const path = findBlockPath(blocks, id)
  const block = path ? getBlockAt(blocks, path) : undefined
  return block ? blockHeight(block) : 1
}

/** Alt+Up / Alt+Down: the move that swaps a block with its neighbour in the same list. Null at the edge of the list. */
export function siblingMoveTarget(blocks: Block[], id: Id, delta: -1 | 1): { from: BlockPath; to: BlockPath } | null {
  const from = findBlockPath(blocks, id)
  if (!from) return null
  const { container, index } = splitPath(from)
  const list = resolveList(blocks, container)
  if (!list) return null
  const next = index + delta
  if (next < 0 || next >= list.length) return null
  return { from, to: [...container, { i: delta > 0 ? next + 1 : next }] }
}

/** Selection after a block is deleted: whatever takes its place in the same list, else the previous one, else the container it was in. */
export function selectionAfterDeleteAt(blocks: Block[], id: Id): Id | null {
  const path = findBlockPath(blocks, id)
  if (!path) return null
  const { container, index } = splitPath(path)
  const list = resolveList(blocks, container) ?? []
  const rest = list.filter((_, i) => i !== index)
  if (rest.length > 0) return rest[Math.min(index, rest.length - 1)].id
  if (container.length === 0) return null
  const last = container[container.length - 1]
  return getBlockAt(blocks, [...container.slice(0, -1), { i: last.i }])?.id ?? null
}

/** Speaker for a new Dialogue block: the closest earlier speaker in reading order before `blockId`, else the first character, else the narrator. */
export function speakerBeforeBlock(project: Project, scene: Scene, blockId: Id): Id | null {
  const flat = flattenBlocks(scene.blocks)
  const at = flat.findIndex((f) => f.block.id === blockId)
  for (let i = at - 1; i >= 0; i--) {
    const b = flat[i].block
    if (b.type === 'say' && b.characterId !== null && project.characters[b.characterId]) return b.characterId
  }
  return project.characterOrder.find((id) => project.characters[id]) ?? null
}

/** Path that appends a block to the end of one area of a container (null when the container or area does not exist). */
export function insertionIntoArea(blocks: Block[], parentId: Id, key: BranchKey): BlockPath | null {
  const at = findBlockPath(blocks, parentId)
  const parent = at ? getBlockAt(blocks, at) : undefined
  const list = parent ? childLists(parent).find((l) => l.key === key) : undefined
  if (!at || !list) return null
  return [...at.slice(0, -1), { i: at[at.length - 1].i, in: key }, { i: list.blocks.length }]
}
