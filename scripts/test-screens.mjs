import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundle, generateGame, loadFixture, renpyExe, run, writeCompiled } from './lib.mjs'

/**
 * Real clicks on the designed screen, with Ren'Py's own test framework (`renpy.exe <project> test <name>`).
 * The test file below exists only in the temporary game; it is never part of an export.
 *
 * What runs: the fixture is compiled into a fresh game; each test case jumps (while the splash screen scene is showing) to the scene "Office"
 * (whose ending is the screen "Office desk"), and clicks. Every click is a real mouse click at game coordinates (the middle of the
 * element's rectangle) posted with the framework's own mouse, `renpy.test.testmouse.click_mouse`. The framework's `click "text"`
 * form is not used: it looks buttons up by spoken text and a hotspot has none. The test file also defines an empty `label main_menu`,
 * because a game made with generate_gui has no gui/button images and its real main menu cannot be drawn.
 * What each case saw is written to test_results.txt and checked below.
 */

const TEST_FILE = `init python:

    import os

    def tlog(text):
        with open(os.path.join(config.basedir, "test_results.txt"), "a") as f:
            f.write(text + "\\n")

    def tclick(x, y):
        renpy.test.testmouse.click_mouse(1, x, y)

label main_menu:
    return

testcase hub_screen:
    run Jump("office")
    pause 1.0
    click
    pause 1.0
    assert renpy.get_screen("office_desk") is not None
    $ tlog("hub: the Office scene ends with the designed screen office_desk, which is on screen")
    assert renpy.get_screen("note") is None
    $ tclick(310, 630)
    pause 0.6
    assert renpy.get_screen("note") is not None
    $ tlog("hub: the Read the note button (action Show) opened the second screen")
    $ tclick(600, 675)
    pause 0.6
    assert renpy.get_screen("note") is None
    $ tlog("hub: the Close note button (action Hide) closed it again")
    $ tlog("hub: trust before the hotspot click = " + repr(trust))
    $ tclick(110, 240)
    pause 0.6
    assert trust == 3.5
    $ tlog("hub: the Trust up hotspot (action SetVariable trust + 1) was clicked: trust = " + repr(trust))
    assert not has_key
    $ tclick(900, 200)
    pause 0.6
    assert has_key
    $ tlog("hub: the Lamp image button (action SetVariable has_key True) was clicked: has_key = " + repr(has_key))
    assert renpy.get_screen("office_desk") is not None
    $ tlog("hub: the screen is still waiting (setting a variable does not leave it)")
    $ renpy.screenshot(os.path.join(config.basedir, "hub.png"))
    run Quit(confirm=False)

testcase door_path:
    run Jump("office")
    pause 1.0
    click
    pause 1.0
    $ tclick(310, 530)
    pause 1.0
    assert _last_say_what == "The vault door swings open."
    $ tlog("door: the Open the door button (a leaving element) led to the Vault scene: " + _last_say_what)
    run Quit(confirm=False)

testcase drawer_path:
    run Jump("office")
    pause 1.0
    click
    pause 1.0
    assert renpy.get_screen("office_desk") is not None
    $ tclick(490, 360)
    pause 1.0
    assert _last_say_what == "A brass key lies in the drawer."
    $ tlog("drawer: clicking the middle of the Drawer hotspot led to the Drawer scene: " + _last_say_what)
    run Quit(confirm=False)

testcase window_path:
    run Jump("office")
    pause 1.0
    click
    pause 1.0
    assert renpy.get_screen("office_desk") is not None
    $ tclick(800, 375)
    pause 1.0
    assert _last_say_what == "Rain taps on the window."
    $ tlog("window: clicking the middle of the Window hotspot led to the Window scene: " + _last_say_what)
    run Quit(confirm=False)

testcase overlay_block:
    run Jump("secret")
    pause 1.0
    assert renpy.get_screen("note") is not None
    $ tlog("overlay: the Show screen block put the Note screen on top of the dialogue: " + _last_say_what)
    $ renpy.screenshot(os.path.join(config.basedir, "overlay.png"))
    $ tclick(600, 675)
    pause 0.6
    assert renpy.get_screen("note") is None
    $ tlog("overlay: its Close note button hid it")
    run Quit(confirm=False)
`

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fabula-screens-'))
  let failed = false
  try {
    const mods = await bundle({ compiler: 'src/shared/compiler/index.ts', kits: 'src/main/kits.ts' }, join(work, 'bundle'))
    const { project, kits } = loadFixture(mods.kits)
    const result = mods.compiler.compileProject(project, { kits })
    const gameProject = join(work, 'game-project')
    const created = await generateGame(gameProject, project)
    if (created.code !== 0 || !existsSync(join(gameProject, 'game'))) throw new Error(`generate_gui failed (exit ${created.code})`)
    writeCompiled(gameProject, result)
    writeFileSync(join(gameProject, 'game', 'zz_screens_test.rpy'), TEST_FILE, 'utf8')

    const names = process.env.ONLY ? [process.env.ONLY] : ['hub_screen', 'door_path', 'drawer_path', 'window_path', 'overlay_block']
    for (const name of names) {
      const started = Date.now()
      const finished = await run([gameProject, 'test', name], 60000)
      console.log(`testcase ${name}: renpy exited with code ${finished.code} after ${((Date.now() - started) / 1000).toFixed(1)} s`)
      for (const f of ['errors.txt', 'traceback.txt']) {
        const file = join(gameProject, f)
        if (existsSync(file) && statNewer(file, started)) {
          const text = readFileSync(file, 'utf8')
          const why = text.split('\n').filter((l) => /^(Exception|[A-Za-z.]*Error)/.test(l)).slice(0, 2)
          console.log(`FAIL: ${f}: ${why.join(' | ') || text.slice(0, 300)}`)
          failed = true
        }
      }
    }
    const results = join(gameProject, 'test_results.txt')
    const lines = existsSync(results) ? readFileSync(results, 'utf8').split('\n').filter(Boolean) : []
    console.log('---- what the test saw ----')
    for (const l of lines) console.log(l)
    console.log('---- end ----')
    const need = [
      'hub: the Office scene ends with the designed screen',
      'hub: the Read the note button',
      'hub: the Close note button',
      'hub: the Trust up hotspot',
      'hub: the Lamp image button',
      'hub: the screen is still waiting',
      'door: the Open the door button',
      'drawer: clicking the middle of the Drawer hotspot',
      'window: clicking the middle of the Window hotspot',
      'overlay: the Show screen block',
      'overlay: its Close note button'
    ]
    if (!process.env.ONLY) {
      for (const n of need) {
        const ok = lines.some((l) => l.startsWith(n))
        console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}`)
        if (!ok) failed = true
      }
    }
    if (process.env.KEEP) {
      console.log(`kept ${work}`)
    }
  } finally {
    if (!process.env.KEEP) rmSync(work, { recursive: true, force: true })
  }
  if (failed) {
    console.error('\nSCREENS RUN FAILED')
    process.exitCode = 1
  } else console.log('\nSCREENS RUN OK')
}

function statNewer(file, since) {
  try {
    return statSync(file).mtimeMs >= since - 2000
  } catch {
    return false
  }
}

if (!existsSync(renpyExe)) {
  console.error(`FAIL: renpy.exe not found at ${renpyExe} (set RENPY_SDK)`)
  process.exitCode = 1
} else {
  main().catch((e) => {
    console.error(String(e?.stack ?? e))
    process.exitCode = 1
  })
}
