import { create } from 'zustand'
import type { Id } from '@shared/model'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { batch } from '../../store/batch'
import { PALETTE, type PaletteEntry } from './blockMeta'
import { appendIndex, defaultSpeaker, neighbourId, selectionAfterDelete } from './editorHelpers'

/** A request to put the text cursor into a dialogue row (made after Enter creates a new line below). */
export const useFocusRequest = create<{ blockId: Id | null; request(id: Id | null): void }>()((set) => ({
  blockId: null,
  request: (blockId) => set({ blockId })
}))

const store = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const sceneOf = (sceneId: Id) => store().project?.scenes[sceneId]

/** Add a palette entry at `index` and select the new block. A new Dialogue starts with the previous speaker. */
export function addEntryAt(sceneId: Id, entry: PaletteEntry, index: number): Id | null {
  const scene = sceneOf(sceneId)
  const project = store().project
  if (!scene || !project) return null
  const id = batch(() => {
    const newId = store().addBlock(sceneId, entry.type, index)
    if (newId && entry.type === 'say' && !entry.narration) {
      const speaker = defaultSpeaker(project, scene, index)
      if (speaker !== null) store().updateBlock(sceneId, newId, { characterId: speaker })
    }
    return newId
  })
  if (id) useUiStore.getState().selectBlock(id)
  return id
}

export function addEntryByKey(sceneId: Id, key: string, index: number): Id | null {
  const entry = PALETTE.find((p) => p.key === key)
  return entry ? addEntryAt(sceneId, entry, index) : null
}

/** Click on a palette entry: insert after the selected block, or at the end. */
export function appendEntry(sceneId: Id, entry: PaletteEntry): Id | null {
  const scene = sceneOf(sceneId)
  if (!scene) return null
  return addEntryAt(sceneId, entry, appendIndex(scene.blocks, useUiStore.getState().selectedBlockId))
}

/** Enter in a dialogue row: a new Dialogue below with the same speaker, cursor inside it. */
export function addDialogueBelow(sceneId: Id, blockId: Id, currentText: string): void {
  const scene = sceneOf(sceneId)
  const at = scene?.blocks.findIndex((b) => b.id === blockId) ?? -1
  const src = at >= 0 ? scene?.blocks[at] : undefined
  if (!scene || !src || src.type !== 'say') return
  const id = batch(() => {
    if (currentText !== src.text) store().updateBlock(sceneId, blockId, { text: currentText })
    const newId = store().addBlock(sceneId, 'say', at + 1)
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
  const at = scene && sel ? scene.blocks.findIndex((b) => b.id === sel) : -1
  if (!scene || at < 0) return
  const next = selectionAfterDelete(scene.blocks, at)
  store().deleteBlock(sceneId, scene.blocks[at].id)
  useUiStore.getState().selectBlock(next)
}

export function duplicateSelected(sceneId: Id): void {
  const sel = useUiStore.getState().selectedBlockId
  if (!sel || !sceneOf(sceneId)?.blocks.some((b) => b.id === sel)) return
  const id = store().duplicateBlock(sceneId, sel)
  if (id) useUiStore.getState().selectBlock(id)
}

export function moveSelection(sceneId: Id, delta: number): void {
  const scene = sceneOf(sceneId)
  if (!scene) return
  const next = neighbourId(scene.blocks, useUiStore.getState().selectedBlockId, delta)
  if (next) useUiStore.getState().selectBlock(next)
}

export function moveSelectedBlock(sceneId: Id, delta: number): void {
  const scene = sceneOf(sceneId)
  const sel = useUiStore.getState().selectedBlockId
  const at = scene && sel ? scene.blocks.findIndex((b) => b.id === sel) : -1
  if (!scene || at < 0) return
  const to = at + delta
  if (to < 0 || to >= scene.blocks.length) return
  store().moveBlock(sceneId, at, to)
}
