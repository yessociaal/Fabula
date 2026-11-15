import { BrowserWindow, app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { basename } from 'node:path'
import type { Asset, Project } from '@shared/model'
import type { Api, Settings } from '@shared/ipc'
import {
  createEditorProject,
  deleteAssetFile,
  importAsset,
  importAssetData,
  openEditorProject,
  saveProject,
  type ReadImageSize
} from './projectFiles'
import {
  addRecent,
  checkSdkDir,
  loadSettings,
  readSdkVersion,
  removeRecent,
  saveSettings,
  type StoredSettings
} from './settings'

const NOT_AVAILABLE = 'Not available yet'

const readImageSize: ReadImageSize = (file) => {
  const img = nativeImage.createFromPath(file)
  if (img.isEmpty()) return null
  const { width, height } = img.getSize()
  return { width, height }
}

const IMAGE_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
const AUDIO_FILTERS = [{ name: 'Audio', extensions: ['ogg', 'mp3', 'wav', 'opus', 'flac'] }]
const FILTERS: Record<Asset['kind'], Electron.FileFilter[]> = {
  background: IMAGE_FILTERS,
  sprite: IMAGE_FILTERS,
  ui: IMAGE_FILTERS,
  music: AUDIO_FILTERS,
  sound: AUDIO_FILTERS,
  ambient: AUDIO_FILTERS,
  voice: AUDIO_FILTERS,
  movie: [{ name: 'Video', extensions: ['webm', 'ogv', 'mkv', 'mp4'] }],
  font: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }]
}

function parentWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export function registerIpc(): void {
  const userData = (): string => app.getPath('userData')
  const load = (): StoredSettings => loadSettings(userData())
  const save = (s: StoredSettings): void => saveSettings(userData(), s)

  const rememberRecent = (dir: string, project: Project): void => {
    const s = load()
    s.recent = addRecent(s.recent, { path: dir, title: project.meta.title, openedAt: Date.now() })
    save(s)
  }

  const handlers: { [K in keyof Omit<Api, 'assetUrl'>]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> } = {
    async getSettings(): Promise<Settings> {
      const s = load()
      return { sdkDir: s.sdkDir, sdkVersion: s.sdkDir ? readSdkVersion(s.sdkDir) : null, recent: s.recent }
    },
    async setSdkDir(dir) {
      const result = checkSdkDir(dir)
      if (result.ok) {
        const s = load()
        s.sdkDir = dir
        save(s)
      }
      return result
    },
    async removeRecent(path) {
      const s = load()
      s.recent = removeRecent(s.recent, path)
      save(s)
    },
    async pickFolder(title) {
      const win = parentWindow()
      const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory', 'createDirectory'] }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    },
    async pickFiles(kind) {
      const win = parentWindow()
      const options: Electron.OpenDialogOptions = {
        title: 'Choose files',
        properties: ['openFile', 'multiSelections'],
        filters: FILTERS[kind]
      }
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      return result.canceled ? [] : result.filePaths
    },

    async createEditorProject(parentDir, title) {
      const result = await createEditorProject(parentDir, title)
      rememberRecent(result.dir, result.project)
      return result
    },
    async openEditorProject(dir) {
      const result = await openEditorProject(dir)
      rememberRecent(result.dir, result.project)
      return result
    },
    async saveProject(dir, project) {
      await saveProject(dir, project)
      const s = load()
      if (s.recent.some((r) => r.path.toLowerCase() === dir.toLowerCase())) {
        s.recent = s.recent.map((r) => (r.path.toLowerCase() === dir.toLowerCase() ? { ...r, title: project.meta.title } : r))
        save(s)
      }
    },
    importAsset: (dir, kind, sourcePath) => importAsset(dir, kind, sourcePath, readImageSize),
    importAssetData: (dir, kind, fileName, data) => importAssetData(dir, kind, basename(fileName), data, readImageSize),
    deleteAssetFile: (dir, file) => deleteAssetFile(dir, file),

    // Phase 9 implements these.
    async renpyCreateProject() {
      return { ok: false, error: NOT_AVAILABLE }
    },
    async exportToRenpy() {
      return { ok: false, error: NOT_AVAILABLE }
    },
    async renpyRun() {
      return { ok: false, error: NOT_AVAILABLE }
    },
    async renpyLint() {
      return { ok: false, report: NOT_AVAILABLE }
    },
    async renpyDistribute() {
      return { ok: false, error: NOT_AVAILABLE }
    },

    async revealInExplorer(path) {
      shell.showItemInFolder(path)
    }
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`api:${name}`, (_event, ...args: unknown[]) =>
      (fn as (...a: unknown[]) => unknown)(...args)
    )
  }
}
