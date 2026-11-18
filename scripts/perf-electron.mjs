// Performance check in the real window (not part of the test gate). Opens a generated 300-scene story (scripts/gen-big-story.mjs)
// and measures frame times while panning and zooming the map, and responsiveness of a scene with 200 blocks.
//   node scripts/perf-electron.mjs [--packaged]      (build first: npm run build)
// Frame times come from requestAnimationFrame inside the page; long tasks from a PerformanceObserver.
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { launchApp, sleep, tempDir } from './cdp.mjs'

const packaged = process.argv.includes('--packaged')
const root = tempDir('fabula-perf-')
const storyDir = join(root, 'Big story')
const gen = spawnSync(process.execPath, [join(import.meta.dirname, 'gen-big-story.mjs'), storyDir, '300', '200'], { encoding: 'utf8' })
if (gen.status !== 0) {
  console.error(gen.stderr || gen.stdout)
  process.exit(1)
}
console.log(gen.stdout.trim())

const app = await launchApp({ packaged, env: { FABULA_TEST_FOLDER: storyDir } })
const page = app.page
await page.send('Page.enable')
await page.send('Runtime.enable')

const RECORDER = `(() => {
  window.__rec = { on: false, frames: [], long: [], last: 0 }
  const tick = (t) => {
    const r = window.__rec
    if (r.on) { if (r.last) r.frames.push(t - r.last); r.last = t }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try { new PerformanceObserver((l) => { if (window.__rec.on) for (const e of l.getEntries()) window.__rec.long.push(e.duration) }).observe({ entryTypes: ['longtask'] }) } catch {}
})()`
const startRec = () => page.eval(`(() => { const r = window.__rec; r.frames = []; r.long = []; r.last = 0; r.on = true })()`)
const stopRec = () =>
  page.eval(`(() => {
    const r = window.__rec; r.on = false
    const f = [...r.frames].sort((a, b) => a - b)
    const pct = (p) => f.length ? f[Math.min(f.length - 1, Math.floor(f.length * p))] : 0
    return { frames: f.length, avg: f.length ? f.reduce((a, b) => a + b, 0) / f.length : 0, p95: pct(0.95), max: f.length ? f[f.length - 1] : 0,
             over50: f.filter((x) => x > 50).length, over100: f.filter((x) => x > 100).length, longTasks: r.long.length, longMax: r.long.length ? Math.max(...r.long) : 0 }
  })()`)
const fmt = (s) => `frames=${s.frames} avg=${s.avg.toFixed(1)}ms p95=${s.p95.toFixed(1)}ms max=${s.max.toFixed(1)}ms >50ms=${s.over50} >100ms=${s.over100} longTasks=${s.longTasks} (max ${s.longMax.toFixed(0)}ms)`

const report = {}
try {
  await page.waitFor(`!!document.querySelector('.home')`, { timeout: 30000 })
  await page.eval(RECORDER)

  // ----- open the story -----
  const t0 = Date.now()
  const open = await page.waitRect('button', { text: 'Open story…', exact: true })
  await startRec()
  await page.click(open.x, open.y)
  await page.waitFor(`document.querySelectorAll('.react-flow__node').length >= 300`, { timeout: 60000, label: '300 cards on the map' })
  report.openMs = Date.now() - t0
  console.log(`open story -> 300 cards in the DOM: ${report.openMs} ms`)
  await sleep(1500)
  report.openFrames = await stopRec()
  console.log(`while opening: ${fmt(report.openFrames)}`)
  if (process.env.SHOT_DIR) console.log(`screenshot: ${await page.screenshot(join(process.env.SHOT_DIR, 'perf-open.png'))}`)

  // ----- pan (real mouse drags on the empty canvas) and zoom (wheel), first as opened, then with everything in view -----
  const canvas = await page.rect('.map-canvas')
  const viewport = () => page.eval(`document.querySelector('.react-flow__viewport').style.transform`)
  const mapRuns = {}
  for (const view of ['as opened', 'whole story in view']) {
    if (view !== 'as opened') {
      await page.clickSel('button[aria-label="Fit the whole story in view"]')
      await sleep(900)
    }
    const spots = []
    for (let y = canvas.top + 12; y < canvas.bottom - 12; y += 24) for (const x of [canvas.left + 10, canvas.right - 10]) spots.push({ x, y })
    let from = null
    for (const spot of spots) {
      if (await page.eval(`document.elementFromPoint(${spot.x}, ${spot.y})?.classList.contains('react-flow__pane')`)) {
        from = spot
        break
      }
    }
    if (!from) throw new Error('no empty canvas point to start a pan from')
    const v0 = await viewport()
    await startRec()
    for (let round = 0; round < 3; round++) {
      const dx = (round % 2 === 0 ? -1 : 1) * 260
      await page.drag(from, { x: from.x + dx, y: from.y + 140 }, { steps: 60, stepDelay: 16 })
      await page.drag({ x: from.x + dx, y: from.y + 140 }, from, { steps: 60, stepDelay: 16 })
    }
    const pan = await stopRec()
    const mid = { x: Math.round((canvas.left + canvas.right) / 2), y: Math.round((canvas.top + canvas.bottom) / 2) }
    await startRec()
    for (const deltaY of [100, -100]) {
      for (let i = 0; i < 30; i++) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: mid.x, y: mid.y, deltaX: 0, deltaY, modifiers: 0 })
        await sleep(16)
      }
    }
    const zoom = await stopRec()
    mapRuns[view] = { pan, zoom, viewport: v0 }
    console.log(`[${view}] viewport ${v0}`)
    console.log(`[${view}] pan (6 drags, 360 mouse moves): ${fmt(pan)}`)
    console.log(`[${view}] zoom (60 wheel ticks): ${fmt(zoom)}`)
  }
  report.map = mapRuns

  // ----- drag one card (every move rewrites the story, which also re-checks it for problems) -----
  await page.clickSel('input[aria-label="Search scenes"]')
  await page.type('Scene 150')
  await page.key('Enter')
  await sleep(900)
  await page.key('Escape')
  const head = await page.eval(`(() => { const n=[...document.querySelectorAll('.react-flow__node')].find(x=>x.querySelector('.scene-name')?.textContent.trim()==='Scene 150'); const r=n.querySelector('.scene-header').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2} })()`)
  await startRec()
  await page.drag(head, { x: head.x + 220, y: head.y + 120 }, { steps: 60, stepDelay: 16 })
  await page.drag({ x: head.x + 220, y: head.y + 120 }, head, { steps: 60, stepDelay: 16 })
  report.nodeDrag = await stopRec()
  console.log(`drag one card (120 moves): ${fmt(report.nodeDrag)}`)

  // ----- scene with 200 blocks -----
  await page.clickSel('input[aria-label="Search scenes"]')
  await page.type('Big scene')
  await page.key('Enter')
  await sleep(700)
  const card = await page.eval(`(() => { const n=[...document.querySelectorAll('.react-flow__node')].find(x=>x.querySelector('.scene-name')?.textContent.trim()==='Big scene'); if(!n) return null; const r=n.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+60} })()`)
  if (!card) throw new Error('Big scene card not found')
  const t1 = Date.now()
  await page.dblclick(card.x, card.y)
  await page.waitFor(`document.querySelectorAll('.block-row').length >= 200`, { timeout: 30000, label: '200 block rows' })
  report.openSceneMs = Date.now() - t1
  console.log(`open Big scene -> 200 rows in the DOM: ${report.openSceneMs} ms`)
  await sleep(800)

  // keyboard: select the first block, then 60 x Down
  const first = await page.rect('.block-row .row-title')
  await page.click(first.x, first.y)
  await startRec()
  for (let i = 0; i < 60; i++) {
    await page.key('ArrowDown')
    await sleep(16)
  }
  report.keys = await stopRec()
  console.log(`60 x Down arrow through blocks: ${fmt(report.keys)}`)

  // wheel scroll in the list
  const list = await page.rect('.block-list')
  await startRec()
  for (let i = 0; i < 60; i++) {
    await page.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: list.x, y: list.y, deltaX: 0, deltaY: 160, modifiers: 0 })
    await sleep(16)
  }
  report.scroll = await stopRec()
  console.log(`list scroll (60 wheel ticks): ${fmt(report.scroll)}`)

  // typing into a dialogue row in the middle of the list
  const rows = await page.eval(`document.querySelectorAll('.block-row[data-block-type="say"] textarea').length`)
  const target = await page.rect('.block-row[data-block-type="say"] textarea', { index: Math.min(rows - 1, 20) })
  await page.click(target.x, target.y)
  const times = []
  await startRec()
  for (const ch of 'Typing into one of two hundred blocks') {
    const t = Date.now()
    await page.type(ch)
    await page.eval('new Promise((r) => requestAnimationFrame(() => r(1)))')
    times.push(Date.now() - t)
    await sleep(10)
  }
  report.typing = await stopRec()
  times.sort((a, b) => a - b)
  report.typingKeyMs = { median: times[Math.floor(times.length / 2)], max: times[times.length - 1] }
  console.log(`typing (${times.length} chars): ${fmt(report.typing)}; key -> next frame median ${report.typingKeyMs.median} ms, max ${report.typingKeyMs.max} ms`)
} catch (e) {
  console.error(`FAILED: ${e.stack ?? e.message}`)
  process.exitCode = 1
} finally {
  app.close()
  await sleep(300)
}
console.log(JSON.stringify(report))
