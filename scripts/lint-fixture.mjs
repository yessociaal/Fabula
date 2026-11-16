import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { bundle, makePng, makeWav, renpyExe, root, run, sdk } from './lib.mjs'

function fail(message) {
  console.error(`FAIL: ${message}`)
  process.exitCode = 1
}

async function main() {
  if (!existsSync(renpyExe)) {
    fail(`renpy.exe not found at ${renpyExe} (set RENPY_SDK)`)
    return
  }
  const workDir = mkdtempSync(join(tmpdir(), 'renpy-lint-'))
  try {
    const mods = await bundle(
      { compiler: 'src/shared/compiler/index.ts', lintReport: 'src/shared/lintReport.ts' },
      join(workDir, 'bundle')
    )
    const project = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'demo.fabula.json'), 'utf8'))
    const result = mods.compiler.compileProject(project)

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
    console.log("---- Ren'Py lint report ----")
    console.log(text)
    console.log('---- end of report ----')

    const summary = mods.lintReport.parseLintReport(text)
    const problems = [...summary.problems]
    for (const name of ['errors.txt', 'traceback.txt']) {
      if (existsSync(join(projectDir, name))) problems.push(`${name} was written: ${readFileSync(join(projectDir, name), 'utf8')}`)
    }
    if (problems.length > 0) {
      fail(`Ren'Py lint reported problems:\n${problems.join('\n')}`)
      return
    }
    console.log(`OK: Ren'Py lint reported no problems in ${result.files.map((f) => f.path).join(', ')}`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main().catch((error) => fail(String(error?.stack ?? error)))
