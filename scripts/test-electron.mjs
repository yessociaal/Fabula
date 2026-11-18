// Real-window test: starts the built app (or the packaged one with --packaged), connects over the Chrome DevTools Protocol
// and drives it with real mouse and keyboard events. Everything happens in temp folders; the user's own settings are not touched.
//
//   npm run test:electron                       build, then test out/ with electron.exe
//   node scripts/test-electron.mjs --packaged   test dist/win-unpacked/Fabula.exe (no rebuild)
//   node scripts/test-electron.mjs --no-build   skip the build step
//   SHOT_DIR=<folder> sets where the screenshots go (default: a temp folder)
//
// The native folder dialog cannot be driven, so the app answers it from FABULA_TEST_FOLDER, and only when FABULA_TEST=1 is set
// (see pickFolder in src/main/ipc.ts). Files are added through the hidden file input with DOM.setFileInputFiles.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MOD, findProcessesByCommandLine, killTree, launchApp, readJson, repo, sleep, solidPng, tempDir } from './cdp.mjs'

const argv = process.argv.slice(2)
const packaged = argv.includes('--packaged')
const shotDir = process.env.SHOT_DIR ?? join(tempDir('fabula-shots-'))
mkdirSync(shotDir, { recursive: true })

if (!packaged && !argv.includes('--no-build')) {
  const r = spawnSync('npm run build', { cwd: repo, shell: true, stdio: 'inherit' })
  if (r.status !== 0) {
    console.error('Build failed.')
    process.exit(1)
  }
}

const work = tempDir('fabula-e2e-')
const stories = join(work, 'stories')
mkdirSync(stories)
const png = join(work, 'forest.png')
writeFileSync(png, solidPng(320, 180, [58, 110, 82]))
const TITLE = 'Fabula Test Story'

const results = []
const shots = []
let app = null
let page = null
const gamePids = new Set()

async function step(name, fn) {
  const t0 = Date.now()
  try {
    const detail = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('step took longer than 150 s')), 150000).unref())
    ])
    results.push({ name, ok: true, detail: detail ?? '' })
    console.log(`PASS  ${name}${detail ? `  (${detail})` : ''}  [${Date.now() - t0} ms]`)
    return true
  } catch (e) {
    results.push({ name, ok: false, detail: e.message })
    console.log(`FAIL  ${name}: ${e.message}`)
    try {
      shots.push(await page.screenshot(join(shotDir, `failure-${results.length}.png`)))
    } catch {
      // ignore
    }
    return false
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message)
}
async function shot(name) {
  const f = await page.screenshot(join(shotDir, `${name}.png`))
  shots.push(f)
  return f
}

const storyFile = () => {
  const dir = readdirSync(stories).map((d) => join(stories, d)).find((d) => existsSync(join(d, 'story.fabula.json')))
  return dir ? join(dir, 'story.fabula.json') : null
}
const story = () => readJson(storyFile())
async function waitStory(predicate, label, timeout = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const s = story()
      if (predicate(s)) return s
    } catch {
      // being written
    }
    await sleep(150)
  }
  throw new Error(`Saved story never matched: ${label}`)
}
const sceneByName = (s, name) => Object.values(s.scenes).find((x) => x.name === name)

const nodeCount = () => page.eval(`document.querySelectorAll('.react-flow__node').length`)
const edgeCount = () => page.eval(`document.querySelectorAll('.react-flow__edge').length`)
const nodeRect = (name) =>
  page.eval(`(() => {
    const n = [...document.querySelectorAll('.react-flow__node')].find((x) => x.querySelector('.scene-name')?.textContent.trim() === ${JSON.stringify(name)})
    if (!n) return null
    const r = n.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
  })()`)
async function emptyPane(x, y) {
  return page.eval(`(() => { const e = document.elementFromPoint(${x}, ${y}); return !!e && e.classList.contains('react-flow__pane') })()`)
}
async function clickButton(text, opts = {}) {
  const r = await page.waitRect('button', { text, exact: opts.exact ?? true, within: opts.within ?? null })
  await page.click(r.x, r.y)
  return r
}
async function backToMap() {
  await page.clickSel('.rail-item', { text: 'Story Map' })
  await page.waitFor(`!!document.querySelector('.story-map')`)
  await sleep(300)
}
async function openSceneFromMap(name) {
  const r = await nodeRect(name)
  assert(r, `no card named ${name}`)
  await page.dblclick(r.x, r.top + 60)
  await page.waitFor(`!!document.querySelector('.palette')`)
}

try {
  app = await launchApp({ packaged, env: { FABULA_TEST_FOLDER: stories } })
  page = app.page
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('DOM.enable')
  console.log(`Launched ${packaged ? 'packaged app' : 'electron + repo'} (pid ${app.pid}); screenshots in ${shotDir}`)

  // ---------------------------------------------------------------- 1. Home -> New story
  await step('1. Home shows, New story modal opens', async () => {
    await page.waitFor(`!!document.querySelector('.home')`, { timeout: 30000 })
    await page.waitFor(`document.querySelector('.home-sdk')?.textContent.includes('8.4')`, { label: 'SDK auto-detected', timeout: 10000 })
    await sleep(400)
    await shot('1-home')
    await clickButton('New story')
    await page.waitFor(`!!document.querySelector('.modal')`)
  })

  await step('1. New story: title, location, size, Ren\'Py game, Create', async () => {
    await page.clickSel('.modal input.input')
    await page.selectAllInFocused()
    await page.type(TITLE)
    await clickButton('Choose…')
    await page.waitFor(`document.querySelector('.location-path').textContent.trim() !== 'No folder chosen'`)
    // native <select>: focus it and use the keyboard (a real key press changes the value without opening the popup)
    await page.eval(`document.querySelector('.modal select').focus()`)
    await page.key('ArrowDown')
    const size = await page.eval(`document.querySelector('.modal select').value`)
    assert(size === '1280x720', `size select is ${size}`)
    let checked = await page.eval(`document.querySelector('.modal .check-row input').checked`)
    if (!checked) {
      await page.clickSel('.modal .check-row')
      checked = await page.eval(`document.querySelector('.modal .check-row input').checked`)
    }
    assert(checked, "the 'Also create the Ren'Py game now' box is not ticked")
    await clickButton('Create')
    await page.waitFor(`!!document.querySelector('.shell')`, { timeout: 120000, label: 'shell after Create' })
    const s = await waitStory((x) => x.meta.title === TITLE && x.renpyProjectDir, 'title and game dir saved')
    assert(s.meta.width === 1280, 'screen size not saved')
    assert(existsSync(join(s.renpyProjectDir, 'game', 'script.rpy')), "Ren'Py game was not created")
    return `game: ${s.renpyProjectDir}`
  })

  await step('1b. Window title is the story title', async () => {
    const t = await page.eval('document.title')
    assert(t.includes(TITLE), `document.title is "${t}"`)
    return t
  })

  await step('1c. Kits view lists the built-in Terminal kit (kits folder found)', async () => {
    await page.clickSel('.rail-item', { text: 'Kits' })
    const card = await page.waitRect('.kit-card[data-kit-id="terminal"]', { timeout: 10000 })
    assert(card, 'no Terminal kit card')
    const failed = await page.eval(`!!document.querySelector('.kit-card[data-kit-id="terminal"].kit-failed')`)
    assert(!failed, 'the Terminal kit card shows an error')
    const text = await page.eval(`document.querySelector('.kit-card[data-kit-id="terminal"]').textContent`)
    assert(/Terminal/.test(text) && /Built in/.test(text), `card text: ${text.slice(0, 120)}`)
    await page.clickSel('.rail-item', { text: 'Story Map' })
    await page.waitFor(`!!document.querySelector('.story-map')`)
  })

  await step('1d. ? opens the shortcuts list, Esc closes it', async () => {
    await page.key('?')
    await page.waitFor(`!!document.querySelector('.modal') && document.querySelector('.modal').textContent.includes('Keyboard shortcuts')`)
    await page.key('Escape')
    await page.waitFor(`!document.querySelector('.modal')`)
  })

  // ---------------------------------------------------------------- 2. Story Map
  await step('2. Story map shows the Start scene', async () => {
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 1`)
    // zoom out twice with real clicks so that there is room around the card
    for (let i = 0; i < 2; i++) await page.clickSel('button[aria-label="Zoom out"]')
    // wait until the fit-view animation has finished (the card stops moving)
    let last = ''
    let same = 0
    for (let i = 0; i < 60 && same < 4; i++) {
      const r = await nodeRect('Start')
      const now = r ? `${Math.round(r.left)},${Math.round(r.top)}` : ''
      same = now === last && now !== '' ? same + 1 : 0
      last = now
      await sleep(150)
    }
    assert(same >= 4, 'the Start card never settled')
  })

  let sceneNames = []
  await step('2. Double-click the canvas twice: two new scenes', async () => {
    const start = await nodeRect('Start')
    const canvas = await page.rect('.map-canvas')
    const z = start.width / 240
    const p1 = { x: Math.round(start.right + start.width * 0.8), y: Math.round(start.top + 40 * z) }
    const p2 = { x: Math.round(start.left - start.width * 0.8), y: Math.round(start.top + 40 * z) }
    for (const p of [p1, p2]) {
      assert(p.x < canvas.right - 120 && p.x > canvas.left + 120 && p.y < canvas.bottom - 200, `no room at ${p.x},${p.y}`)
      assert(await emptyPane(p.x, p.y), `${p.x},${p.y} is not empty canvas`)
      await page.dblclick(p.x, p.y)
      await sleep(250)
    }
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 3`)
    const s = await waitStory((x) => Object.keys(x.scenes).length === 3, '3 scenes saved')
    sceneNames = Object.values(s.scenes).map((x) => x.name)
    return sceneNames.join(', ')
  })

  const [, nameB, nameC] = (() => {
    return ['Start', ...sceneNames.filter((n) => n !== 'Start')]
  })()

  await step('2. Drag from an exit dot to a card connects them', async () => {
    const dot = await page.waitRect('.react-flow__node .exit-handle', { text: null })
    const dotStart = await page.eval(`(() => { const n=[...document.querySelectorAll('.react-flow__node')].find(n=>n.textContent.includes('Start')); const h=n.querySelector('.exit-handle'); const r=h.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2} })()`)
    void dot
    const target = await nodeRect(nameB)
    await page.drag(dotStart, { x: target.x, y: target.top + 70 })
    const s = await waitStory((x) => {
      const st = Object.values(x.scenes).find((q) => q.name === 'Start')
      const b = Object.values(x.scenes).find((q) => q.name === nameB)
      return st.ending.type === 'jump' && st.ending.target === b.id
    }, 'Start jumps to the dropped scene')
    void s
    await page.waitFor(`document.querySelectorAll('.react-flow__edge').length >= 1`)
  })

  await step('2. Box-select a throwaway scene, Delete, confirm, Ctrl+Z, Ctrl+Y', async () => {
    const start = await nodeRect('Start')
    const canvas = await page.rect('.map-canvas')
    // empty spot above Start
    const zz = start.width / 240
    const p = { x: Math.round(start.x), y: Math.round(start.top - start.height + 20 * zz - 15) }
    assert(p.y - 20 * zz > canvas.top + 10 && (await emptyPane(p.x, p.y)), `no room for the throwaway scene at ${p.x},${p.y}`)
    await page.dblclick(p.x, p.y)
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 4`)
    await sleep(500)
    const s = await waitStory((x) => Object.keys(x.scenes).length === 4, '4 scenes saved')
    const startScene = sceneByName(s, 'Start')
    const throwaway = Object.values(s.scenes).find((q) => ![startScene.id].includes(q.id) && q.position.y < startScene.position.y)
    assert(throwaway, 'could not find the throwaway scene')
    const card = await page.rect(`.react-flow__node[data-id="${throwaway.id}"]`)
    // shift-drag a box around it, starting on the empty canvas
    const from = { x: card.left - 25, y: card.top - 25 }
    const to = { x: card.right + 25, y: card.bottom + 25 }
    assert(await emptyPane(from.x, from.y), 'box start is not empty canvas')
    await page.keyDown('Shift', MOD.shift)
    await page.drag(from, to, { modifiers: MOD.shift })
    await page.keyUp('Shift')
    await page.waitFor(`document.querySelectorAll('.react-flow__node.selected').length === 1`, { label: 'one card selected by the box' })
    await page.key('Delete')
    await page.waitFor(`!!document.querySelector('.modal')`, { label: 'delete confirm modal' })
    const text = await page.eval(`document.querySelector('.modal').textContent`)
    assert(/Delete this scene\?/.test(text), `modal says: ${text.slice(0, 80)}`)
    await clickButton('Delete', { within: '.modal-footer' })
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 3`, { label: 'card deleted' })
    await page.key('z', { modifiers: MOD.ctrl })
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 4`, { label: 'Ctrl+Z brings it back' })
    await page.key('y', { modifiers: MOD.ctrl })
    await page.waitFor(`document.querySelectorAll('.react-flow__node').length === 3`, { label: 'Ctrl+Y deletes it again' })
    await waitStory((x) => Object.keys(x.scenes).length === 3, 'back to 3 scenes on disk')
  })

  // ---------------------------------------------------------------- 3. Scene editor
  await step('3. Double-click the Start card opens the Scene Editor', async () => {
    const r = await nodeRect('Start')
    await page.dblclick(r.x, r.top + 70)
    await page.waitFor(`!!document.querySelector('.palette')`)
  })

  await step('3. Background: upload a PNG through the hidden file input', async () => {
    await page.clickSel('.palette-item', { text: 'Background' })
    await page.waitFor(`!!document.querySelector('.block-row[data-block-type="background"]')`)
    await page.waitRect('.picker-upload')
    await page.setFiles('input[type=file]', [png])
    await page.waitFor(`document.querySelectorAll('.picker-tile').length >= 3`, { label: 'asset tile appears' })
    const s = await waitStory((x) => Object.keys(x.assets).length === 1, 'asset saved')
    const a = Object.values(s.assets)[0]
    assert(a.width === 320 && a.height === 180, `asset size ${a.width}x${a.height}`)
    const sc = sceneByName(s, 'Start')
    const bg = sc.blocks.find((b) => b.type === 'background')
    assert(bg && bg.assetId === a.id, 'background block does not use the uploaded asset')
  })

  await step('3. Dialogue block: type text', async () => {
    await page.clickSel('.palette-item', { text: 'Dialogue' })
    await page.waitFor(`!!document.querySelector('.block-row[data-block-type="say"] textarea')`)
    await page.clickSel('.block-row[data-block-type="say"] textarea')
    await page.type('You made it. Which way now?')
    await page.clickSel('.block-list', { })
    await waitStory((x) => sceneByName(x, 'Start').blocks.some((b) => b.type === 'say' && b.text === 'You made it. Which way now?'), 'dialogue text saved')
  })

  await step('3. Drag a palette item into the block list (real drag)', async () => {
    const item = await page.waitRect('.palette-item', { text: 'Narration' })
    const row = await page.waitRect('.block-row[data-block-type="background"]')
    await page.drag({ x: item.x, y: item.y }, { x: row.x, y: row.top + 4 }, { steps: 20 })
    const s = await waitStory((x) => sceneByName(x, 'Start').blocks.length === 3, 'a third block appears')
    const blocks = sceneByName(s, 'Start').blocks
    assert(blocks[0].type === 'say' && blocks[0].characterId === null, `first block is ${blocks[0].type}; the dragged narration should be first (order: ${blocks.map((b) => b.type).join(', ')})`)
    return blocks.map((b) => b.type).join(', ')
  })

  await step('3. Choice ending with two options leading to two scenes', async () => {
    await page.clickSel('.seg button', { text: 'Choices', exact: true })
    await page.waitFor(`!!document.querySelector('.ending-panel .prompt-row')`)
    const optionCount = () => page.eval(`document.querySelectorAll('.option-row').length`)
    while ((await optionCount()) < 2) {
      await clickButton('Add choice')
      await sleep(250)
    }
    const texts = ['Take the left path', 'Use the key']
    for (let i = 0; i < 2; i++) {
      await page.clickSel(`input[aria-label="Text of choice ${i + 1}"]`)
      await page.selectAllInFocused()
      await page.type(texts[i])
      await page.key('Enter')
      await sleep(150)
    }
    const names = [nameB, nameC]
    for (let i = 0; i < 2; i++) {
      await page.clickSel(`button[aria-label="Scene for choice ${i + 1}"]`)
      await page.clickSel('[role=option]', { text: names[i], exact: true })
      await sleep(200)
    }
    const s = await waitStory((x) => {
      const e = sceneByName(x, 'Start').ending
      return e.type === 'choice' && e.options.length === 2 && e.options.every((o) => o.target) && e.options[0].text === texts[0] && e.options[1].text === texts[1]
    }, 'choice ending saved with targets')
    const e = sceneByName(s, 'Start').ending
    assert(e.options[0].target === sceneByName(s, nameB).id && e.options[1].target === sceneByName(s, nameC).id, 'targets are not the two scenes')
  })

  await step('3. Screenshot of the Scene Editor', async () => {
    await page.clickSel('.block-row[data-block-type="say"] .row-title')
    await sleep(500)
    await shot('3-scene-editor')
  })

  for (const name of [nameB, nameC]) {
    await step(`3. Scene "${name}" ends the story`, async () => {
      await backToMap()
      await openSceneFromMap(name)
      await page.clickSel('.seg button', { text: 'End of story', exact: true })
      await waitStory((x) => sceneByName(x, name).ending.type === 'end', `${name} ends`)
    })
  }

  await step('3. Story map with arrows (screenshot)', async () => {
    await backToMap()
    await page.clickSel('button[aria-label="Fit the whole story in view"], button[title="Fit the whole story in view"]')
    await sleep(700)
    const edges = await edgeCount()
    assert(edges >= 2, `only ${edges} arrows on the map`)
    await shot('2-story-map')
    return `${edges} arrows`
  })

  // ---------------------------------------------------------------- 4. Quick play
  await step('4. Quick play: advance with real input, pick a choice', async () => {
    await clickButton('Quick play')
    await page.waitFor(`!!document.querySelector('.playtest')`)
    await sleep(500)
    let guard = 0
    while (!(await page.rect('.stage-choice')) && guard++ < 8) {
      if (guard % 2) {
        const w = await page.rect('.playtest-stage-wrap')
        await page.click(w.x, w.y - 40)
      } else await page.key('Space')
      await sleep(450)
    }
    const choices = await page.eval(`[...document.querySelectorAll('.stage-choice')].map(e => e.textContent.trim())`)
    assert(choices.length === 2, `choices shown: ${JSON.stringify(choices)}`)
    await shot('4-quick-play')
    await page.clickSel('.stage-choice', { text: 'Use the key' })
    await page.waitFor(`document.querySelector('[data-testid="current-scene"]')?.textContent.includes(${JSON.stringify(nameC)}) || !!document.querySelector('.playtest-end')`, { label: 'reached the second scene' })
    return `choices: ${choices.join(' | ')}`
  })

  await step('4. Escape closes Quick play', async () => {
    await page.key('Escape')
    await page.waitFor(`!document.querySelector('.playtest')`)
  })

  // ---------------------------------------------------------------- 5. Play in Ren'Py
  let gameDir = null
  await step("5. Export menu: Export to Ren'Py writes a clean game", async () => {
    gameDir = story().renpyProjectDir
    await page.clickSel('.topbar button', { text: 'Export' })
    await page.clickSel('[role=menuitem], .context-item, .context-menu button', { text: "Export to Ren'Py" })
    await page.waitFor(`[...document.querySelectorAll('.toast')].some((t) => t.textContent.startsWith('Exported to'))`, { timeout: 30000, label: 'Exported toast' })
    const script = readFileSync(join(gameDir, 'game', 'script.rpy'), 'utf8')
    assert(/^label start:/m.test(script), 'script.rpy has no start label')
    assert(!/^s*#/m.test(script), 'script.rpy contains a comment')
    assert(!/fabula/i.test(script), 'script.rpy mentions the tool')
    assert(!existsSync(join(gameDir, 'story.fabula.json')) && !existsSync(join(gameDir, 'game', 'story.fabula.json')), 'an editor file is inside the game folder')
  })

  await step("5. Play in Ren'Py: real click, game process appears", async () => {
    await clickButton("Play in Ren'Py")
    let found = []
    const t0 = Date.now()
    while (Date.now() - t0 < 90000) {
      found = findProcessesByCommandLine(gameDir)
      if (found.length > 0) break
      const err = await page.eval(`document.querySelector('.modal')?.textContent ?? ''`)
      assert(!/Traceback|error/i.test(err), `an error dialog appeared: ${err.slice(0, 300)}`)
      await sleep(1000)
    }
    assert(found.length > 0, "no Ren'Py process with the game folder on its command line")
    for (const p of found) gamePids.add(p.pid)
    return found.map((p) => `${p.name}#${p.pid}`).join(', ')
  })

  await step("5. Ren'Py game still running after 10 s, no errors.txt / traceback.txt", async () => {
    await sleep(10000)
    for (const f of ['errors.txt', 'traceback.txt']) assert(!existsSync(join(gameDir, f)), `${f} exists in the game folder`)
    const still = findProcessesByCommandLine(gameDir)
    assert(still.length > 0, "the game process is gone after 10 s")
    for (const p of still) gamePids.add(p.pid)
    const modal = await page.eval(`document.querySelector('.modal')?.textContent ?? ''`)
    assert(modal === '', `a dialog is open: ${modal.slice(0, 200)}`)
    const rpy = readdirSync(join(gameDir, 'game')).filter((f) => f.endsWith('.rpy'))
    return `running; game/ has ${rpy.join(', ')}`
  })

  await step("5. Stop the Ren'Py game by PID", async () => {
    for (const pid of gamePids) killTree(pid)
    await sleep(1500)
    assert(findProcessesByCommandLine(gameDir).length === 0, 'game processes still running')
  })

  await step('7. Closing the window right after an edit saves the story first', async () => {
    // A real window close (WM_CLOSE, what the X button sends), sent by a helper that is already running and waiting for a signal file,
    // so that it arrives well inside the 800 ms autosave delay.
    const signal = join(work, 'close-now')
    const helper = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', 'while (-not (Test-Path -LiteralPath $env:FABULA_SIGNAL)) { Start-Sleep -Milliseconds 15 }; (Get-Process -Id ([int]$env:FABULA_TARGET)).CloseMainWindow() | Out-Null'],
      { env: { ...process.env, FABULA_SIGNAL: signal, FABULA_TARGET: String(app.pid) }, stdio: 'ignore', windowsHide: true }
    )
    try {
      await sleep(1500)
      await page.clickSel('.title-btn')
      await page.selectAllInFocused()
      await page.type('Renamed Story')
      await page.key('Enter')
      writeFileSync(signal, 'go')
      const t = Date.now()
      for (let i = 0; i < 150 && !app.hasExited(); i++) await sleep(100)
      assert(app.hasExited(), 'the app did not quit after the window was closed')
      const s = story()
      assert(s.meta.title === 'Renamed Story', `saved title is "${s.meta.title}"`)
      return `quit ${Date.now() - t} ms after the close request`
    } finally {
      helper.kill()
    }
  })

  // ---------------------------------------------------------------- 6. final screenshots
  await step('6. Screenshots written', async () => {
    return shots.map((s) => s).join('; ')
  })
} catch (e) {
  results.push({ name: 'fatal', ok: false, detail: e.stack ?? e.message })
  console.log(`FATAL ${e.stack ?? e.message}`)
} finally {
  for (const pid of gamePids) killTree(pid)
  if (app) app.close()
  await sleep(500)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} steps passed. Screenshots: ${shots.join(', ')}`)
console.log(`Temp folder: ${work}`)
if (failed.length) {
  console.log('Failed:')
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`)
  process.exit(1)
}
