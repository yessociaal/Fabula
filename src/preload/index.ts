import { contextBridge, ipcRenderer } from 'electron'
import { CLOSE_REQUEST_EVENT, RENPY_ERROR_EVENT, buildAssetUrl, type Api } from '@shared/ipc'

const call =
  <K extends keyof Omit<Api, 'assetUrl' | 'onRenpyError' | 'onCloseRequested'>>(name: K) =>
  (...args: Parameters<Api[K]>): ReturnType<Api[K]> =>
    ipcRenderer.invoke(`api:${name}`, ...args) as ReturnType<Api[K]>

const api: Api = {
  getSettings: call('getSettings'),
  setSdkDir: call('setSdkDir'),
  removeRecent: call('removeRecent'),
  dismissHint: call('dismissHint'),
  pickFolder: call('pickFolder'),
  pickFiles: call('pickFiles'),
  createEditorProject: call('createEditorProject'),
  openEditorProject: call('openEditorProject'),
  saveProject: call('saveProject'),
  importAsset: call('importAsset'),
  importAssetData: call('importAssetData'),
  deleteAssetFile: call('deleteAssetFile'),
  assetUrl: (dir, file) => buildAssetUrl(dir, file),
  renpyCreateProject: call('renpyCreateProject'),
  exportToRenpy: call('exportToRenpy'),
  renpyRun: call('renpyRun'),
  renpyLint: call('renpyLint'),
  renpyDistribute: call('renpyDistribute'),
  revealInExplorer: call('revealInExplorer'),
  listKits: call('listKits'),
  readLook: call('readLook'),
  applyLook: call('applyLook'),
  confirmClose: call('confirmClose'),
  cancelClose: call('cancelClose'),
  onCloseRequested: (listener) => {
    const handler = (): void => listener()
    ipcRenderer.on(CLOSE_REQUEST_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(CLOSE_REQUEST_EVENT, handler)
    }
  },
  onRenpyError: (listener) => {
    const handler = (_event: unknown, message: string): void => listener(message)
    ipcRenderer.on(RENPY_ERROR_EVENT, handler)
    return () => {
      ipcRenderer.removeListener(RENPY_ERROR_EVENT, handler)
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
