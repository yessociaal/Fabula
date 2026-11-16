import { BrowserWindow, app, dialog, ipcMain, nativeImage, shell } from 'electron'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { Asset, Project } from '@shared/model'
import { RENPY_ERROR_EVENT, type Api, type Settings } from '@shared/ipc'
import {
  createEditorProject,
  deleteAssetFile,
  importAsset,
  importAssetData,
  openEditorProject,
  saveProject,
  type ReadImageSize
} from './projectFiles'
import { exportProject } from './exporter'
import { createProject, distribute, lint, runGame } from './renpy'
import {
  addRecent,
  checkSdkDir,
  loadSettings,
  readSdkVersion,
  removeRecent,
  saveSettings,
  type StoredSettings
} from './settings'

const NO_SDK = "The Ren'Py SDK folder is not set. Choose it in Settings."

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

  const handlers: { [K in keyof Omit<Api, 'assetUrl' | 'onRenpyError'>]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> } = {
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

    async renpyCreateProject(targetDir, opts) {
      const sdk = load().sdkDir
      if (!sdk) return { ok: false, error: NO_SDK }
      return createProject(sdk, targetDir, opts)
    },
    async exportToRenpy(dir, project) {
      return exportProject(dir, project)
    },
    async renpyRun(projectDir, warp) {
      const sdk = load().sdkDir
      if (!sdk) return { ok: false, error: NO_SDK }
      return runGame(sdk, projectDir, {
        warp,
        onLateError: (error) => {
          for (const w of BrowserWindow.getAllWindows()) w.webContents.send(RENPY_ERROR_EVENT, error)
        }
      })
    },
    async renpyLint(projectDir) {
      const sdk = load().sdkDir
      if (!sdk) return { ok: false, report: NO_SDK }
      return lint(sdk, projectDir)
    },
    async renpyDistribute(projectDir, destDir) {
      const sdk = load().sdkDir
      if (!sdk) return { ok: false, error: NO_SDK }
      return distribute(sdk, projectDir, destDir)
    },

    async revealInExplorer(path) {
      try {
        if (statSync(path).isDirectory()) {
          await shell.openPath(path)
          return
        }
      } catch {
        // fall through: reveal whatever is there
      }
      shell.showItemInFolder(path)
    }
  }

  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`api:${name}`, (_event, ...args: unknown[]) =>
      (fn as (...a: unknown[]) => unknown)(...args)
    )
  }
}
