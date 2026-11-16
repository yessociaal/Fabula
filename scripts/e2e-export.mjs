import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { bundle, placeholderFor, renpyExe, root, sdk } from './lib.mjs'

/**
 * End-to-end check with the real Ren'Py SDK and the real exporter, no mocks:
 * generate_gui -> export -> lint -> export again -> distribute -> run with --warp -> stop that process.
 */

const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${message}`)
  if (!condition) failures.push(message)
}

function listFiles(dir, base = dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(full.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out.sort()
}

function snapshot(dir) {
  const out = {}
  for (const rel of listFiles(dir)) {
    const full = join(dir, ...rel.split('/'))
    out[rel] = `${statSync(full).mtimeMs}:${readFileSync(full).toString('base64')}`
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function main() {
  if (!existsSync(renpyExe)) {
    console.error(`FAIL: renpy.exe not found at ${renpyExe} (set RENPY_SDK)`)
    process.exitCode = 1
    return
  }
  const work = mkdtempSync(join(tmpdir(), 'fabula-e2e-'))
  let gamePid = null
  try {
    const mods = await bundle(
      { exporter: 'src/main/exporter.ts', renpy: 'src/main/renpy.ts', lintReport: 'src/shared/lintReport.ts' },
      join(work, 'bundle')
    )
    const { exportProject } = mods.exporter
    const { createProject, lint, distribute, runGame, readNewError } = mods.renpy

    // A clean copy of the demo story: the fixture has one known error (the "Otherwise" exit of the second Gate).
    const project = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'demo.fabula.json'), 'utf8'))
    project.scenes.s_gate2.ending.elseTarget = 's_end'
    project.meta.title = 'End to End Story'

    const editor = join(work, 'editor')
    for (const asset of Object.values(project.assets)) {
      const file = join(editor, 'assets', ...asset.file.split('/'))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, placeholderFor(asset.file))
    }

    // 1. create the Ren'Py project
    const gameDir = join(work, "End to End Story (Ren'Py game)")
    let t = Date.now()
    const created = await createProject(sdk, gameDir, { width: project.meta.width, height: project.meta.height, accent: project.meta.accentColor })
    check(created.ok && existsSync(join(gameDir, 'game', 'gui.rpy')), `generate_gui created the project (${Date.now() - t} ms)`)
    project.renpyProjectDir = gameDir
    const guarded = ['game/gui.rpy', 'game/screens.rpy']
    const guardedBefore = guarded.map((f) => readFileSync(join(gameDir, f)))
    const filesBefore = listFiles(gameDir)

    // 2. first export
    const first = exportProject(editor, project)
    check(first.ok === true, `first export succeeded${first.ok ? ` (${first.changed.length} files written)` : `: ${first.error}`}`)
    const added = listFiles(gameDir).filter((f) => !filesBefore.includes(f))
    check(added.length > 0 && added.every((f) => f.startsWith('game/')), `export wrote only game files (${added.length} new)`)
    check(guarded.every((f, i) => readFileSync(join(gameDir, f)).equals(guardedBefore[i])), 'gui.rpy and screens.rpy are byte-identical after export')
    check(readFileSync(join(gameDir, 'game', 'options.rpy'), 'utf8').includes('_("End to End Story")'), 'options.rpy has the story title as the game name')
    const manifest = JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8'))
    check(manifest.files.includes('script.rpy') && !existsSync(join(gameDir, 'export-manifest.json')), 'manifest is in the editor folder, not the game')
    check(existsSync(join(editor, 'backups')), 'the template script.rpy was backed up')
    for (const f of ['script.rpy', 'act_one.rpy', 'act_two.rpy']) {
      const text = readFileSync(join(gameDir, 'game', f), 'utf8')
      check(!/^\s*#/m.test(text) && !/fabula|generated/i.test(text), `${f} has no comment and no tool name`)
    }

    const script = readFileSync(join(gameDir, 'game', 'script.rpy'), 'utf8')
    for (const [what, needle] of [
      ['a voice line', 'voice "audio/voice/anna_01.wav"'],
      ['the ambient channel', 'renpy.music.register_channel("ambient", "sfx", loop=True)'],
      ['an ambient track', 'play ambient "audio/ambient/rain.wav"'],
      ['an Ask the player block', 'renpy.input("What is your name?"'],
      ['an NVL character and narrator', 'kind=nvl'],
      ['NVL clear', 'nvl clear'],
      ['a custom placement', '        xalign 0.25'],
      ['a movie', 'renpy.movie_cutscene("movies/intro.webm")'],
      ['a splash screen', 'label splashscreen:'],
      ['a persistent variable', 'default persistent.seen_ending = False'],
      ['a sub-scene call', '    call cellar\n'],
      ['a call nested in an If inside a Choice option', '            if has_key:\n                call cellar\n            else:\n'],
      ['an empty Choice option', '        "Leave" if courage >= 1:\n            pass\n']
    ]) {
      check(script.includes(needle), `the exported script contains ${what}`)
    }
    check(
      existsSync(join(gameDir, 'game', 'images', 'characters', 'side nova.png')) && existsSync(join(gameDir, 'game', 'movies', 'intro.webm')),
      'the side image and the movie file were copied into the game'
    )

    // 3. lint
    t = Date.now()
    const linted = await lint(sdk, gameDir)
    check(linted.ok === true, `Ren'Py lint is clean (${Date.now() - t} ms)`)
    if (!linted.ok) console.log(linted.report)
    const statLine = linted.report.split(/\r?\n/).find((l) => l.startsWith('The game contains'))
    console.log(`      lint: ${statLine ?? '(no statistics line)'}`)

    // 4. second export changes nothing
    const snapA = snapshot(gameDir)
    const manifestMtime = statSync(join(editor, 'export-manifest.json')).mtimeMs
    await sleep(50)
    const second = exportProject(editor, project)
    check(second.ok === true && second.changed.length === 0, `second export reported no changes (${second.changed?.length ?? '?'} files)`)
    const snapB = snapshot(gameDir)
    check(JSON.stringify(snapA) === JSON.stringify(snapB), 'every file in the game folder has the same content and mtime after the second export')
    check(statSync(join(editor, 'export-manifest.json')).mtimeMs === manifestMtime, 'the manifest was not rewritten')

    // 5. distribute
    const dist = join(work, 'dist')
    t = Date.now()
    const built = await distribute(sdk, gameDir, dist)
    const zips = existsSync(dist) ? readdirSync(dist).filter((n) => n.endsWith('.zip')) : []
    check(built.ok === true && zips.length > 0, `distribute produced a package: ${zips.map((z) => `${z} ${(statSync(join(dist, z)).size / 1048576).toFixed(1)} MB`).join(', ') || 'none'} (${((Date.now() - t) / 1000).toFixed(1)} s)`)

    // 6. run the game warped to a scene, watch for ~10 s, stop only that process
    const scene = second.sceneLocations.s_extras
    const warp = { file: scene.file, line: scene.line + 1 }
    console.log(`      launching with --warp ${warp.file}:${warp.line}`)
    const launchedAt = Date.now()
    const late = []
    const run = await runGame(sdk, gameDir, { warp, startupWaitMs: 3000, onLateError: (e) => late.push(e) })
    gamePid = run.pid ?? null
    check(run.ok === true && gamePid !== null, `game launched (pid ${gamePid})${run.ok ? '' : `: ${run.error}`}`)
    await sleep(Math.max(0, 10000 - (Date.now() - launchedAt)))
    check(alive(gamePid), 'the game is still running after 10 s')
    const err = readNewError(gameDir, launchedAt)
    check(err === null && late.length === 0, `no new errors.txt / traceback.txt${err ? `: ${err.slice(0, 300)}` : ''}`)
    await stopByPid(gamePid)
    await sleep(1500)
    check(!alive(gamePid), `stopped only pid ${gamePid}; it is gone`)

    // 6b. warp into the scene that visits a sub-scene, then into the sub-scene itself; each must stay up 10 s with no error files
    for (const [id, what] of [
      ['s_tour', 'the scene that visits a sub-scene (twice, once inside an If inside a Choice option)'],
      ['s_cellar', 'the sub-scene itself']
    ]) {
      const loc = second.sceneLocations[id]
      const w = { file: loc.file, line: loc.line + 1 }
      console.log(`      launching with --warp ${w.file}:${w.line} (${what})`)
      const startedAt = Date.now()
      const lateErrors = []
      const started = await runGame(sdk, gameDir, { warp: w, startupWaitMs: 3000, onLateError: (e) => lateErrors.push(e) })
      gamePid = started.pid ?? null
      check(started.ok === true && gamePid !== null, `game launched into ${what} (pid ${gamePid})${started.ok ? '' : `: ${started.error}`}`)
      await sleep(Math.max(0, 10000 - (Date.now() - startedAt)))
      check(alive(gamePid), `the game is still running after 10 s in ${what}`)
      const problem = readNewError(gameDir, startedAt)
      check(problem === null && lateErrors.length === 0, `no new errors.txt / traceback.txt for ${what}${problem ? `: ${problem.slice(0, 300)}` : ''}`)
      await stopByPid(gamePid)
      await sleep(1500)
      check(!alive(gamePid), `stopped only pid ${gamePid}; it is gone`)
      gamePid = null
    }

    // 7. a normal start (no warp) runs the splash screen scene first; give it 6 s
    const splashAt = Date.now()
    const splashLate = []
    const splash = await runGame(sdk, gameDir, { startupWaitMs: 3000, onLateError: (e) => splashLate.push(e) })
    gamePid = splash.pid ?? null
    check(splash.ok === true && gamePid !== null, `game launched without --warp, so the splash screen runs first (pid ${gamePid})${splash.ok ? '' : `: ${splash.error}`}`)
    await sleep(Math.max(0, 6000 - (Date.now() - splashAt)))
    check(alive(gamePid), 'the game is still running after 6 s on the splash screen')
    const splashErr = readNewError(gameDir, splashAt)
    check(splashErr === null && splashLate.length === 0, `no new errors.txt / traceback.txt after the splash screen${splashErr ? `: ${splashErr.slice(0, 300)}` : ''}`)
  } finally {
    if (gamePid !== null) {
      await stopByPid(gamePid)
      await sleep(1500)
      check(!alive(gamePid), `stopped only pid ${gamePid}; it is gone`)
    }
    rmSync(work, { recursive: true, force: true })
  }
}

async function stopByPid(pid) {
  await new Promise((resolve) => {
    const k = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    k.on('exit', resolve)
    k.on('error', resolve)
  })
}

main()
  .catch((error) => {
    console.error(String(error?.stack ?? error))
    failures.push('unexpected error')
  })
  .finally(() => {
    if (failures.length > 0) {
      console.error(`\nE2E FAILED (${failures.length}):\n- ${failures.join('\n- ')}`)
      process.exitCode = 1
    } else {
      console.log('\nE2E OK')
    }
  })
