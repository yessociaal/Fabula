import { describe, expect, it } from 'vitest'
import { deriveEdges, listExits, setExitTarget } from '@shared/edges'
import { createCase, createCondition, createOption, createProject, createScene } from '@shared/factory'
import type { Project, Scene } from '@shared/model'

function setup(): { p: Project; a: Scene; b: Scene; c: Scene } {
  const p = createProject('T')
  const a = p.scenes[p.startSceneId!]
  const b = createScene({ x: 100, y: 0 }, 'B')
  const c = createScene({ x: 200, y: 0 }, 'C')
  p.scenes[b.id] = b
  p.scenes[c.id] = c
  return { p, a, b, c }
}

describe('deriveEdges', () => {
  it('jump', () => {
    const { p, a, b } = setup()
    expect(deriveEdges(p)).toEqual([])
    a.ending = { type: 'jump', target: b.id }
    expect(deriveEdges(p)).toEqual([
      { id: `${a.id}:jump`, source: a.id, handle: 'jump', target: b.id, label: 'Then', conditional: false }
    ])
  })

  it('choice: one edge per option, conditional flagged', () => {
    const { p, a, b, c } = setup()
    const o1 = createOption('Left')
    o1.target = b.id
    const o2 = createOption('Key')
    o2.target = c.id
    o2.condition = createCondition()
    const o3 = createOption('Nowhere')
    a.ending = { type: 'choice', prompt: null, options: [o1, o2, o3] }
    const edges = deriveEdges(p)
    expect(edges.map((e) => e.handle)).toEqual([`opt:${o1.id}`, `opt:${o2.id}`])
    expect(edges.map((e) => e.conditional)).toEqual([false, true])
    expect(edges.map((e) => e.label)).toEqual(['Left', 'Key'])
    expect(listExits(a).map((x) => x.handleId)).toEqual([`opt:${o1.id}`, `opt:${o2.id}`, `opt:${o3.id}`])
  })

  it('branch: cases then else', () => {
    const { p, a, b, c } = setup()
    const k = createCase()
    k.target = b.id
    a.ending = { type: 'branch', cases: [k], elseTarget: c.id }
    expect(deriveEdges(p).map((e) => e.handle)).toEqual([`case:${k.id}`, 'else'])
    expect(listExits(a).map((x) => x.handleId)).toEqual([`case:${k.id}`, 'else'])
  })

  it('end has no exits or edges', () => {
    const { p, a } = setup()
    a.ending = { type: 'end' }
    expect(listExits(a)).toEqual([])
    expect(deriveEdges(p)).toEqual([])
  })

  it('code and kit endings use x:<id>', () => {
    const { p, a, b } = setup()
    a.ending = {
      type: 'code',
      code: '',
      exits: [
        { id: 'e1', name: 'go', target: b.id },
        { id: 'e2', name: 'no', target: null }
      ]
    }
    expect(listExits(a).map((x) => x.handleId)).toEqual(['x:e1', 'x:e2'])
    expect(deriveEdges(p).map((e) => e.handle)).toEqual(['x:e1'])
    a.ending = { type: 'kit', kitId: 'k', endingType: 't', params: {}, exits: [{ id: 'e3', name: 'z', target: b.id }] }
    expect(deriveEdges(p).map((e) => e.handle)).toEqual(['x:e3'])
  })

  it('screen ending lists leave elements', () => {
    const { p, a, b } = setup()
    p.screens['s1'] = {
      id: 's1',
      name: 'Desk',
      modal: true,
      elements: [
        { id: 'el1', name: 'drawer', type: 'hotspot', x: 0, y: 0, w: 1, h: 1, action: { type: 'leave' } },
        { id: 'el2', name: 'img', type: 'image', x: 0, y: 0, w: 1, h: 1, assetId: null },
        { id: 'el3', name: 'btn', type: 'button', x: 0, y: 0, w: 1, h: 1, text: 'x', action: { type: 'hideThis' } }
      ]
    }
    a.ending = { type: 'screen', screenId: 's1', targets: { el1: b.id } }
    expect(listExits(a, p).map((x) => x.handleId)).toEqual(['x:el1'])
    expect(deriveEdges(p).map((e) => e.handle)).toEqual(['x:el1'])
  })

  it('skips edges to missing scenes', () => {
    const { p, a } = setup()
    a.ending = { type: 'jump', target: 'ghost' }
    expect(deriveEdges(p)).toEqual([])
  })

  it('visit blocks are not edges', () => {
    const { p, a, b } = setup()
    a.blocks.push({ id: 'v', type: 'visit', sceneId: b.id })
    expect(deriveEdges(p)).toEqual([])
  })
})

describe('setExitTarget', () => {
  it('sets every handle kind and rejects unknown ones', () => {
    const { a, b } = setup()
    expect(setExitTarget(a, 'jump', b.id)).toBe(true)
    expect(a.ending).toEqual({ type: 'jump', target: b.id })
    expect(setExitTarget(a, 'else', b.id)).toBe(false)
    const o = createOption('x')
    const k = createCase()
    a.ending = { type: 'choice', prompt: null, options: [o] }
    expect(setExitTarget(a, `opt:${o.id}`, b.id)).toBe(true)
    expect(setExitTarget(a, 'opt:nope', b.id)).toBe(false)
    a.ending = { type: 'branch', cases: [k], elseTarget: null }
    expect(setExitTarget(a, `case:${k.id}`, b.id)).toBe(true)
    expect(setExitTarget(a, 'else', b.id)).toBe(true)
    expect(a.ending).toMatchObject({ elseTarget: b.id })
    a.ending = { type: 'code', code: '', exits: [{ id: 'e1', name: 'go', target: null }] }
    expect(setExitTarget(a, 'x:e1', b.id)).toBe(true)
    expect(setExitTarget(a, 'x:zz', b.id)).toBe(false)
    a.ending = { type: 'screen', screenId: null, targets: {} }
    expect(setExitTarget(a, 'x:el9', b.id)).toBe(true)
    expect(a.ending).toMatchObject({ targets: { el9: b.id } })
    a.ending = { type: 'end' }
    expect(setExitTarget(a, 'jump', b.id)).toBe(false)
  })
})
