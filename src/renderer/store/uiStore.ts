import { create } from 'zustand'
import type { Id } from '@shared/model'

export type View = 'map' | 'scene' | 'characters' | 'assets' | 'variables' | 'scripts' | 'kits' | 'screens' | 'look' | 'settings'

export interface UiState {
  view: View
  sceneId: Id | null
  selectedBlockId: Id | null
  /** The screen open in the Screen Designer, and the element selected on its canvas. */
  screenId: Id | null
  selectedElementId: Id | null
  selectedNodeIds: Id[]
  problemsOpen: boolean
  playtest: null | { fromSceneId: Id | null }
  /** The "Create Ren'Py game" modal. `after` runs once the game has been created. */
  createGame: null | { after: (() => void) | null }
  /** Text of an error reported by Ren'Py, shown in a modal. */
  renpyError: string | null
  /** The lint report modal. */
  lintReport: null | { ok: boolean; report: string }
  /** Name of the Ren'Py task that is running, to disable the buttons that would start another. */
  busy: string | null

  setView(view: View): void
  openScene(sceneId: Id): void
  selectBlock(blockId: Id | null): void
  /** Open the Screen Designer on a screen. */
  openScreen(screenId: Id | null, elementId?: Id | null): void
  selectElement(elementId: Id | null): void
  setSelectedNodes(ids: Id[]): void
  setProblemsOpen(open: boolean): void
  startPlaytest(fromSceneId: Id | null): void
  stopPlaytest(): void
  openCreateGame(after?: (() => void) | null): void
  closeCreateGame(): void
  setRenpyError(error: string | null): void
  setLintReport(report: null | { ok: boolean; report: string }): void
  setBusy(busy: string | null): void
  reset(): void
}

const initial = {
  view: 'map' as View,
  sceneId: null as Id | null,
  selectedBlockId: null as Id | null,
  screenId: null as Id | null,
  selectedElementId: null as Id | null,
  selectedNodeIds: [] as Id[],
  problemsOpen: false,
  playtest: null as null | { fromSceneId: Id | null },
  createGame: null as null | { after: (() => void) | null },
  renpyError: null as string | null,
  lintReport: null as null | { ok: boolean; report: string },
  busy: null as string | null
}

export const useUiStore = create<UiState>()((set) => ({
  ...initial,
  setView: (view) => set({ view }),
  openScene: (sceneId) => set({ view: 'scene', sceneId, selectedBlockId: null }),
  selectBlock: (selectedBlockId) => set({ selectedBlockId }),
  openScreen: (screenId, elementId = null) => set({ view: 'screens', screenId, selectedElementId: elementId }),
  selectElement: (selectedElementId) => set({ selectedElementId }),
  setSelectedNodes: (selectedNodeIds) => set({ selectedNodeIds }),
  setProblemsOpen: (problemsOpen) => set({ problemsOpen }),
  startPlaytest: (fromSceneId) => set({ playtest: { fromSceneId } }),
  stopPlaytest: () => set({ playtest: null }),
  openCreateGame: (after = null) => set({ createGame: { after } }),
  closeCreateGame: () => set({ createGame: null }),
  setRenpyError: (renpyError) => set({ renpyError }),
  setLintReport: (lintReport) => set({ lintReport }),
  setBusy: (busy) => set({ busy }),
  reset: () => set({ ...initial })
}))
