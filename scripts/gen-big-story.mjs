// Generates a large test story for the performance check (not shipped with the app).
//   node scripts/gen-big-story.mjs <folder> [sceneCount=300] [bigSceneBlocks=200]
// Writes <folder>/story.fabula.json: `sceneCount` scenes in a grid (chapters, dialogue, choices, jumps and an end scene),
// plus one extra scene named "Big scene" with `bigSceneBlocks` blocks.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { bundle } from './lib.mjs'

const dir = resolve(process.argv[2] ?? join(tmpdir(), 'fabula-big-story'))
const count = Number(process.argv[3] ?? 300)
const bigBlocks = Number(process.argv[4] ?? 200)

const { f } = await bundle({ f: 'src/shared/factory.ts' }, join(tmpdir(), 'fabula-gen-bundle'))
const project = f.createProject('Big story')
project.scenes = {}
const hero = f.createCharacter('Anna', '#e86a92')
project.characters[hero.id] = hero
project.characterOrder.push(hero.id)
const chapters = ['#7c9cff', '#5fd08a', '#f2b84b', '#ff8a65'].map((color, i) => f.createChapter(`Part ${i + 1}`, color))
for (const c of chapters) {
  project.chapters[c.id] = c
  project.chapterOrder.push(c.id)
}

const COLS = 20
const scenes = []
for (let i = 0; i < count; i++) {
  const s = f.createScene({ x: (i % COLS) * 320, y: Math.floor(i / COLS) * 260 }, `Scene ${i + 1}`)
  s.chapterId = chapters[Math.floor((i / count) * chapters.length)].id
  for (let k = 0; k < 3; k++) {
    const b = f.createBlock('say')
    b.characterId = k % 2 === 0 ? hero.id : null
    b.text = `Line ${k + 1} of scene ${i + 1}. The path goes on.`
    s.blocks.push(b)
  }
  scenes.push(s)
}
scenes.forEach((s, i) => {
  const next = scenes[i + 1]
  const skip = scenes[Math.min(i + COLS, scenes.length - 1)]
  if (i === scenes.length - 1) s.ending = { type: 'end' }
  else if (i % 3 === 0) {
    const a = f.createOption('Go on')
    a.target = next.id
    const b = f.createOption('Take the shortcut')
    b.target = skip.id
    s.ending = { type: 'choice', prompt: null, options: [a, b] }
  } else s.ending = { type: 'jump', target: next.id }
})

const big = f.createScene({ x: -400, y: 0 }, 'Big scene')
for (let i = 0; i < bigBlocks; i++) {
  const b = f.createBlock(i % 10 === 9 ? 'pause' : i % 7 === 6 ? 'transition' : 'say')
  if (b.type === 'say') {
    b.characterId = i % 2 === 0 ? hero.id : null
    b.text = `Block ${i + 1}: a line of dialogue that is long enough to take a little room in the row.`
  }
  big.blocks.push(b)
}
big.ending = { type: 'end' }
for (const s of [...scenes, big]) project.scenes[s.id] = s
project.startSceneId = scenes[0].id

mkdirSync(join(dir, 'assets'), { recursive: true })
writeFileSync(join(dir, 'story.fabula.json'), JSON.stringify(project, null, 2) + '\n')
console.log(`Wrote ${dir}\\story.fabula.json: ${count} scenes + "Big scene" with ${bigBlocks} blocks`)
