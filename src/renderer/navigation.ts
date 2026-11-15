import type { Id } from '@shared/model'
import { useUiStore } from './store/uiStore'

/** Open a scene in the Scene Editor. */
export function goToScene(sceneId: Id): void {
  useUiStore.getState().openScene(sceneId)
}
