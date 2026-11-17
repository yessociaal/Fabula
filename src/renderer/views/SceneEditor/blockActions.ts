import { create } from 'zustand'
import { findBlockPath, getBlockAt, splitPath, type BlockPath } from '@shared/blockTree'
import type { CreatableBlockType, Id } from '@shared/model'
import { toast } from '../../components/Toast'
import { useProjectStore, type BlockResult } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { batch } from '../../store/batch'
import { ALL_PALETTE, type PaletteEntry } from './blockMeta'
import { insertionAfter, neighbourId, selectionAfterDeleteAt, siblingMoveTarget, speakerBeforeBlock } from './editorHelpers'

/** A request to put the text cursor into a dialogue row (made after Enter creates a new line below). */
export const useFocusRequest = create<{ blockId: Id | null; request(id: Id | null): void }>()((set) => ({
  blockId: null,
  request: (blockId) => set({ blockId })
}))

const store = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const sceneOf = (sceneId: Id) => store().project?.scenes[sceneId]

/** Show the reason when the store refused a block action (for example, nesting deeper than 4 levels). */
export function reportRefusal(result: BlockResult): boolean {
  if (result.ok) return true
  toast(result.error, 'error')
  return false
}

/**
 * Add a palette entry at `at` (a block path whose last step is the insertion index) and select the new block.
 * A new Dialogue starts with the previous speaker. Returns null (after showing a toast) when refused.
 */
export function addEntryAtPath(sceneId: Id, entry: PaletteEntry, at: BlockPath): Id | null {
  if (!sceneOf(sceneId)) return null
  let refused = false
  const id = batch(() => {
    const result = entry.kit ? store().addKitBlockAt(sceneId, entry.kit.kitId, entry.kit.blockType, at) : store().addBlockAt(sceneId, entry.type as CreatableBlockType, at)
    if (!result.ok) {
      refused = true
      reportRefusal(result)
      return null
    }
    const newId = result.id
    const project = store().project
    const scene = sceneOf(sceneId)
    if (newId && project && scene && entry.type === 'say' && !entry.narration) {
      const speaker = speakerBeforeBlock(project, scene, newId)
      if (speaker !== null) store().updateBlock(sceneId, newId, { characterId: speaker })
    }
    return newId
  })
  if (id && !refused) useUiStore.getState().selectBlock(id)
  return id
}

/** Add a palette entry at index `index` of the scene's own list. */
export function addEntryAt(sceneId: Id, entry: PaletteEntry, index: number): Id | null {
  return addEntryAtPath(sceneId, entry, [{ i: index }])
}

export function addEntryByKey(sceneId: Id, key: string, index: number): Id | null {
  const entry = ALL_PALETTE.find((p) => p.key === key)
  return entry ? addEntryAt(sceneId, entry, index) : null
}

/** Click on a palette entry: insert after the selected block (in its own list), or at the end. */
export function appendEntry(sceneId: Id, entry: PaletteEntry): Id | null {
  const scene = sceneOf(sceneId)
  if (!scene) return null
  return addEntryAtPath(sceneId, entry, insertionAfter(scene.blocks, useUiStore.getState().selectedBlockId))
}

/** Enter in a dialogue row: a new Dialogue below with the same speaker, cursor inside it. Works at any depth. */
export function addDialogueBelow(sceneId: Id, blockId: Id, currentText: string): void {
  const scene = sceneOf(sceneId)
  const path = scene ? findBlockPath(scene.blocks, blockId) : null
  const src = scene && path ? getBlockAt(scene.blocks, path) : undefined
  if (!scene || !path || !src || src.type !== 'say') return
  const { container, index } = splitPath(path)
  const id = batch(() => {
    if (currentText !== src.text) store().updateBlock(sceneId, blockId, { text: currentText })
    const newId = store().addBlock(sceneId, 'say', [...container, { i: index + 1 }])
    if (newId && src.characterId !== null) store().updateBlock(sceneId, newId, { characterId: src.characterId })
    return newId
  })
  if (id) {
    useUiStore.getState().selectBlock(id)
    useFocusRequest.getState().request(id)
  }
}

export function deleteSelected(sceneId: Id): void {
  const scene = sceneOf(sceneId)
  const sel = useUiStore.getState().selectedBlockId
  if (!scene || !sel || !findBlockPath(scene.blocks, sel)) return
  const next = selectionAfterDeleteAt(scene.blocks, sel)
  store().deleteBlock(sceneId, sel)
  useUiStore.getState().selectBlock(next)
}

export function duplicateSelected(sceneId: Id): void {
  const scene = sceneOf(sceneId)
  const sel = useUiStore.getState().selectedBlockId
  if (!scene || !sel || !findBlockPath(scene.blocks, sel)) return
  const id = store().duplicateBlock(sceneId, sel)
  if (id) useUiStore.getState().selectBlock(id)
}

/** Up / Down: move the selection through the rows in the order they appear on screen. */
export function moveSelection(sceneId: Id, delta: number): void {
  const scene = sceneOf(sceneId)
  if (!scene) return
  const next = neighbourId(scene.blocks, useUiStore.getState().selectedBlockId, delta)
  if (next) useUiStore.getState().selectBlock(next)
}

/** Alt+Up / Alt+Down: swap the selected block with its neighbour in the same area. Does nothing at the edge of the area. */
export function moveSelectedBlock(sceneId: Id, delta: number): void {
  const scene = sceneOf(sceneId)
  const sel = useUiStore.getState().selectedBlockId
  if (!scene || !sel || (delta !== 1 && delta !== -1)) return
  const move = siblingMoveTarget(scene.blocks, sel, delta)
  if (move) reportRefusal(store().moveBlock(sceneId, move.from, move.to))
}
