import type { BrowserWindow } from 'electron'
import { CLOSE_REQUEST_EVENT } from '@shared/ipc'

/**
 * Closing the window is held back until the renderer has saved the story. The renderer answers with confirmClose (close now) or
 * cancelClose (stay open). If it does not answer within `waitMs` (a crashed page), the window closes anyway.
 */
export const closeGuard = {
  allow: false,
  waitMs: 15000,
  pending: null as ReturnType<typeof setTimeout> | null,

  /** Called from the window's "close" event. Returns true when the close must be held back. */
  request(win: BrowserWindow): boolean {
    if (this.allow || win.webContents.isDestroyed() || win.webContents.isCrashed()) return false
    if (this.pending) return true
    win.webContents.send(CLOSE_REQUEST_EVENT)
    this.pending = setTimeout(() => {
      this.pending = null
      this.allow = true
      if (!win.isDestroyed()) win.close()
    }, this.waitMs)
    return true
  },
  clearPending(): void {
    if (this.pending) clearTimeout(this.pending)
    this.pending = null
  },
  confirm(windows: BrowserWindow[]): void {
    this.clearPending()
    this.allow = true
    for (const w of windows) w.close()
  },
  cancel(): void {
    this.clearPending()
  }
}
