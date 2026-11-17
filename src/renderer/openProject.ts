import type { Project } from '@shared/model'
import { useProjectStore } from './store/projectStore'
import { useSaveStatus } from './store/autosave'
import { api } from './api'
import { useKitStore } from './store/kitStore'
import { useUiStore } from './store/uiStore'

/** Put a loaded editor project into the stores and show the Shell. */
export function openProject(dir: string, project: Project): void {
  useUiStore.getState().reset()
  useProjectStore.getState().loadProject(dir, project)
  useSaveStatus.setState({ status: 'saved' })
  void useKitStore.getState().load(dir, api.listKits)
}

export function closeProject(): void {
  useUiStore.getState().reset()
  useProjectStore.setState({ dir: null, project: null, dirty: false })
  useProjectStore.temporal.getState().clear()
  void useKitStore.getState().load(null)
}
