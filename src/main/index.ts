import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { closeGuard } from './closeGuard'
import { registerIpc } from './ipc'
import { registerAssetProtocolHandler, registerAssetScheme } from './protocol'

// Must happen before the app is ready.
registerAssetScheme()

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#16171b',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Closing waits until the renderer has saved the story (see closeGuard.ts).
  win.on('close', (event) => {
    if (closeGuard.request(win)) event.preventDefault()
  })
  win.on('closed', () => {
    closeGuard.clearPending()
    closeGuard.allow = false
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerAssetProtocolHandler()
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
