import { create } from 'zustand'
import { cleanErrorMessage } from '@shared/ipc'
import { api } from '../api'
import { toast } from '../components/Toast'
import { useProjectStore } from './projectStore'

export const AUTOSAVE_DELAY_MS = 800

export type SaveStatus = 'saved' | 'saving' | 'error'

export const useSaveStatus = create<{ status: SaveStatus }>()(() => ({ status: 'saved' }))

let timer: ReturnType<typeof setTimeout> | null = null
let started = false

async function saveNow(): Promise<void> {
  timer = null
  const { dir, project } = useProjectStore.getState()
  if (!dir || !project) return
  useSaveStatus.setState({ status: 'saving' })
  try {
    await api.saveProject(dir, project)
    // Only call it saved if nothing changed while the write was in flight.
    if (useProjectStore.getState().project === project) {
      useProjectStore.getState().markSaved()
      useSaveStatus.setState({ status: 'saved' })
    }
  } catch (e) {
    useSaveStatus.setState({ status: 'error' })
    toast(`Could not save the story: ${cleanErrorMessage(e)}`, 'error')
  }
}

/** Subscribe to the project store once: 800 ms after the last change, save. */
export function startAutosave(): void {
  if (started) return
  started = true
  useProjectStore.subscribe((state, prev) => {
    if (!state.project || !state.dir) {
      if (timer) clearTimeout(timer)
      timer = null
      return
    }
    if (state.dirty && (!prev.dirty || state.project !== prev.project)) {
      useSaveStatus.setState({ status: 'saving' })
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void saveNow(), AUTOSAVE_DELAY_MS)
    }
  })
}

/** Save immediately if a save is waiting. Call before leaving the story. */
export async function flushAutosave(): Promise<void> {
  if (!timer) return
  clearTimeout(timer)
  await saveNow()
}
