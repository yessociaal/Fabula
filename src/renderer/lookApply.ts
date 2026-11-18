import { cleanErrorMessage } from '@shared/ipc'
import type { ApplyLookResult } from '@shared/look'
import { lookRequest, lookSummary } from '@shared/lookRequest'
import { api } from './api'
import { toast } from './components/Toast'
import { useProjectStore } from './store/projectStore'

/**
 * Write the story's saved Look & Feel values into the linked Ren'Py game (only the lines they belong to).
 * Returns null when there is nothing to write or no game, and shows one toast with the outcome.
 */
export async function applyStoredLook(only?: readonly string[]): Promise<ApplyLookResult | null> {
  const { dir, project } = useProjectStore.getState()
  if (!dir || !project?.renpyProjectDir) return null
  const request = lookRequest(project, only)
  if (Object.keys(request.values).length === 0 && Object.keys(request.uploads).length === 0) return null
  try {
    const result = await api.applyLook(project.renpyProjectDir, dir, request.values, request.uploads)
    if (!result.ok) {
      toast(result.error ?? 'Could not write the Look & Feel to the game.', 'error')
      return result
    }
    toast(`Look & Feel: ${lookSummary(result.results, request.skipped.length)}`, result.results.every((r) => r.status === 'applied' || r.status === 'unchanged') ? 'ok' : 'info')
    return result
  } catch (e) {
    toast(cleanErrorMessage(e), 'error')
    return null
  }
}
