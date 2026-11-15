import type { Id } from '@shared/model'
import { useUiStore } from './store/uiStore'

/** Open a scene. The Scene Editor arrives in a later step; until then the Shell shows a placeholder for it. */
export function goToScene(sceneId: Id): void {
  useUiStore.getState().openScene(sceneId)
}
