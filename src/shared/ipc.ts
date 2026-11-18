import type { Asset, Id, Project } from './model'
import type { LoadedKit } from './kits/types'
import type { Problem } from './validate'
import type { ApplyLookResult, LookReadEntry, LookUpload } from './look'

export interface RecentEntry {
  path: string
  title: string
  openedAt: number
}

export interface Settings {
  sdkDir: string | null
  /** Version of the SDK in sdkDir, read when settings are requested. Not stored on disk. */
  sdkVersion: string | null
  recent: RecentEntry[]
}

export interface RunResult {
  ok: boolean
  error?: string
  /** Process id of a game that was started (Ren'Py run only). */
  pid?: number
}

export interface ExportResult {
  ok: boolean
  error?: string
  sceneLocations?: Record<Id, { file: string; line: number }>
  /** Set when validation blocked the export (and also carries the warnings after a successful one). */
  problems?: Problem[]
  /** Game-relative paths written or deleted by this export. */
  changed?: string[]
}

/** Pushed from the main process to the renderer. */
export const RENPY_ERROR_EVENT = 'renpy:error'

export interface Api {
  getSettings(): Promise<Settings>
  setSdkDir(dir: string): Promise<{ ok: boolean; version?: string; error?: string }>
  /** Not in the original plan list: needed for the Home screen's "Remove from list". */
  removeRecent(path: string): Promise<void>
  pickFolder(title: string): Promise<string | null>
  pickFiles(kind: Asset['kind']): Promise<string[]>

  createEditorProject(parentDir: string, title: string): Promise<{ dir: string; project: Project }>
  openEditorProject(dir: string): Promise<{ dir: string; project: Project }>
  saveProject(dir: string, project: Project): Promise<void>
  importAsset(dir: string, kind: Asset['kind'], sourcePath: string): Promise<Asset>
  importAssetData(dir: string, kind: Asset['kind'], fileName: string, data: ArrayBuffer): Promise<Asset>
  deleteAssetFile(dir: string, file: string): Promise<void>
  assetUrl(dir: string, file: string): string

  renpyCreateProject(
    targetDir: string,
    opts: { width: number; height: number; accent: string }
  ): Promise<RunResult>
  exportToRenpy(dir: string, project: Project): Promise<ExportResult>
  renpyRun(projectDir: string, warp?: { file: string; line: number }): Promise<RunResult>
  renpyLint(projectDir: string): Promise<{ ok: boolean; report: string }>
  renpyDistribute(projectDir: string, destDir: string): Promise<RunResult>
  revealInExplorer(path: string): Promise<void>
  /** The kits available to a story: the built-in ones plus the ones in <editorProject>/kits. A kit that cannot be read comes back with its error. */
  listKits(dir: string): Promise<LoadedKit[]>
  /** The Look & Feel fields as they are in the Ren'Py game's gui.rpy, options.rpy and gui/ folder right now. */
  readLook(projectDir: string): Promise<LookReadEntry[]>
  /**
   * Write the given Look & Feel values into the game: one line each in gui.rpy / options.rpy, or a copied file. `values` holds the values of
   * line fields (a colour, number, text); `uploads` the files for font and picture fields. Fields not mentioned are not touched.
   */
  applyLook(
    projectDir: string,
    editorDir: string,
    values: Record<string, string>,
    uploads: Record<string, LookUpload>
  ): Promise<ApplyLookResult>
  /** Not in the original plan list: a game that crashed after it had started (main pushes it). Returns an unsubscribe function. */
  onRenpyError(listener: (error: string) => void): () => void
}

export type ApiMethod = keyof Api

/** Names of every Api method that is an async request (everything except assetUrl, which is synchronous). */
export const ASYNC_API_METHODS = [
  'getSettings',
  'setSdkDir',
  'removeRecent',
  'pickFolder',
  'pickFiles',
  'createEditorProject',
  'openEditorProject',
  'saveProject',
  'importAsset',
  'importAssetData',
  'deleteAssetFile',
  'renpyCreateProject',
  'exportToRenpy',
  'renpyRun',
  'renpyLint',
  'renpyDistribute',
  'revealInExplorer',
  'listKits',
  'readLook',
  'applyLook'
] as const satisfies readonly ApiMethod[]

/** vnasset://p/<encoded dir>/<encoded file segments>. Pure string building, safe in every process. */
export function buildAssetUrl(dir: string, file: string): string {
  const segments = file.split('/').map(encodeURIComponent).join('/')
  return `vnasset://p/${encodeURIComponent(dir)}/${segments}`
}

/** Strip Electron's "Error invoking remote method 'x': Error:" wrapper from an IPC failure. */
export function cleanErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')
}
