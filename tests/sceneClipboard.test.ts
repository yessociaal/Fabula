import { beforeEach, describe, expect, it } from 'vitest'
import { createBlock, createCase, createOption, createProject, createScene } from '@shared/factory'
import { listExits } from '@shared/edges'
import { copyScenes, pasteScenes } from '@shared/sceneClipboard'
import type { Project, Scene } from '@shared/model'
import { useProjectStore } from '../src/renderer/store/projectStore'

function add(p: Project, name: string): Scene {
  const s = createScene({ x: 10, y: 20 }, name)
  p.scenes[s.id] = s
  return s
}

describe('copy / paste scenes', () => {
  let p: Project
  let a: Scene
  let b: Scene
  let outside: Scene
  beforeEach(() => {
    p = createProject('T')
    a = add(p, 'A')
    b = add(p, 'B')
    outside = add(p, 'Outside')
    const o1 = createOption('to b')
    o1.target = b.id
    const o2 = createOption('to outside')
    o2.target = outside.id
    a.ending = { type: 'choice', prompt: null, options: [o1, o2] }
    const c = createCase()
    c.target = a.id
    b.ending = { type: 'branch', cases: [c], elseTarget: outside.id }
    a.blocks.push(createBlock('say'))
  })

  it('copies deeply (later edits do not leak into the clipboard)', () => {
    const clip = copyScenes(p, [a.id])
    a.name = 'changed'
    expect(clip.scenes[0].name).toBe('A')
    expect(copyScenes(p, ['nope']).scenes).toEqual([])
  })

  it('remaps every id with fresh ones and offsets positions', () => {
    const out = pasteScenes(copyScenes(p, [a.id, b.id]), { x: 40, y: 40 })
    expect(out).toHaveLength(2)
    const old = new Set<string>([a.id, b.id, a.blocks[0].id])
    for (const s of out) {
      expect(old.has(s.id)).toBe(false)
      if (s.blocks[0]) expect(old.has(s.blocks[0].id)).toBe(false)
      expect(s.position).toEqual({ x: 50, y: 60 })
    }
    expect(new Set(out.map((s) => s.id)).size).toBe(2)
  })

  it('keeps arrows between copied scenes (pointing at the copies) and nulls arrows leaving the set', () => {
    const [na, nb] = pasteScenes(copyScenes(p, [a.id, b.id]), { x: 40, y: 40 })
    const aExits = listExits(na)
    expect(aExits[0].target).toBe(nb.id)
    expect(aExits[1].target).toBeNull()
    const bExits = listExits(nb)
    expect(bExits[0].target).toBe(na.id)
    expect(bExits[1].target).toBeNull()
    expect(aExits[0].handleId).not.toBe(listExits(a)[0].handleId)
  })

  it('a single copied scene loses every outside arrow', () => {
    const [na] = pasteScenes(copyScenes(p, [a.id]), { x: 40, y: 40 })
    expect(listExits(na).map((x) => x.target)).toEqual([null, null])
  })

  it('does not copy a label lock or splashscreen role, and drops chapters that do not exist', () => {
    a.labelLock = 'mine'
    a.role = 'splashscreen'
    a.chapterId = 'gone'
    const [na] = pasteScenes(copyScenes(p, [a.id]), { x: 0, y: 0 }, new Set())
    expect(na.labelLock).toBeNull()
    expect(na.role).toBe('normal')
    expect(na.chapterId).toBeNull()
  })

  it('store.addScenes adds them as one undo step and leaves the originals untouched', () => {
    useProjectStore.getState().loadProject('C:/x', p)
    const pasted = pasteScenes(copyScenes(p, [a.id, b.id]), { x: 40, y: 40 })
    const before = Object.keys(useProjectStore.getState().project!.scenes).length
    const ids = useProjectStore.getState().addScenes(pasted)
    expect(ids).toHaveLength(2)
    const after = useProjectStore.getState().project!
    expect(Object.keys(after.scenes)).toHaveLength(before + 2)
    expect(after.scenes[a.id].name).toBe('A')
    useProjectStore.temporal.getState().undo()
    expect(Object.keys(useProjectStore.getState().project!.scenes)).toHaveLength(before)
    useProjectStore.temporal.getState().redo()
    expect(Object.keys(useProjectStore.getState().project!.scenes)).toHaveLength(before + 2)
  })
})
