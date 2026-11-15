import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sdk = process.env.RENPY_SDK ?? "C:\\Users\\youbl\\Documents\\Software\\Ren'py\\renpy-8.4.1-sdk"
const renpyExe = join(sdk, 'renpy.exe')

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

function run(args, timeoutMs = 240000) {
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
function makePng() {
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
function makeWav() {
  const samples = new Array(800).fill(128)
  const fmt = [...le16(1), ...le16(1), ...le32(8000), ...le32(8000), ...le16(1), ...le16(8)]
  const tag = (s) => [...s].map((ch) => ch.charCodeAt(0))
  return Buffer.from([
    ...tag('RIFF'), ...le32(4 + 8 + fmt.length + 8 + samples.length), ...tag('WAVE'),
    ...tag('fmt '), ...le32(fmt.length), ...fmt,
    ...tag('data'), ...le32(samples.length), ...samples
  ])
}

async function compileFixture(workDir) {
  const outDir = join(workDir, 'bundle')
  await build({
    configFile: false,
    logLevel: 'silent',
    root,
    resolve: { alias: { '@shared': join(root, 'src', 'shared') } },
    ssr: { noExternal: true },
    build: {
      ssr: join(root, 'src', 'shared', 'compiler', 'index.ts'),
      outDir,
      emptyOutDir: true,
      minify: false,
      rollupOptions: { output: { format: 'es', entryFileNames: 'compiler.mjs' } }
    }
  })
  const mod = await import(pathToFileURL(join(outDir, 'compiler.mjs')).href)
  const project = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'demo.fabula.json'), 'utf8'))
  return mod.compileProject(project)
}

async function main() {
  if (!existsSync(renpyExe)) {
    fail(`renpy.exe not found at ${renpyExe} (set RENPY_SDK)`)
    return
  }
  const workDir = mkdtempSync(join(tmpdir(), 'renpy-lint-'))
  try {
    const result = await compileFixture(workDir)

    const projectDir = join(workDir, 'game-project')
    const created = await run([
      join(sdk, 'launcher'),
      'generate_gui',
      projectDir,
      '--start',
      '--width',
      '1280',
      '--height',
      '720',
      '--accent',
      '#7c9cff',
      '--template',
      join(sdk, 'gui')
    ])
    if (created.code !== 0 || !existsSync(join(projectDir, 'game'))) {
      fail(`generate_gui did not create a project (exit ${created.code})`)
      return
    }

    const gameDir = join(projectDir, 'game')
    for (const file of result.files) {
      const target = join(gameDir, ...file.path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, file.content, 'utf8')
    }
    const png = makePng()
    const wav = makeWav()
    for (const copy of result.assetCopies) {
      const target = join(gameDir, ...copy.to.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, copy.to.endsWith('.png') ? png : wav)
    }

    const report = join(workDir, 'lint-report.txt')
    const linted = await run([projectDir, 'lint', report])
    if (!existsSync(report)) {
      fail(`lint wrote no report (exit ${linted.code})`)
      return
    }
    const text = readFileSync(report, 'utf8')
    console.log('---- Ren\'Py lint report ----')
    console.log(text)
    console.log('---- end of report ----')

    const ours = result.files.map((f) => f.path)
    const problems = text
      .split(/\r?\n/)
      .filter((line) => ours.some((name) => line.includes(name)))
    for (const name of ['errors.txt', 'traceback.txt']) {
      if (existsSync(join(projectDir, name))) problems.push(`${name} was written: ${readFileSync(join(projectDir, name), 'utf8')}`)
    }
    if (/Traceback|exception/i.test(text)) problems.push('the report contains a traceback')
    if (problems.length > 0) {
      fail(`Ren'Py lint reported problems with our files:\n${problems.join('\n')}`)
      return
    }
    console.log(`OK: Ren'Py lint reported no problems in ${ours.join(', ')}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => fail(String(error?.stack ?? error)))
