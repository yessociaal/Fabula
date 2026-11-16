import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const sdk = process.env.RENPY_SDK ?? "C:\\Users\\youbl\\Documents\\Software\\Ren'py\\renpy-8.4.1-sdk"
export const renpyExe = join(sdk, 'renpy.exe')

/** Run renpy.exe with an argument array and wait for it to exit. Never a shell string. */
export function run(args, timeoutMs = 240000) {
  return new Promise((resolveRun) => {
    const child = spawn(renpyExe, args, { cwd: sdk, windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolveRun({ code: -1, error })
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      resolveRun({ code })
    })
  })
}

/** Bundle TypeScript entry points (with the @shared alias) into plain modules and import them. */
export async function bundle(entries, outDir) {
  await build({
    configFile: false,
    logLevel: 'silent',
    root,
    resolve: { alias: { '@shared': join(root, 'src', 'shared') } },
    ssr: { noExternal: true },
    build: {
      ssr: true,
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        input: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, join(root, file)])),
        output: { format: 'es', entryFileNames: '[name].mjs' }
      }
    }
  })
  const modules = {}
  for (const name of Object.keys(entries)) modules[name] = await import(pathToFileURL(join(outDir, `${name}.mjs`)).href)
  return modules
}

function crc32(bytes) {
  let c
  let crc = 0xffffffff
  for (const b of bytes) {
    c = (crc ^ b) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u32(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function pngChunk(type, data) {
  const typeBytes = [...type].map((ch) => ch.charCodeAt(0))
  return [...u32(data.length), ...typeBytes, ...data, ...u32(crc32([...typeBytes, ...data]))]
}

function adler32(bytes) {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** A 1x1 opaque white RGBA PNG, built byte by byte. */
export function makePng() {
  const raw = [0, 255, 255, 255, 255]
  const deflated = [0x78, 0x01, 0x01, raw.length, 0x00, ~raw.length & 255, 0xff, ...raw, ...u32(adler32(raw))]
  const ihdr = [...u32(1), ...u32(1), 8, 6, 0, 0, 0]
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', deflated),
    ...pngChunk('IEND', [])
  ])
}

function le32(n) {
  return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
}

function le16(n) {
  return [n & 255, (n >>> 8) & 255]
}

/** A 0.1 second silent mono 8-bit 8000 Hz WAV, built byte by byte. */
export function makeWav() {
  const samples = new Array(800).fill(128)
  const fmt = [...le16(1), ...le16(1), ...le32(8000), ...le32(8000), ...le16(1), ...le16(8)]
  const tag = (s) => [...s].map((ch) => ch.charCodeAt(0))
  return Buffer.from([
    ...tag('RIFF'), ...le32(4 + 8 + fmt.length + 8 + samples.length), ...tag('WAVE'),
    ...tag('fmt '), ...le32(fmt.length), ...fmt,
    ...tag('data'), ...le32(samples.length), ...samples
  ])
}
