import { create } from 'zustand'
import type { Id } from '@shared/model'
import type { SceneClipboard } from '@shared/sceneClipboard'

/** Story Map UI state that is neither project data (not undoable, not saved) nor shared with other views. */
interface MapUiState {
  /** The scene whose name is being edited inline on its card. */
  renamingId: Id | null
  query: string
  /** Index of the next match Enter will centre on. */
  matchIndex: number
  /** In-memory clipboard for Ctrl+C / Ctrl+V of scenes. */
  clipboard: SceneClipboard | null
  /** How many times the current clipboard was pasted (each paste moves 40px further). */
  pasteCount: number

  setRenaming(id: Id | null): void
  setQuery(query: string): void
  setMatchIndex(i: number): void
  setClipboard(clip: SceneClipboard | null): void
  /** Offset (in px, both axes) for the next paste of the current clipboard: 40, then 80, ... */
  nextPasteOffset(): number
}

export const PASTE_STEP = 40

export const useMapUi = create<MapUiState>()((set, get) => ({
  renamingId: null,
  query: '',
  matchIndex: 0,
  clipboard: null,
  pasteCount: 0,
  setRenaming: (renamingId) => set({ renamingId }),
  setQuery: (query) => set({ query, matchIndex: 0 }),
  setMatchIndex: (matchIndex) => set({ matchIndex }),
  setClipboard: (clipboard) => set({ clipboard, pasteCount: 0 }),
  nextPasteOffset: () => {
    const n = get().pasteCount + 1
    set({ pasteCount: n })
    return n * PASTE_STEP
  }
}))
