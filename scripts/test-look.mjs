import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { bundle, generateGame, makePng, placeholderFor, renpyExe, root, run, sdk } from './lib.mjs'

/**
 * Real-engine proof for Look & Feel, with the real SDK and the real code, no mocks:
 * generate_gui -> export a trivial story -> hand-edit one line -> applyLook (accent colour, dialogue font, text size, text box picture, version,
 * about text, title switch, and the hand-edited line) -> a unified diff proves that only the intended lines changed and screens.rpy is byte-identical
 * -> Ren'Py lint -> start the game for about 8 s -> Ren'Py's test framework reads the values back from the running game.
 */

const failures = []
const check = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${message}`)
  if (!condition) failures.push(message)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const alive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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
  for (const rel of listFiles(dir)) out[rel] = readFileSync(join(dir, ...rel.split('/')))
  return out
}

function copyTree(from, to) {
  for (const rel of listFiles(from)) {
    const target = join(to, ...rel.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, readFileSync(join(from, ...rel.split('/'))))
  }
}

/** git's own unified diff of two files, as the -/+ lines only (line breaks stripped). */
function unifiedDiff(cwd, before, after) {
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-color', '--unified=0', '--', before, after], { cwd, encoding: 'utf8' })
  const text = r.stdout ?? ''
  const changes = text.split('\n').filter((l) => /^[-+]/.test(l) && !l.startsWith('---') && !l.startsWith('+++')).map((l) => l.replace(/\r$/, ''))
  return { text, changes }
}

const TEST_FILE = `init python:

    import os

    def tlog(text):
        with open(os.path.join(config.basedir, "test_results.txt"), "a") as f:
            f.write(text + "\\n")

label main_menu:
    return

testcase look_values:
    run Jump("start")
    pause 1.0
    $ tlog("accent=" + gui.accent_color)
    $ tlog("text_size=" + str(gui.text_size))
    $ tlog("name_text_size=" + str(gui.name_text_size))
    $ tlog("text_font=" + gui.text_font)
    $ tlog("font_loadable=" + str(renpy.loadable(gui.text_font)))
    $ tlog("textbox_size=" + str(renpy.image_size("gui/textbox.png")))
    $ tlog("version=" + config.version)
    $ tlog("show_name=" + str(gui.show_name))
    $ tlog("about=" + repr(gui.about))
    $ renpy.screenshot(os.path.join(config.basedir, "look.png"))
    run Quit(confirm=False)
`

async function main() {
  if (!existsSync(renpyExe)) {
    console.error(`FAIL: renpy.exe not found at ${renpyExe} (set RENPY_SDK)`)
    process.exitCode = 1
    return
  }
  const work = mkdtempSync(join(tmpdir(), 'fabula-look-'))
  let gamePid = null
  try {
    const mods = await bundle(
      {
        look: 'src/main/look.ts',
        exporter: 'src/main/exporter.ts',
        renpy: 'src/main/renpy.ts',
        factory: 'src/shared/factory.ts',
        lintReport: 'src/shared/lintReport.ts',
        request: 'src/shared/lookRequest.ts'
      },
      join(work, 'bundle')
    )
    const { applyLook, readLook } = mods.look
    const { exportProject } = mods.exporter
    const { lint, runGame, readNewError } = mods.renpy
    const { parseLintReport } = mods.lintReport

    // 1. a real game
    const story = mods.factory.createProject('Look Proof')
    story.meta.width = 1280
    story.meta.height = 720
    const gameDir = join(work, 'game-project')
    const created = await generateGame(gameDir, story)
    check(created.code === 0 && existsSync(join(gameDir, 'game', 'gui.rpy')), 'generate_gui made a real game (gui.rpy, options.rpy, screens.rpy, gui/)')

    // 2. export a trivial story into it (the exporter writes script.rpy and the one config.name line)
    const editor = join(work, 'editor')
    mkdirSync(join(editor, 'assets', 'ui'), { recursive: true })
    mkdirSync(join(editor, 'assets', 'fonts'), { recursive: true })
    const start = Object.values(story.scenes)[0]
    start.ending = { type: 'end' }
    start.blocks.push({ ...mods.factory.createBlock('say'), text: 'The look proof works.' })
    story.renpyProjectDir = gameDir
    const exported = exportProject(editor, story, { builtInKitsDir: join(root, 'resources', 'kits') })
    check(exported.ok === true, `a trivial story was exported${exported.ok ? '' : `: ${exported.error}`}`)

    // 3. one line is hand-edited by the "author" before Look & Feel is used
    const guiFile = join(gameDir, 'game', 'gui.rpy')
    const guiText = readFileSync(guiFile, 'utf8')
    check(guiText.includes('define gui.name_text_size = 30'), 'the template has define gui.name_text_size = 30')
    writeFileSync(guiFile, guiText.replace('define gui.name_text_size = 30', 'define gui.name_text_size = 15 * 2'))

    // 4. assets that the story owns: a real font (the DejaVu copy from the SDK) and a real tiny PNG
    const png = makePng()
    const font = placeholderFor('x.ttf')
    writeFileSync(join(editor, 'assets', 'ui', 'box.png'), png)
    writeFileSync(join(editor, 'assets', 'fonts', 'dejavu.ttf'), font)

    // 5. the state of the game just before Apply
    const before = join(work, 'before')
    copyTree(join(gameDir, 'game'), before)
    const beforeFiles = snapshot(before)
    const beforeRead = Object.fromEntries(readLook(gameDir).map((e) => [e.key, e]))
    check(beforeRead['gui.name_text_size'].editedByHand === true && beforeRead['gui.name_text_size'].found === false, 'readLook reports the hand-edited line as "edited by hand"')
    check(readLook(gameDir).filter((e) => e.key !== 'gui.name_text_size').every((e) => e.found), 'readLook finds every other field in the real files, exactly once')

    // 6. Apply
    const values = {
      'gui.accent_color': '#e8505b',
      'gui.text_size': '30',
      'gui.name_text_size': '40',
      'config.version': '1.1',
      'gui.show_name': 'False',
      'gui.about': 'About this game.\n\nA second paragraph.'
    }
    const uploads = {
      'gui.text_font': { file: 'fonts/dejavu.ttf', to: 'fonts/dejavu_copy.ttf' },
      'gui/textbox.png': { file: 'ui/box.png' }
    }
    const result = applyLook(gameDir, editor, values, uploads, { now: () => new Date(2026, 0, 2, 3, 4, 5) })
    check(result.ok === true, `applyLook ran${result.ok ? '' : `: ${result.error}`}`)
    const status = Object.fromEntries(result.results.map((r) => [r.key, r.status]))
    console.log('per-field results:', JSON.stringify(status))
    check(
      ['gui.accent_color', 'gui.text_size', 'config.version', 'gui.show_name', 'gui.about', 'gui.text_font', 'gui/textbox.png'].every((k) => status[k] === 'applied'),
      'the seven intended fields were applied'
    )
    check(status['gui.name_text_size'] === 'edited-by-hand', 'the hand-edited line was reported as edited-by-hand')

    // 7. only the intended lines changed
    const afterFiles = snapshot(join(gameDir, 'game'))
    const changedFiles = Object.keys(afterFiles).filter((f) => !beforeFiles[f] || !beforeFiles[f].equals(afterFiles[f]))
    console.log('files that differ:', changedFiles.join(', '))
    check(
      JSON.stringify(changedFiles.sort()) === JSON.stringify(['fonts/dejavu_copy.ttf', 'gui.rpy', 'gui/textbox.png', 'options.rpy']),
      'only gui.rpy, options.rpy, gui/textbox.png and the new fonts/dejavu_copy.ttf changed'
    )
    check(Object.keys(beforeFiles).every((f) => afterFiles[f]), 'no file was deleted')
    check(afterFiles['screens.rpy'].equals(beforeFiles['screens.rpy']), 'screens.rpy is byte-identical')
    check(afterFiles['gui/textbox.png'].equals(png) && beforeFiles['gui/textbox.png'].equals(png) === false, 'gui/textbox.png is now the uploaded PNG')
    check(afterFiles['fonts/dejavu_copy.ttf'].equals(font), 'the font was copied to game/fonts/')

    const guiDiff = unifiedDiff(work, 'before/gui.rpy', 'game-project/game/gui.rpy')
    console.log('--- unified diff, gui.rpy ---\n' + guiDiff.text.split('\n').filter((l) => !l.startsWith('index ')).join('\n'))
    check(
      JSON.stringify(guiDiff.changes) ===
        JSON.stringify([
          "-define gui.accent_color = '#7c9cff'",
          "+define gui.accent_color = '#e8505b'",
          '-define gui.text_font = "DejaVuSans.ttf"',
          '+define gui.text_font = "fonts/dejavu_copy.ttf"',
          '-define gui.text_size = 22',
          '+define gui.text_size = 30'
        ]),
      'gui.rpy differs in exactly three lines (accent colour, dialogue font, text size) and the hand-edited name size line is untouched'
    )
    const optDiff = unifiedDiff(work, 'before/options.rpy', 'game-project/game/options.rpy')
    console.log('--- unified diff, options.rpy ---\n' + optDiff.text.split('\n').filter((l) => !l.startsWith('index ')).join('\n'))
    check(
      optDiff.changes.length === 7 &&
        optDiff.changes.includes('-define gui.show_name = True') &&
        optDiff.changes.includes('+define gui.show_name = False') &&
        optDiff.changes.includes('-define config.version = "1.0"') &&
        optDiff.changes.includes('+define config.version = "1.1"') &&
        optDiff.changes.includes('+About this game.') &&
        optDiff.changes.includes('+A second paragraph.'),
      'options.rpy differs only in the show_name line, the version line and the lines between the about text quotes'
    )
    check(readFileSync(join(gameDir, 'game', 'gui.rpy')).includes(Buffer.from('\r\n')) && !/[^\r]\n/.test(readFileSync(join(gameDir, 'game', 'gui.rpy'), 'utf8')), 'gui.rpy still has only CRLF line breaks, and its byte order mark')
    check(readFileSync(guiFile).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), 'gui.rpy still starts with its byte order mark')
    const backupDir = join(editor, 'backups', '20260102-030405')
    check(result.backupDir === backupDir && readFileSync(join(backupDir, 'gui.rpy')).equals(beforeFiles['gui.rpy']), 'the original gui.rpy is kept in backups/<timestamp>/')
    check(readFileSync(join(backupDir, 'gui', 'textbox.png')).equals(beforeFiles['gui/textbox.png']), 'the original gui/textbox.png is kept in backups/<timestamp>/gui/')
    const again = applyLook(gameDir, editor, values, uploads, { now: () => new Date(2026, 0, 2, 3, 4, 6) })
    const againStatus = Object.fromEntries(again.results.map((r) => [r.key, r.status]))
    check(
      Object.entries(againStatus).every(([k, s]) => s === (k === 'gui.name_text_size' ? 'edited-by-hand' : 'unchanged')),
      'applying the same values again changes nothing (idempotent)'
    )
    check(readLook(gameDir).find((e) => e.key === 'gui.name_text_size').editedByHand === true, 'the hand-edited line is still reported after Apply')

    // 8. Ren'Py lint
    const linted = await lint(sdk, gameDir)
    const summary = parseLintReport(linted.report)
    console.log('lint:', linted.report.split('\n').filter((l) => /statistics|Lint|error|warning|problem/i.test(l)).slice(0, 6).join(' | '))
    check(linted.ok === true && summary.ok === true, "Ren'Py lint is clean on the game after Apply")

    // 9. start the game for about 8 s, warping into the exported scene
    const loc = exported.sceneLocations[start.id]
    const startedAt = Date.now()
    const late = []
    const started = await runGame(sdk, gameDir, { warp: { file: loc.file, line: loc.line + 1 }, startupWaitMs: 3000, onLateError: (e) => late.push(e) })
    gamePid = started.pid ?? null
    check(started.ok === true && gamePid !== null, `the game launched (pid ${gamePid})${started.ok ? '' : `: ${started.error}`}`)
    await sleep(Math.max(0, 8000 - (Date.now() - startedAt)))
    check(alive(gamePid), 'the game is still running after 8 s')
    const problem = readNewError(gameDir, startedAt)
    check(problem === null && late.length === 0 && !existsSync(join(gameDir, 'errors.txt')) && !existsSync(join(gameDir, 'traceback.txt')), `no errors.txt / traceback.txt after 8 s${problem ? `: ${problem.slice(0, 300)}` : ''}`)
    await stopByPid(gamePid)
    await sleep(1500)
    check(!alive(gamePid), `stopped only pid ${gamePid}; it is gone`)
    gamePid = null

    // 10. the running engine reads the new values back (Ren'Py's own test framework)
    writeFileSync(join(gameDir, 'game', 'zz_look_test.rpy'), TEST_FILE, 'utf8')
    const testStart = Date.now()
    const tested = await run([gameDir, 'test', 'look_values'], 60000)
    console.log(`testcase look_values: renpy exited with code ${tested.code} after ${((Date.now() - testStart) / 1000).toFixed(1)} s`)
    const results = join(gameDir, 'test_results.txt')
    const lines = existsSync(results) ? readFileSync(results, 'utf8').split(/\r?\n/).filter(Boolean) : []
    console.log('---- what the running game saw ----')
    for (const l of lines) console.log(l)
    console.log('---- end ----')
    const saw = (s) => lines.includes(s)
    check(saw('accent=#e8505b'), 'the engine reads gui.accent_color = #e8505b')
    check(saw('text_size=30'), 'the engine reads gui.text_size = 30')
    check(saw('name_text_size=30'), 'the hand-edited gui.name_text_size is still 15 * 2 = 30 in the engine')
    check(saw('text_font=fonts/dejavu_copy.ttf') && saw('font_loadable=True'), 'the engine reads gui.text_font = fonts/dejavu_copy.ttf and the font file is loadable')
    check(saw('textbox_size=(1, 1)'), 'the engine loads the replaced gui/textbox.png (1 x 1 pixel)')
    check(saw('version=1.1') && saw('show_name=False'), 'the engine reads config.version = 1.1 and gui.show_name = False')
    check(lines.some((l) => l.startsWith('about=') && l.includes('About this game.') && l.includes('A second paragraph.')), 'the engine reads the about text')
    check(existsSync(join(gameDir, 'look.png')), 'a screenshot of the running game was taken')
    const lateErr = readNewError(gameDir, testStart)
    check(lateErr === null, `no new errors.txt / traceback.txt from the test run${lateErr ? `: ${lateErr.slice(0, 300)}` : ''}`)
  } finally {
    if (gamePid !== null) {
      await stopByPid(gamePid)
      await sleep(1500)
      check(!alive(gamePid), `stopped only pid ${gamePid}; it is gone`)
    }
    if (process.env.KEEP) console.log(`kept ${work}`)
    else rmSync(work, { recursive: true, force: true })
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
      console.error(`\nLOOK RUN FAILED (${failures.length}):\n- ${failures.join('\n- ')}`)
      process.exitCode = 1
    } else {
      console.log('\nLOOK RUN OK')
    }
  })
