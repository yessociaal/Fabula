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
import { LOOK_FIELDS, applyLookText, readLookText, type ApplyLookResult, type LookFieldResult, type LookReadEntry } from '@shared/look'

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
  dismissedHints?: string[]
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

// A small in-memory stand-in for a Ren'Py game's gui.rpy and options.rpy, so the Look & Feel view can be clicked through in a browser.
const MOCK_GUI = `init offset -2

## Colors
define gui.accent_color = '#7c9cff'
define gui.idle_color = '#888888'
define gui.hover_color = '#b0c3ff'
define gui.text_color = '#ffffff'
define gui.interface_text_color = '#ffffff'

## Fonts
define gui.text_font = "DejaVuSans.ttf"
define gui.name_text_font = "DejaVuSans.ttf"
define gui.interface_text_font = "DejaVuSans.ttf"
define gui.text_size = 22
define gui.name_text_size = 30
define gui.interface_text_size = 22

## Dialogue
define gui.textbox_height = 185
define gui.name_xpos = 240
define gui.name_ypos = 0
define gui.dialogue_xpos = 268
define gui.dialogue_ypos = 50
define gui.dialogue_width = 744
`
const MOCK_OPTIONS = `define config.name = _("Story")
define gui.show_name = True
define config.version = "1.0"
define gui.about = _p("""
""")
define config.window_icon = "gui/window_icon.png"
default preferences.text_cps = 0
`

interface MockGame {
  gui: string
  options: string
  files: Set<string>
}
const mockGames = new Map<string, MockGame>()
const mockGame = (dir: string): MockGame => {
  const key = dir.toLowerCase()
  let g = mockGames.get(key)
  if (!g) {
    g = { gui: MOCK_GUI, options: MOCK_OPTIONS, files: new Set(['gui/textbox.png', 'gui/namebox.png', 'gui/main_menu.png', 'gui/game_menu.png', 'gui/window_icon.png']) }
    mockGames.set(key, g)
  }
  return g
}

// For clicking through the "Edited by hand" case in a browser: window.fabulaMock.simulateHandEdit('gui.text_size') rewrites that line.
if (typeof window !== 'undefined') {
  ;(window as unknown as { fabulaMock: unknown }).fabulaMock = {
    simulateHandEdit(key: string, dir?: string): void {
      const targets = dir ? [mockGame(dir)] : [...mockGames.values()]
      for (const g of targets) {
        for (const name of ['gui', 'options'] as const) {
          g[name] = g[name].replace(new RegExp(`^(define|default) (${key.replace(/\./g, '\\.')}) = .*$`, 'm'), (_m, kw: string, k: string) => `${kw} ${k} = gui.something_else + 1`)
        }
      }
    }
  }
}

export const browserMock: Api = {
  async getSettings(): Promise<Settings> {
    const s = getStored()
    return { sdkDir: s.sdkDir, sdkVersion: s.sdkDir ? '8.4.1' : null, recent: s.recent, dismissedHints: s.dismissedHints ?? [] }
  },
  async dismissHint(id) {
    const s = getStored()
    if (!(s.dismissedHints ?? []).includes(id)) putStored({ ...s, dismissedHints: [...(s.dismissedHints ?? []), id] })
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
  async readLook(projectDir) {
    const g = mockGame(projectDir)
    return LOOK_FIELDS.map((field): LookReadEntry => {
      if (field.type === 'image-file') {
        const target = field.imageTarget ?? field.key
        const there = g.files.has(target)
        return { key: field.key, found: there, value: there ? target : null, editedByHand: false }
      }
      const read = readLookText(field, field.file === 'gui.rpy' ? g.gui : g.options)
      return { key: field.key, found: read.found, value: read.value, editedByHand: read.editedByHand }
    })
  },
  async applyLook(projectDir, _editorDir, values, uploads): Promise<ApplyLookResult> {
    const g = mockGame(projectDir)
    const results: LookFieldResult[] = []
    for (const field of LOOK_FIELDS) {
      if (!(field.key in values) && !(field.key in uploads)) continue
      const upload = uploads[field.key]
      if (field.type === 'image-file') {
        const target = field.imageTarget ?? field.key
        if (!upload) results.push({ key: field.key, status: 'invalid' })
        else {
          results.push({ key: field.key, status: 'applied' })
          g.files.add(target)
        }
        continue
      }
      const value = field.type === 'font-file' ? upload?.to : values[field.key]
      if (value === undefined || field.readOnly) {
        results.push({ key: field.key, status: 'invalid' })
        continue
      }
      const name = field.file === 'gui.rpy' ? 'gui' : 'options'
      const out = applyLookText(field, g[name], value)
      g[name] = out.text
      results.push({ key: field.key, status: out.status })
    }
    return { ok: true, results, backupDir: 'backups/20260101-000000' }
  },
  async revealInExplorer() {
    // nothing to reveal in a browser
  },
  onRenpyError() {
    return () => undefined
  },
  onCloseRequested() {
    return () => undefined
  },
  async confirmClose() {
    // a browser tab is closed by the browser
  },
  async cancelClose() {
    // nothing is waiting
  }
}
