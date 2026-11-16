import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, distribute, lint, runGame, type ChildLike, type SpawnFn } from '../src/main/renpy'

let work: string
let sdk: string
let project: string

class FakeChild extends EventEmitter implements ChildLike {
  pid = 4242
}

interface Call {
  exe: string
  args: string[]
  cwd: unknown
  shell: unknown
}

/** A spawn that records its calls and lets each test decide what the "process" does. */
function fakeSpawn(behave: (child: FakeChild, call: Call) => void): { spawn: SpawnFn; calls: Call[]; children: FakeChild[] } {
  const calls: Call[] = []
  const children: FakeChild[] = []
  const spawn: SpawnFn = (exe, args, options) => {
    const child = new FakeChild()
    const call = { exe, args, cwd: options.cwd, shell: options.shell }
    calls.push(call)
    children.push(child)
    setTimeout(() => behave(child, call), 0)
    return child
  }
  return { spawn, calls, children }
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "fabula-renpy-"))
  sdk = join(work, "Ren'py folder", 'renpy-8.4.1-sdk')
  project = join(work, 'My Game (Ren\'Py game)')
  mkdirSync(sdk, { recursive: true })
  writeFileSync(join(sdk, 'renpy.exe'), '')
  mkdirSync(join(project, 'game'), { recursive: true })
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('createProject', () => {
  it('passes the generate_gui arguments as an array, with the SDK as cwd and no shell', async () => {
    const target = join(work, 'new', 'Game')
    const { spawn, calls } = fakeSpawn((child) => {
      mkdirSync(join(target, 'game'), { recursive: true })
      child.emit('exit', 0)
    })
    const result = await createProject(sdk, target, { width: 1920, height: 1080, accent: '#7c9cff' }, { spawn })
    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].exe).toBe(join(sdk, 'renpy.exe'))
    expect(calls[0].args).toEqual([
      join(sdk, 'launcher'),
      'generate_gui',
      target,
      '--start',
      '--width',
      '1920',
      '--height',
      '1080',
      '--accent',
      '#7c9cff',
      '--template',
      join(sdk, 'gui')
    ])
    expect(calls[0].cwd).toBe(sdk)
    expect(calls[0].shell).toBeUndefined()
  })

  it('reports a failure when the game folder does not appear', async () => {
    const { spawn } = fakeSpawn((child) => child.emit('exit', 1))
    const result = await createProject(sdk, join(work, 'x'), { width: 1280, height: 720, accent: '#112233' }, { spawn })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('exit code 1')
  })

  it('refuses a folder that already has other files, and bad input, without spawning', async () => {
    const { spawn, calls } = fakeSpawn(() => undefined)
    const busy = join(work, 'busy')
    mkdirSync(busy)
    writeFileSync(join(busy, 'notes.txt'), 'x')
    expect((await createProject(sdk, busy, { width: 1280, height: 720, accent: '#112233' }, { spawn })).ok).toBe(false)
    expect((await createProject(sdk, join(work, 'a'), { width: 1280, height: 720, accent: 'red' }, { spawn })).ok).toBe(false)
    expect((await createProject(sdk, join(work, 'b'), { width: 0, height: 720, accent: '#112233' }, { spawn })).ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('says so when renpy.exe is missing', async () => {
    const result = await createProject(join(work, 'nosdk'), join(work, 'g'), { width: 1280, height: 720, accent: '#112233' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('SDK')
  })
})

describe('runGame', () => {
  it('starts the project with --warp file:line', async () => {
    const { spawn, calls, children } = fakeSpawn(() => undefined)
    const promise = runGame(sdk, project, { warp: { file: 'act_one.rpy', line: 12 }, startupWaitMs: 20 }, { spawn })
    const result = await promise
    expect(result).toEqual({ ok: true, pid: 4242 })
    expect(calls[0].args).toEqual([project, '--warp', 'act_one.rpy:12'])
    expect(calls[0].cwd).toBe(sdk)
    expect(children).toHaveLength(1)
  })

  it('returns the traceback text when the game dies at once', async () => {
    const { spawn } = fakeSpawn((child) => {
      writeFileSync(join(project, 'traceback.txt'), '﻿I\'m sorry, but an uncaught exception occurred.\n')
      child.emit('exit', 1)
    })
    const result = await runGame(sdk, project, { startupWaitMs: 500 }, { spawn })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('uncaught exception')
  })

  it('ignores an errors.txt that is older than the launch', async () => {
    const old = join(project, 'errors.txt')
    writeFileSync(old, 'from a previous run')
    const past = new Date(Date.now() - 60000)
    const { utimesSync } = await import('node:fs')
    utimesSync(old, past, past)
    const { spawn } = fakeSpawn((child) => child.emit('exit', 0))
    expect(await runGame(sdk, project, { startupWaitMs: 500 }, { spawn })).toEqual({ ok: true, pid: 4242 })
  })

  it('answers ok after the wait while the game keeps running, then reports a late crash', async () => {
    const late: string[] = []
    const { spawn, children } = fakeSpawn(() => undefined)
    const result = await runGame(sdk, project, { startupWaitMs: 20, onLateError: (e) => late.push(e) }, { spawn })
    expect(result.ok).toBe(true)
    writeFileSync(join(project, 'errors.txt'), 'late failure')
    children[0].emit('exit', 1)
    expect(late).toEqual(['late failure'])
  })

  it('reports an error file written while the game is still open at the end of the wait', async () => {
    const { spawn } = fakeSpawn(() => {
      writeFileSync(join(project, 'traceback.txt'), 'screen of death')
    })
    const result = await runGame(sdk, project, { startupWaitMs: 50 }, { spawn })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('screen of death')
  })

  it('reports a spawn error and a missing game folder', async () => {
    const { spawn } = fakeSpawn((child) => child.emit('error', new Error('spawn failed')))
    expect(await runGame(sdk, project, {}, { spawn })).toEqual({ ok: false, error: 'spawn failed' })
    const empty = join(work, 'empty')
    mkdirSync(empty)
    expect((await runGame(sdk, empty)).ok).toBe(false)
  })
})

describe('lint', () => {
  it('passes a report file as the last argument and reads it', async () => {
    const { spawn, calls } = fakeSpawn((child, call) => {
      writeFileSync(call.args[call.args.length - 1], '﻿Statistics:\n\nThe game contains 1 menus.\n')
      child.emit('exit', 0)
    })
    const result = await lint(sdk, project, { spawn })
    expect(result.ok).toBe(true)
    expect(result.report.startsWith('Statistics')).toBe(true)
    expect(calls[0].args.slice(0, 2)).toEqual([project, 'lint'])
    expect(existsSync(calls[0].args[2])).toBe(false)
  })

  it('is not ok when the report names a script location', async () => {
    const { spawn } = fakeSpawn((child, call) => {
      writeFileSync(call.args[2], 'game/script.rpy:4 The label x is missing.\n')
      child.emit('exit', 0)
    })
    const result = await lint(sdk, project, { spawn })
    expect(result.ok).toBe(false)
    expect(result.report).toContain('script.rpy:4')
  })

  it('explains when no report was written', async () => {
    const { spawn } = fakeSpawn((child) => child.emit('exit', 2))
    const result = await lint(sdk, project, { spawn })
    expect(result.ok).toBe(false)
    expect(result.report).toContain('exit code 2')
  })
})

describe('distribute', () => {
  it('runs the launcher distribute command for the Windows package', async () => {
    const dest = join(work, 'dist')
    const { spawn, calls } = fakeSpawn((child) => {
      mkdirSync(dest, { recursive: true })
      writeFileSync(join(dest, 'game-1.0-win.zip'), 'zip')
      child.emit('exit', 0)
    })
    expect(await distribute(sdk, project, dest, { spawn })).toEqual({ ok: true })
    expect(calls[0].args).toEqual([join(sdk, 'launcher'), 'distribute', project, '--destination', dest, '--package', 'win'])
    expect(calls[0].cwd).toBe(sdk)
  })

  it('fails when nothing was produced', async () => {
    const { spawn } = fakeSpawn((child) => child.emit('exit', 0))
    const result = await distribute(sdk, project, join(work, 'dist2'), { spawn })
    expect(result.ok).toBe(false)
  })
})
