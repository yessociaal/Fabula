import type { Asset, Id, Project } from './model'

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
}

export interface ExportResult {
  ok: boolean
  error?: string
  sceneLocations?: Record<Id, { file: string; line: number }>
}

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
  'revealInExplorer'
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
