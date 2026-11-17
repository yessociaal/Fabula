import type { Api, RecentEntry, Settings } from '@shared/ipc'
import { buildAssetUrl } from '@shared/ipc'
import { ASSET_FOLDERS, checkAssetExtension, isImageKind } from '@shared/assetTypes'
import { createProject, newId } from '@shared/factory'
import type { Asset, Project } from '@shared/model'
import { parseProject } from '@shared/schema'
import { compileProject } from '@shared/compiler'
import { validateProject } from '@shared/validate'
import { loadKit } from '@shared/kits/load'
import type { LoadedKit } from '@shared/kits/types'

// The kits that come with the app, read as text so the browser version shows the same kits as the desktop app.
const BUILT_IN_KIT_TEXT = import.meta.glob('../../../resources/kits/*/**/*', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function builtInKits(): LoadedKit[] {
  const folders = new Map<string, Map<string, string>>()
  for (const [path, text] of Object.entries(BUILT_IN_KIT_TEXT)) {
    const m = /\/kits\/([^/]+)\/(.+)$/.exec(path)
    if (!m) continue
    if (!folders.has(m[1])) folders.set(m[1], new Map())
    folders.get(m[1])?.set(m[2], text)
  }
  return [...folders.entries()].map(([name, files]) => loadKit({ name, source: 'built-in', folder: '', readText: (rel) => files.get(rel) ?? null }))
}

/**
 * In-memory Api for running the UI in a plain browser (npm run dev:web).
 * Stories and settings persist in localStorage; uploaded files live only until the page is reloaded.
 */

const SETTINGS_KEY = 'fabula.mock.settings'
const PROJECTS_KEY = 'fabula.mock.projects'
const MOCK_PARENT = 'C:\\Fabula Stories'
const DESKTOP_ONLY = "Ren'Py is only available in the desktop app."
const MOCK_SDK = "C:\\Users\\you\\Documents\\Ren'py\\renpy-8.4.1-sdk"

interface StoredSettings {
  sdkDir: string | null
  recent: RecentEntry[]
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage unavailable or full: the mock keeps working from memory
  }
}

// In-memory fallbacks so everything works even when localStorage is blocked.
let memSettings: StoredSettings | null = null
let memProjects: Record<string, unknown> | null = null
const blobUrls = new Map<string, string>() // `${dir}|${file}` -> blob: URL

const getStored = (): StoredSettings =>
  memSettings ?? (memSettings = readJson<StoredSettings>(SETTINGS_KEY, { sdkDir: MOCK_SDK, recent: [] }))
const putStored = (s: StoredSettings): void => {
  memSettings = s
  writeJson(SETTINGS_KEY, s)
}
const getProjects = (): Record<string, unknown> =>
  memProjects ?? (memProjects = readJson<Record<string, unknown>>(PROJECTS_KEY, {}))
const putProjects = (p: Record<string, unknown>): void => {
  memProjects = p
  writeJson(PROJECTS_KEY, p)
}

const sameKey = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

function remember(dir: string, title: string): void {
  const s = getStored()
  const rest = s.recent.filter((r) => !sameKey(r.path, dir))
  putStored({ ...s, recent: [{ path: dir, title, openedAt: Date.now() }, ...rest].slice(0, 10) })
}

function sanitise(title: string): string {
  const t = title.replace(/[<>:"/\\|?*]/g, '').trim()
  return t || 'Untitled story'
}

function findProjectKey(dir: string): string | undefined {
  return Object.keys(getProjects()).find((k) => sameKey(k, dir))
}

function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

async function importData(dir: string, kind: Asset['kind'], fileName: string, data: ArrayBuffer): Promise<Asset> {
  const ext = checkAssetExtension(kind, fileName)
  const id = newId()
  const file = `${ASSET_FOLDERS[kind]}/${id}${ext}`
  const blob = new Blob([data])
  blobUrls.set(`${dir}|${file}`, URL.createObjectURL(blob))
  const size = isImageKind(kind) ? await imageSize(blob) : null
  const base = fileName.split(/[\\/]/).pop() ?? fileName
  const name = base.replace(/\.[^.]*$/, '') || 'Untitled'
  return { id, kind, name, file, width: size?.width ?? null, height: size?.height ?? null, bytes: data.byteLength }
}

export const browserMock: Api = {
  async getSettings(): Promise<Settings> {
    const s = getStored()
    return { sdkDir: s.sdkDir, sdkVersion: s.sdkDir ? '8.4.1' : null, recent: s.recent }
  },
  async setSdkDir(dir) {
    if (!dir.trim()) return { ok: false, error: 'renpy.exe was not found in that folder.' }
    putStored({ ...getStored(), sdkDir: dir })
    return { ok: true, version: '8.4.1' }
  },
  async removeRecent(path) {
    const s = getStored()
    putStored({ ...s, recent: s.recent.filter((r) => !sameKey(r.path, path)) })
  },
  async pickFolder() {
    return MOCK_PARENT
  },
  async pickFiles() {
    return []
  },

  async createEditorProject(parentDir, title) {
    const trimmed = title.trim()
    if (!trimmed) throw new Error('Give the story a title first.')
    const dir = `${parentDir}\\${sanitise(trimmed)}`
    if (findProjectKey(dir)) {
      throw new Error(`The folder "${dir}" already exists and is not empty. Pick another title or location.`)
    }
    const project = createProject(trimmed)
    putProjects({ ...getProjects(), [dir]: project })
    remember(dir, trimmed)
    return { dir, project }
  },
  async openEditorProject(dir) {
    const key = findProjectKey(dir)
    if (!key) throw new Error(`The folder "${dir}" could not be found. It may have been moved or deleted.`)
    const parsed = parseProject(getProjects()[key])
    if (!parsed.ok) throw new Error(`This story file is damaged and could not be opened. ${parsed.error}`)
    remember(key, parsed.project.meta.title)
    return { dir: key, project: parsed.project }
  },
  async saveProject(dir, project: Project) {
    const key = findProjectKey(dir) ?? dir
    putProjects({ ...getProjects(), [key]: JSON.parse(JSON.stringify(project)) })
    const s = getStored()
    if (s.recent.some((r) => sameKey(r.path, key))) {
      putStored({ ...s, recent: s.recent.map((r) => (sameKey(r.path, key) ? { ...r, title: project.meta.title } : r)) })
    }
  },
  async importAsset() {
    throw new Error('Choosing files by path needs the desktop app. In the browser, drop files instead.')
  },
  importAssetData: importData,
  async deleteAssetFile(dir, file) {
    const k = `${dir}|${file}`
    const url = blobUrls.get(k)
    if (url) URL.revokeObjectURL(url)
    blobUrls.delete(k)
  },
  assetUrl(dir, file) {
    return blobUrls.get(`${dir}|${file}`) ?? buildAssetUrl(dir, file)
  },

  // Ren'Py itself only runs in the desktop app. The browser version pretends to create and export so the
  // flows can be clicked through, and says plainly that running, checking and building are not possible.
  async renpyCreateProject() {
    return { ok: true }
  },
  async exportToRenpy(_dir, project) {
    const kits = builtInKits()
    const problems = validateProject(project, { kits })
    if (problems.some((p) => p.severity === 'error')) return { ok: false, error: 'There are problems to fix before exporting.', problems }
    return { ok: true, sceneLocations: compileProject(project, { kits }).sceneLocations, changed: [], problems }
  },
  async renpyRun() {
    return { ok: false, error: DESKTOP_ONLY }
  },
  async renpyLint() {
    return { ok: false, report: DESKTOP_ONLY }
  },
  async renpyDistribute() {
    return { ok: false, error: DESKTOP_ONLY }
  },
  async listKits() {
    return builtInKits()
  },
  async revealInExplorer() {
    // nothing to reveal in a browser
  },
  onRenpyError() {
    return () => undefined
  }
}
