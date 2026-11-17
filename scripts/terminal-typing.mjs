import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundle, generateGame, loadFixture, renpyExe, run, writeCompiled } from './lib.mjs'

/**
 * Real typing into the running Terminal session, with Ren'Py's own test framework (`renpy.exe <project> test <name>`).
 * The test file below exists only in the temporary game; it is never part of an export.
 * It starts the game, jumps to the Terminal scene of the fixture, types commands one key at a time and writes what it saw
 * into test_results.txt. Runs: stay and then leave through "unlock", leave through "exit", and keys that need escaping (space, percent, bracket).
 */

const TEST_FILE = `init python:

    import os

    def tlog(text):
        with open(os.path.join(config.basedir, "test_results.txt"), "a") as f:
            f.write(text + "\\n")

testcase unlock_path:
    run Jump("server_room")
    pause 1.0
    click
    pause 1.5
    assert renpy.get_screen("terminal") is not None
    $ tlog("unlock: terminal screen is up, history shows the print block and the opening lines: " + repr(terminal_lines))
    type "help\\n"
    pause 0.6
    assert "Commands: help, unlock, exit" in terminal_lines
    $ tlog("unlock: help stayed in the terminal and printed its reply")
    type "bogus\\n"
    pause 0.6
    assert terminal_lines[-1] == "Unknown command."
    $ tlog("unlock: an unknown command printed the fallback: " + repr(terminal_lines[-2:]))
    type "zq"
    type BACKSPACE
    type BACKSPACE
    type "UNLOCK\\n"
    pause 0.8
    assert "Access granted." in terminal_lines
    assert has_key
    $ tlog("unlock: UNLOCK was typed in capitals after two characters were typed and removed with Backspace, and still matched; the effect ran (has_key = " + repr(has_key) + ")")
    type "\\n"
    pause 1.0
    assert _last_say_what == "The vault door swings open."
    $ tlog("unlock: reached the vault scene, last line: " + _last_say_what)
    run Quit(confirm=False)

testcase odd_space:
    run Jump("server_room")
    pause 1.0
    click
    pause 1.5
    type "open door\\n"
    pause 0.6
    $ tlog("odd_space: typed open door -> stored " + repr(terminal_lines[-2:]) + " shows " + repr(renpy.substitute(terminal_lines[-2])))
    run Quit(confirm=False)

testcase odd_percent:
    run Jump("server_room")
    pause 1.0
    click
    pause 1.5
    type "50%\\n"
    pause 0.6
    $ tlog("odd_percent: typed 50% -> stored " + repr(terminal_lines[-2:]) + " shows " + repr(renpy.substitute(terminal_lines[-2])))
    run Quit(confirm=False)

testcase odd_bracket:
    run Jump("server_room")
    pause 1.0
    click
    pause 1.5
    type "[x]\\n"
    pause 0.6
    $ tlog("odd_bracket: typed [x] -> stored " + repr(terminal_lines[-2:]) + " shows " + repr(renpy.substitute(terminal_lines[-2])))
    run Quit(confirm=False)

testcase exit_path:
    run Jump("server_room")
    pause 1.0
    click
    pause 1.5
    type "exit\\n"
    pause 0.8
    assert "Goodbye." in terminal_lines
    type "\\n"
    pause 1.0
    assert _last_say_what == "The end."
    $ tlog("exit: the exit command left through its own arrow and reached The End, last line: " + _last_say_what)
    run Quit(confirm=False)
`

async function main() {
  const work = mkdtempSync(join(tmpdir(), 'fabula-typing-'))
  let failed = false
  try {
    const mods = await bundle({ compiler: 'src/shared/compiler/index.ts', kits: 'src/main/kits.ts' }, join(work, 'bundle'))
    const { project, kits } = loadFixture(mods.kits)
    const result = mods.compiler.compileProject(project, { kits })
    const gameProject = join(work, 'game-project')
    const created = await generateGame(gameProject, project)
    if (created.code !== 0 || !existsSync(join(gameProject, 'game'))) throw new Error(`generate_gui failed (exit ${created.code})`)
    writeCompiled(gameProject, result)
    writeFileSync(join(gameProject, 'game', 'zz_typing_test.rpy'), TEST_FILE, 'utf8')

    for (const name of (process.env.ONLY ? [process.env.ONLY] : ['unlock_path', 'exit_path', 'odd_space', 'odd_percent', 'odd_bracket'])) {
      const started = Date.now()
      const finished = await run([gameProject, 'test', name], 60000)
      console.log(`testcase ${name}: renpy exited with code ${finished.code} after ${((Date.now() - started) / 1000).toFixed(1)} s`)
      for (const f of ['errors.txt', 'traceback.txt']) {
        const file = join(gameProject, f)
        if (existsSync(file) && statNewer(file, started)) {
          console.log(`FAIL: ${f}:\n${readFileSync(file, 'utf8')}`)
          failed = true
        }
      }
    }
    const results = join(gameProject, 'test_results.txt')
    const lines = existsSync(results) ? readFileSync(results, 'utf8').split('\n').filter(Boolean) : []
    console.log('---- what the test saw ----')
    for (const l of lines) console.log(l)
    console.log('---- end ----')
    const need = ['unlock: terminal screen is up', 'unlock: help stayed', 'unlock: an unknown command printed the fallback', 'unlock: UNLOCK was typed', 'unlock: reached the vault scene', 'exit: the exit command left', "odd_space: typed open door -> stored ['> open door'", "odd_percent: typed 50% -> stored ['> 50%'", "odd_bracket: typed [x] -> stored ['> [[x]'"]
    for (const n of need) {
      const ok = lines.some((l) => l.startsWith(n))
      console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}`)
      if (!ok) failed = true
    }
  } finally {
    if (process.env.KEEP) console.log('kept ' + work)
    else rmSync(work, { recursive: true, force: true })
  }
  if (failed) {
    console.error('\nTYPING RUN FAILED')
    process.exitCode = 1
  } else console.log('\nTYPING RUN OK')
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
