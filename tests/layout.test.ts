import { describe, expect, it } from 'vitest'
import { createCase, createOption, createProject, createScene } from '@shared/factory'
import type { Id, Project, Scene } from '@shared/model'
import { CARD_WIDTH, COLUMN_GAP, ROW_GAP, cardHeight, distancesFromStart, sceneCardHeight, tidyLayout } from '../src/renderer/views/StoryMap/layout'

function add(p: Project, name: string, x = 0, y = 0): Scene {
  const s = createScene({ x, y }, name)
  p.scenes[s.id] = s
  return s
}
const COL = CARD_WIDTH + COLUMN_GAP

/** start -> (A, B via a choice); A -> C; B -> C; D is not connected to anything. */
function story(): { p: Project; ids: Record<string, Id> } {
  const p = createProject('T')
  const start = p.scenes[p.startSceneId as Id]
  const a = add(p, 'A', 500, 500)
  const b = add(p, 'B', 100, 900)
  const c = add(p, 'C', 3, 3)
  const d = add(p, 'D', 700, 10)
  const oa = createOption('go a')
  oa.target = a.id
  const ob = createOption('go b')
  ob.target = b.id
  start.ending = { type: 'choice', prompt: null, options: [oa, ob] }
  a.ending = { type: 'jump', target: c.id }
  b.ending = { type: 'jump', target: c.id }
  c.ending = { type: 'end' }
  return { p, ids: { start: start.id, a: a.id, b: b.id, c: c.id, d: d.id } }
}

describe('cardHeight', () => {
  it('grows with the exit count and never goes below one row', () => {
    expect(cardHeight(0)).toBe(cardHeight(1))
    expect(cardHeight(3) - cardHeight(2)).toBe(26)
    expect(cardHeight(1)).toBe(178)
  })
})

describe('distancesFromStart', () => {
  it('uses shortest paths and omits unreachable scenes', () => {
    const { p, ids } = story()
    const d = distancesFromStart(p)
    expect(d.get(ids.start)).toBe(0)
    expect(d.get(ids.a)).toBe(1)
    expect(d.get(ids.c)).toBe(2)
    expect(d.has(ids.d)).toBe(false)
  })
  it('is empty without a start scene', () => {
    const { p } = story()
    p.startSceneId = null
    expect(distancesFromStart(p).size).toBe(0)
  })
})

describe('tidyLayout', () => {
  it('puts each scene in the column of its shortest path length and unreachable scenes in a last column', () => {
    const { p, ids } = story()
    const l = tidyLayout(p)
    expect(l[ids.start].x).toBe(0)
    expect(l[ids.a].x).toBe(COL)
    expect(l[ids.b].x).toBe(COL)
    expect(l[ids.c].x).toBe(2 * COL)
    expect(l[ids.d].x).toBe(3 * COL)
  })

  it('shortest path wins when a scene can be reached two ways', () => {
    const { p, ids } = story()
    const o = createOption('shortcut')
    o.target = ids.c
    const e = p.scenes[ids.start].ending
    if (e.type === 'choice') e.options.push(o)
    expect(tidyLayout(p)[ids.c].x).toBe(COL)
  })

  it('stacks rows ROW_GAP apart using the real card heights, starting at y = 0', () => {
    const { p, ids } = story()
    const l = tidyLayout(p)
    expect(l[ids.start].y).toBe(0)
    const first = l[ids.a].y
    const second = l[ids.b].y
    expect(Math.min(first, second)).toBe(0)
    const upper = first < second ? ids.a : ids.b
    expect(Math.max(first, second)).toBe(sceneCardHeight(p.scenes[upper], p) + ROW_GAP)
  })

  it('has no overlapping cards, including tall cards with many exits', () => {
    const { p, ids } = story()
    const c = createCase()
    c.target = ids.a
    p.scenes[ids.c].ending = { type: 'branch', cases: [c, createCase(), createCase(), createCase()], elseTarget: ids.b }
    for (let i = 0; i < 6; i++) add(p, `extra ${i}`, i, i)
    const l = tidyLayout(p)
    const boxes = Object.values(p.scenes).map((s) => ({ x: l[s.id].x, y: l[s.id].y, w: CARD_WIDTH, h: sceneCardHeight(s, p) }))
    expect(boxes).toHaveLength(Object.keys(p.scenes).length)
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap).toBe(false)
      }
    }
  })

  it('orders unreachable scenes by their current position and is deterministic', () => {
    const { p, ids } = story()
    const e = add(p, 'E', 5, 5)
    const first = tidyLayout(p)
    expect(first[e.id].y).toBe(0)
    expect(first[ids.d].y).toBe(sceneCardHeight(e, p) + ROW_GAP)
    expect(tidyLayout(JSON.parse(JSON.stringify(p)) as Project)).toEqual(first)
    expect(tidyLayout(p)).toEqual(first)
  })

  it('puts everything in column 0 when there is no start scene', () => {
    const { p } = story()
    p.startSceneId = null
    const xs = new Set(Object.values(tidyLayout(p)).map((q) => q.x))
    expect([...xs]).toEqual([0])
  })
})
