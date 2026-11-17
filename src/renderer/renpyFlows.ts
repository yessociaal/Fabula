import { cleanErrorMessage } from '@shared/ipc'
import { parseLintReport } from '@shared/lintReport'
import { storyHasCode } from '@shared/scriptFiles'
import type { Id, Project } from '@shared/model'
import { validateProject } from '@shared/validate'
import { api } from './api'
import { toast } from './components/Toast'
import { joinPath, safeFolderName } from './pathUtil'
import { flushAutosave } from './store/autosave'
import { useProjectStore } from './store/projectStore'
import { useUiStore } from './store/uiStore'

export { storyHasCode }

const ui = (): ReturnType<typeof useUiStore.getState> => useUiStore.getState()

/** Run one Ren'Py task at a time. Returns false when another one is already running. */
async function exclusive(name: string, task: () => Promise<void>): Promise<void> {
  if (ui().busy) {
    toast(`Still busy: ${ui().busy}. Wait for it to finish.`)
    return
  }
  ui().setBusy(name)
  try {
    await task()
  } catch (e) {
    toast(cleanErrorMessage(e), 'error')
  } finally {
    ui().setBusy(null)
  }
}

/** Save, then validate. Errors open the Problems drawer. Warnings never block. */
async function saveAndValidate(): Promise<{ dir: string; project: Project } | null> {
  await flushAutosave()
  const { dir, project } = useProjectStore.getState()
  if (!dir || !project) return null
  const errors = validateProject(project).filter((p) => p.severity === 'error')
  if (errors.length > 0) {
    ui().setProblemsOpen(true)
    toast(errors.length === 1 ? 'Fix 1 problem before running the game.' : `Fix ${errors.length} problems before running the game.`, 'error')
    return null
  }
  return { dir, project }
}

/** Export into the linked Ren'Py game. Returns the scene locations, or null after showing why not. */
async function exportNow(dir: string, project: Project): Promise<Record<Id, { file: string; line: number }> | null> {
  const result = await api.exportToRenpy(dir, project)
  if (!result.ok) {
    if (result.problems?.some((p) => p.severity === 'error')) ui().setProblemsOpen(true)
    toast(result.error ?? "Could not export to Ren'Py.", 'error')
    return null
  }
  return result.sceneLocations ?? {}
}

/**
 * When the story has hand-written code (a code block, a code ending or a script file), let Ren'Py lint the freshly
 * exported game. Nothing is shown when lint is clean; otherwise the lint report opens with the file and line of each problem.
 */
async function lintIfCode(renpyDir: string, project: Project): Promise<void> {
  if (!storyHasCode(project)) return
  ui().setBusy("Checking your code with Ren'Py lint…")
  const result = await api.renpyLint(renpyDir)
  const summary = parseLintReport(result.report)
  if (!result.ok || !summary.ok) ui().setLintReport({ ok: false, report: result.report })
}

/** Save, validate, make sure a Ren'Py game is linked (asking to create one if not), then run `then` with the export done. */
async function withExport(
  name: string,
  then: (ctx: { dir: string; project: Project; renpyDir: string; locations: Record<Id, { file: string; line: number }> }) => Promise<void>,
  retry: () => void
): Promise<void> {
  await exclusive(name, async () => {
    const ready = await saveAndValidate()
    if (!ready) return
    if (!ready.project.renpyProjectDir) {
      ui().openCreateGame(retry)
      return
    }
    ui().setBusy('Exporting…')
    const locations = await exportNow(ready.dir, ready.project)
    if (!locations) return
    await then({ ...ready, renpyDir: ready.project.renpyProjectDir, locations })
  })
}

/** Top bar "Play in Ren'Py" and the "Play from here in Ren'Py" entries. */
export function playInRenpy(fromSceneId?: Id): void {
  void withExport(
    'Starting Ren\'Py…',
    async ({ renpyDir, locations, project }) => {
      await lintIfCode(renpyDir, project)
      ui().setBusy("Starting Ren'Py…")
      let warp: { file: string; line: number } | undefined
      if (fromSceneId !== undefined) {
        const at = locations[fromSceneId]
        if (!at) {
          toast('That scene is not in the exported game yet, so the game starts from the beginning.')
        } else {
          warp = { file: at.file, line: at.line + 1 }
        }
      }
      let result = await api.renpyRun(renpyDir, warp)
      if (!result.ok && warp) {
        toast("Ren'Py could not jump to that scene. Starting from the beginning instead.")
        result = await api.renpyRun(renpyDir)
      }
      if (!result.ok) ui().setRenpyError(result.error ?? "Ren'Py could not start the game.")
    },
    () => playInRenpy(fromSceneId)
  )
}

export function exportToRenpyFlow(): void {
  void withExport(
    'Exporting…',
    async ({ renpyDir, project }) => {
      toast(`Exported to ${renpyDir}`, 'ok')
      await lintIfCode(renpyDir, project)
    },
    () => exportToRenpyFlow()
  )
}

export function lintFlow(): void {
  void withExport(
    'Checking with Ren\'Py lint…',
    async ({ renpyDir }) => {
      const result = await api.renpyLint(renpyDir)
      ui().setLintReport(result)
    },
    () => lintFlow()
  )
}

export function buildFlow(): void {
  void withExport(
    'Building the game…',
    async ({ renpyDir, project }) => {
      ui().setBusy(null)
      const base = await api.pickFolder('Choose where to put the game build')
      if (!base) return
      ui().setBusy('Building the game…')
      toast('Building the game. This can take a minute or two.')
      const dest = joinPath(base, `${safeFolderName(project.meta.title)} (build)`)
      const result = await api.renpyDistribute(renpyDir, dest)
      if (!result.ok) {
        ui().setRenpyError(result.error ?? "Ren'Py could not build the game.")
        return
      }
      toast(`Game built in ${dest}`, 'ok')
      await api.revealInExplorer(dest)
    },
    () => buildFlow()
  )
}

export function openGameFolder(): void {
  const dir = useProjectStore.getState().project?.renpyProjectDir
  if (!dir) {
    ui().openCreateGame(() => openGameFolder())
    return
  }
  void api.revealInExplorer(dir)
}

/** Create the Ren'Py game at `target`, link it to the story and keep the link in the saved story. */
export async function createRenpyGame(
  target: string,
  meta: { width: number; height: number; accentColor: string }
): Promise<{ ok: boolean; error?: string }> {
  const result = await api.renpyCreateProject(target, { width: meta.width, height: meta.height, accent: meta.accentColor })
  if (!result.ok) return { ok: false, error: result.error ?? "Ren'Py could not create the game." }
  useProjectStore.getState().setRenpyProjectDir(target)
  return { ok: true }
}
