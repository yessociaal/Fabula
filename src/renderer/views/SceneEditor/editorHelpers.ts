import type { Block, Id, Project, Scene, Transition } from '@shared/model'
import { computeStage } from '@shared/stage'

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

/** Selection moved by `delta` rows, clamped. With nothing selected, Down picks the first row and Up the last. */
export function neighbourId(blocks: Block[], selectedId: Id | null, delta: number): Id | null {
  if (blocks.length === 0) return null
  const at = selectedId === null ? -1 : blocks.findIndex((b) => b.id === selectedId)
  if (at < 0) return blocks[delta > 0 ? 0 : blocks.length - 1].id
  return blocks[Math.max(0, Math.min(blocks.length - 1, at + delta))].id
}
