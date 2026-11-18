// Helpers for driving the real Electron window over the Chrome DevTools Protocol (Node's built-in WebSocket, no dependencies).
// Used by test-electron.mjs and perf-electron.mjs. Not shipped with the app.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const electronExe = join(repo, 'node_modules', 'electron', 'dist', 'electron.exe')
export const packagedExe = join(repo, 'dist', 'win-unpacked', 'Fabula.exe')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.once('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => res(port))
    })
  })
}

export function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** Stop a process tree by root pid. Never by name. */
export function killTree(pid) {
  if (!pid) return
  spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
}

// ---------- a plain solid colour PNG made with code ----------
function crc32(buf) {
  let crc = 0xffffffff
  for (const b of buf) {
    crc ^= b
    for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
export function solidPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- launching ----------
/**
 * Start the app with remote debugging and a throw-away user-data folder (so the real settings and Recent list are never touched).
 * `packaged: true` starts dist/win-unpacked/Fabula.exe, otherwise electron.exe with the repository as the app folder.
 */
export async function launchApp({ packaged = false, env = {}, userData } = {}) {
  const exe = packaged ? packagedExe : electronExe
  if (!existsSync(exe)) throw new Error(`Not found: ${exe}`)
  const port = await freePort()
  const ud = userData ?? tempDir('fabula-userdata-')
  const args = packaged ? [] : [repo]
  // The window must keep rendering at full speed even when another window covers it, or real input crawls.
  args.push(
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${ud}`,
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling'
  )
  const child = spawn(exe, args, {
    cwd: packaged ? dirname(exe) : repo,
    env: { ...process.env, FABULA_TEST: '1', ...env },
    stdio: 'ignore',
    windowsHide: false
  })
  let exited = false
  child.on('exit', () => {
    exited = true
  })
  // wait for the page target
  let wsUrl = null
  for (let i = 0; i < 120 && !wsUrl; i++) {
    if (exited) throw new Error('The app exited before it opened a window.')
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
      if (page) wsUrl = page.webSocketDebuggerUrl
    } catch {
      // not up yet
    }
    if (!wsUrl) await sleep(250)
  }
  if (!wsUrl) throw new Error('No page target appeared.')
  const page = await connect(wsUrl)
  await page.send('Page.bringToFront').catch(() => undefined)
  await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined)
  return {
    pid: child.pid,
    port,
    userData: ud,
    page,
    hasExited: () => exited,
    close() {
      page.close()
      killTree(child.pid)
    }
  }
}

// ---------- the CDP page ----------
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13, text: '\r' },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Space: { key: ' ', code: 'Space', vk: 32, text: ' ' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  Shift: { key: 'Shift', code: 'ShiftLeft', vk: 16 },
  Control: { key: 'Control', code: 'ControlLeft', vk: 17 },
  z: { key: 'z', code: 'KeyZ', vk: 90 },
  y: { key: 'y', code: 'KeyY', vk: 89 },
  a: { key: 'a', code: 'KeyA', vk: 65 },
  d: { key: 'd', code: 'KeyD', vk: 68 },
  f: { key: 'f', code: 'KeyF', vk: 70 }
}
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 }

function connect(wsUrl) {
  return new Promise((resolveConn, rejectConn) => {
    const ws = new WebSocket(wsUrl)
    let nextId = 1
    const pending = new Map()
    const listeners = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString())
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(`${msg.error.message}`))
        else res(msg.result)
      } else if (msg.method) {
        for (const fn of listeners.get(msg.method) ?? []) fn(msg.params)
      }
    })
    ws.addEventListener('error', () => rejectConn(new Error('WebSocket error')))
    ws.addEventListener('open', () => {
      const send = (method, params = {}) =>
        new Promise((res, rej) => {
          const id = nextId++
          const timer = setTimeout(() => {
            pending.delete(id)
            rej(new Error(`No answer from the window to ${method} within 30 s`))
          }, 30000)
          pending.set(id, {
            res: (v) => {
              clearTimeout(timer)
              res(v)
            },
            rej: (e) => {
              clearTimeout(timer)
              rej(e)
            }
          })
          ws.send(JSON.stringify({ id, method, params }))
        })
      resolveConn(makePage(send, () => ws.close(), listeners))
    })
  })
}

const FIND_FN = `(sel, text, exact, idx, within) => {
  const root = within ? document.querySelector(within) : document
  if (!root) return null
  let els = [...root.querySelectorAll(sel)]
  if (text != null) {
    const t = text.toLowerCase()
    els = els.filter((e) => { const s = (e.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase(); return exact ? s === t : s.includes(t) })
  }
  els = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  const el = els[idx || 0]
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
}`

function makePage(send, close, listeners) {
  const page = {
    send,
    close,
    on(method, fn) {
      listeners.set(method, [...(listeners.get(method) ?? []), fn])
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
      return r.result.value
    },
    /** Centre and bounds of the first visible element matching a selector (optionally whose text matches). */
    async rect(sel, opts = {}) {
      const { text = null, exact = false, index = 0, within = null } = opts
      return page.eval(`(${FIND_FN})(${JSON.stringify(sel)}, ${JSON.stringify(text)}, ${exact}, ${index}, ${JSON.stringify(within)})`)
    },
    async count(sel, text = null) {
      return page.eval(
        `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => ${text === null ? 'true' : `(e.textContent||'').toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`}).length`
      )
    },
    async waitFor(expression, { timeout = 15000, label = expression } = {}) {
      const start = Date.now()
      let last
      while (Date.now() - start < timeout) {
        try {
          last = await page.eval(expression)
          if (last) return last
        } catch {
          // page may be reloading
        }
        await sleep(100)
      }
      throw new Error(`Timed out waiting for: ${label}`)
    },
    async waitRect(sel, opts = {}) {
      const { timeout = 15000, ...rest } = opts
      const start = Date.now()
      while (Date.now() - start < timeout) {
        const r = await page.rect(sel, rest)
        if (r) return r
        await sleep(100)
      }
      throw new Error(`Timed out waiting for element ${sel}${rest.text ? ` containing "${rest.text}"` : ''}`)
    },
    // ----- real input -----
    async mouse(type, x, y, o = {}) {
      await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: o.button ?? (type === 'mouseMoved' ? 'none' : 'left'),
        buttons: o.buttons ?? (type === 'mousePressed' ? 1 : type === 'mouseMoved' && o.down ? 1 : 0),
        clickCount: o.clickCount ?? (type === 'mouseMoved' ? 0 : 1),
        modifiers: o.modifiers ?? 0
      })
    },
    async move(x, y, o = {}) {
      await page.mouse('mouseMoved', x, y, o)
    },
    async click(x, y, o = {}) {
      await page.move(x, y, o)
      await page.mouse('mousePressed', x, y, o)
      await page.mouse('mouseReleased', x, y, o)
    },
    async dblclick(x, y, o = {}) {
      await page.move(x, y, o)
      await page.mouse('mousePressed', x, y, { ...o, clickCount: 1 })
      await page.mouse('mouseReleased', x, y, { ...o, clickCount: 1 })
      await page.mouse('mousePressed', x, y, { ...o, clickCount: 2 })
      await page.mouse('mouseReleased', x, y, { ...o, clickCount: 2 })
    },
    async rightClick(x, y) {
      await page.move(x, y)
      await page.mouse('mousePressed', x, y, { button: 'right', buttons: 2 })
      await page.mouse('mouseReleased', x, y, { button: 'right', buttons: 0 })
    },
    /** Press, move through intermediate points, release. */
    async drag(from, to, o = {}) {
      const steps = o.steps ?? 14
      const mod = o.modifiers ?? 0
      await page.move(from.x, from.y, { modifiers: mod })
      await sleep(40)
      await page.mouse('mousePressed', from.x, from.y, { modifiers: mod })
      for (let i = 1; i <= steps; i++) {
        await page.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, { down: true, modifiers: mod })
        await sleep(o.stepDelay ?? 16)
      }
      await sleep(60)
      await page.mouse('mouseReleased', to.x, to.y, { modifiers: mod })
    },
    async clickSel(sel, opts = {}) {
      const r = await page.waitRect(sel, opts)
      await page.click(r.x, r.y)
      return r
    },
    async key(name, o = {}) {
      const k = KEYS[name] ?? { key: name, code: `Key${name.toUpperCase()}`, vk: name.toUpperCase().charCodeAt(0) }
      const mods = o.modifiers ?? 0
      const hasText = k.text && !(mods & (MOD.ctrl | MOD.alt | MOD.meta))
      await send('Input.dispatchKeyEvent', {
        type: hasText ? 'keyDown' : 'rawKeyDown',
        key: k.key,
        code: k.code,
        windowsVirtualKeyCode: k.vk,
        nativeVirtualKeyCode: k.vk,
        modifiers: mods,
        ...(hasText ? { text: k.text, unmodifiedText: k.text } : {}),
        ...(o.commands ? { commands: o.commands } : {})
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: mods })
    },
    async keyDown(name, mods = 0) {
      const k = KEYS[name]
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, modifiers: mods })
    },
    async keyUp(name, mods = 0) {
      const k = KEYS[name]
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, modifiers: mods })
    },
    async type(text) {
      await send('Input.insertText', { text })
    },
    async selectAllInFocused() {
      await page.eval('document.activeElement && document.activeElement.select && document.activeElement.select()')
    },
    async setFiles(selector, files) {
      const doc = await send('DOM.getDocument', { depth: 0 })
      const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector })
      if (!nodeId) throw new Error(`No element for ${selector}`)
      await send('DOM.setFileInputFiles', { nodeId, files })
    },
    async screenshot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, Buffer.from(data, 'base64'))
      return file
    }
  }
  return page
}

// ---------- processes ----------
/** Processes whose command line contains `needle` (looked up with CIM; the needle goes in via the environment so this lookup is not itself a match). */
export function findProcessesByCommandLine(needle) {
  const script =
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:FABULA_NEEDLE) -and $_.ProcessId -ne $PID } | ForEach-Object { \"$($_.ProcessId)`t$($_.Name)\" }"
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, FABULA_NEEDLE: needle },
    encoding: 'utf8',
    windowsHide: true
  })
  return (r.stdout ?? '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [pid, name] = l.split('\t')
      return { pid: Number(pid), name }
    })
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}
