import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseLintReport } from '@shared/lintReport'

/** The part of a child process this module uses, so tests can inject a fake. */
export interface ChildLike {
  pid?: number
  on(event: 'exit', listener: (code: number | null) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  unref?(): void
}

export type SpawnFn = (exe: string, args: string[], options: SpawnOptions) => ChildLike

export interface RenpyDeps {
  spawn?: SpawnFn
}

export interface RenpyResult {
  ok: boolean
  error?: string
  pid?: number
}

const defaultSpawn: SpawnFn = (exe, args, options) => nodeSpawn(exe, args, options) as unknown as ChildLike

export const renpyExe = (sdkDir: string): string => join(sdkDir, 'renpy.exe')

/** Run renpy.exe with an argument array (never a shell string) and wait for it to exit. */
function runToExit(
  sdkDir: string,
  args: string[],
  deps: RenpyDeps | undefined,
  timeoutMs: number
): Promise<{ code: number | null; error?: string }> {
  return new Promise((resolve) => {
    const spawn = deps?.spawn ?? defaultSpawn
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = (result: { code: number | null; error?: string }): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    let child: ChildLike
    try {
      child = spawn(renpyExe(sdkDir), args, { cwd: sdkDir, windowsHide: true, stdio: 'ignore' })
    } catch (e) {
      done({ code: null, error: e instanceof Error ? e.message : String(e) })
      return
    }
    child.on('error', (e) => done({ code: null, error: e.message }))
    child.on('exit', (code) => done({ code }))
    timer = setTimeout(() => {
      if (child.pid !== undefined) stopProcess(child.pid)
      done({ code: null, error: 'Ren\'Py took too long and was stopped.' })
    }, timeoutMs)
  })
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Create a new Ren'Py project with the SDK's own GUI generator. The target must not exist (or already hold game/). */
export async function createProject(
  sdkDir: string,
  targetDir: string,
  opts: { width: number; height: number; accent: string },
  deps?: RenpyDeps
): Promise<RenpyResult> {
  if (!existsSync(renpyExe(sdkDir))) return { ok: false, error: 'The Ren\'Py SDK was not found. Set its folder in Settings.' }
  if (!HEX_COLOR.test(opts.accent)) return { ok: false, error: 'The accent colour must look like #7c9cff.' }
  if (!Number.isInteger(opts.width) || !Number.isInteger(opts.height) || opts.width < 100 || opts.height < 100) {
    return { ok: false, error: 'The screen size is not valid.' }
  }
  if (existsSync(targetDir) && !existsSync(join(targetDir, 'game'))) {
    if (readdirSync(targetDir).length > 0) {
      return { ok: false, error: `The folder "${targetDir}" already exists and is not a Ren'Py game. Choose another folder.` }
    }
  }
  try {
    mkdirSync(dirname(targetDir), { recursive: true })
  } catch (e) {
    return { ok: false, error: `Could not create the folder: ${e instanceof Error ? e.message : String(e)}` }
  }
  const result = await runToExit(
    sdkDir,
    [
      join(sdkDir, 'launcher'),
      'generate_gui',
      targetDir,
      '--start',
      '--width',
      String(opts.width),
      '--height',
      String(opts.height),
      '--accent',
      opts.accent,
      '--template',
      join(sdkDir, 'gui')
    ],
    deps,
    240000
  )
  if (result.error) return { ok: false, error: result.error }
  if (result.code !== 0 || !existsSync(join(targetDir, 'game'))) {
    return { ok: false, error: `Ren'Py could not create the game (exit code ${result.code}).` }
  }
  return { ok: true }
}

export function readNewError(projectDir: string, since: number): string | null {
  for (const name of ['traceback.txt', 'errors.txt']) {
    const file = join(projectDir, name)
    try {
      if (statSync(file).mtimeMs > since) {
        const text = readFileSync(file, 'utf8').replace(/^﻿/, '').trim()
        return text === '' ? `Ren'Py wrote ${name}.` : text
      }
    } catch {
      // not there
    }
  }
  return null
}

export interface RunOptions {
  warp?: { file: string; line: number }
  /** How long to wait for an early exit before reporting success and watching in the background. */
  startupWaitMs?: number
  /** Called once if the game later ends with a new errors.txt / traceback.txt. */
  onLateError?: (error: string) => void
}

/**
 * Start the game. Resolves when the process exits, or after `startupWaitMs` (3 s) while it is still running.
 * An errors.txt / traceback.txt newer than the launch time becomes the error. After an early success a
 * background watcher reports a crash through `onLateError`.
 */
export function runGame(sdkDir: string, projectDir: string, options: RunOptions = {}, deps?: RenpyDeps): Promise<RenpyResult> {
  return new Promise((resolve) => {
    if (!existsSync(renpyExe(sdkDir))) {
      resolve({ ok: false, error: 'The Ren\'Py SDK was not found. Set its folder in Settings.' })
      return
    }
    if (!existsSync(join(projectDir, 'game'))) {
      resolve({ ok: false, error: `"${projectDir}" is not a Ren'Py game folder.` })
      return
    }
    const spawn = deps?.spawn ?? defaultSpawn
    const args = [projectDir]
    if (options.warp) args.push('--warp', `${options.warp.file}:${options.warp.line}`)
    const launchedAt = Date.now()
    let child: ChildLike
    try {
      child = spawn(renpyExe(sdkDir), args, { cwd: sdkDir, windowsHide: false, stdio: 'ignore' })
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
      return
    }
    let answered = false
    let exited = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const answer = (result: RenpyResult): void => {
      if (answered) return
      answered = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    child.on('error', (e) => {
      exited = true
      answer({ ok: false, error: e.message })
    })
    child.on('exit', (code) => {
      exited = true
      const err = readNewError(projectDir, launchedAt)
      if (!answered) {
        if (err) answer({ ok: false, error: err })
        else if (code !== 0 && code !== null) answer({ ok: false, error: `Ren'Py closed unexpectedly (exit code ${code}).` })
        else answer({ ok: true, pid: child.pid })
      } else if (err) {
        options.onLateError?.(err)
      }
    })
    timer = setTimeout(() => {
      if (answered || exited) return
      const err = readNewError(projectDir, launchedAt)
      if (err) answer({ ok: false, error: err, pid: child.pid })
      else answer({ ok: true, pid: child.pid })
    }, options.startupWaitMs ?? 3000)
  })
}

/** Stop a process this module started, by id (and its children). Never by name. */
export function stopProcess(pid: number, deps?: RenpyDeps): void {
  const spawn = deps?.spawn ?? defaultSpawn
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      killer.on('error', () => undefined)
    } else {
      process.kill(pid)
    }
  } catch {
    // already gone
  }
}

/** Run Ren'Py's lint with a report file and decide from the report text. */
export async function lint(
  sdkDir: string,
  projectDir: string,
  deps?: RenpyDeps
): Promise<{ ok: boolean; report: string }> {
  if (!existsSync(renpyExe(sdkDir))) return { ok: false, report: 'The Ren\'Py SDK was not found. Set its folder in Settings.' }
  const work = mkdtempSync(join(tmpdir(), 'fabula-lint-'))
  try {
    const reportFile = join(work, 'lint-report.txt')
    const result = await runToExit(sdkDir, [projectDir, 'lint', reportFile], deps, 240000)
    if (!existsSync(reportFile)) {
      return { ok: false, report: result.error ?? `Ren'Py did not write a lint report (exit code ${result.code}).` }
    }
    const report = readFileSync(reportFile, 'utf8').replace(/^﻿/, '')
    return { ok: parseLintReport(report).ok, report }
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

/** Build the Windows package into destDir with Ren'Py's own distribute command. */
export async function distribute(
  sdkDir: string,
  projectDir: string,
  destDir: string,
  deps?: RenpyDeps
): Promise<RenpyResult> {
  if (!existsSync(renpyExe(sdkDir))) return { ok: false, error: 'The Ren\'Py SDK was not found. Set its folder in Settings.' }
  const startedAt = Date.now() - 2000
  const result = await runToExit(
    sdkDir,
    [join(sdkDir, 'launcher'), 'distribute', projectDir, '--destination', destDir, '--package', 'win'],
    deps,
    900000
  )
  if (result.error) return { ok: false, error: result.error }
  const produced = existsSync(destDir) ? readdirSync(destDir).filter((n) => statSync(join(destDir, n)).mtimeMs >= startedAt) : []
  if (result.code !== 0 || produced.length === 0) {
    return { ok: false, error: `Ren'Py could not build the game (exit code ${result.code}).` }
  }
  return { ok: true }
}
