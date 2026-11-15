import type { Id } from '@shared/model'
import { toast } from './components/Toast'
import { useUiStore } from './store/uiStore'

/** Select a scene. The Scene Editor arrives in a later step, so for now this only remembers the choice. */
export function goToScene(sceneId: Id): void {
  useUiStore.setState({ sceneId })
  toast('Scene Editor arrives in a later step')
}
