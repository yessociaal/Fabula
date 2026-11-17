import { create } from 'zustand'
import type { KitContext, LoadedKit } from '@shared/kits/types'

export interface KitState {
  kits: LoadedKit[]
  loaded: boolean
  /** Read the kits again for the story in `dir` with `list` (api.listKits): the built-in kits plus the story's own kits folder. */
  load(dir: string | null, list?: (dir: string) => Promise<LoadedKit[]>): Promise<void>
  set(kits: LoadedKit[]): void
}

export const useKitStore = create<KitState>()((set) => ({
  kits: [],
  loaded: false,
  async load(dir, list) {
    if (dir === null || !list) return set({ kits: [], loaded: false })
    try {
      set({ kits: await list(dir), loaded: true })
    } catch {
      set({ kits: [], loaded: true })
    }
  },
  set: (kits) => set({ kits, loaded: true })
}))

/** What validateProject, compileProject and friends take as their last argument. Use inside React components. */
export function useKitContext(): KitContext {
  const kits = useKitStore((s) => s.kits)
  return { kits }
}

/** The same, read right now (for code that is not a component). */
export function currentKitContext(): KitContext {
  return { kits: useKitStore.getState().kits }
}
