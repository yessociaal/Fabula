import { create } from 'zustand'
import type { Id } from '@shared/model'

export type View = 'map' | 'scene' | 'characters' | 'assets' | 'variables' | 'settings'

export interface UiState {
  view: View
  sceneId: Id | null
  selectedBlockId: Id | null
  selectedNodeIds: Id[]
  problemsOpen: boolean
  playtest: null | { fromSceneId: Id | null }

  setView(view: View): void
  openScene(sceneId: Id): void
  selectBlock(blockId: Id | null): void
  setSelectedNodes(ids: Id[]): void
  setProblemsOpen(open: boolean): void
  startPlaytest(fromSceneId: Id | null): void
  stopPlaytest(): void
  reset(): void
}

const initial = {
  view: 'map' as View,
  sceneId: null as Id | null,
  selectedBlockId: null as Id | null,
  selectedNodeIds: [] as Id[],
  problemsOpen: false,
  playtest: null as null | { fromSceneId: Id | null }
}

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  setView: (view) => set({ view }),
  openScene: (sceneId) => set({ view: 'scene', sceneId, selectedBlockId: null }),
  selectBlock: (selectedBlockId) => set({ selectedBlockId }),
  setSelectedNodes: (selectedNodeIds) => set({ selectedNodeIds }),
  setProblemsOpen: (problemsOpen) => set({ problemsOpen }),
  startPlaytest: (fromSceneId) => set({ playtest: { fromSceneId } }),
  stopPlaytest: () => set({ playtest: null }),
  reset: () => set({ ...initial })
}))
