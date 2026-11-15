import type { Block, Id, Project, Scene } from './model'
import { cloneWithNewIds, newId } from './factory'
import { listExits, setExitTarget } from './edges'

export interface SceneClipboard {
  scenes: Scene[]
}

function walkBlocks(blocks: Block[], fn: (b: Block) => void): void {
  for (const b of blocks) {
    fn(b)
    if (b.type === 'if') {
      walkBlocks(b.then, fn)
      walkBlocks(b.otherwise, fn)
    } else if (b.type === 'inlineChoice') {
      for (const o of b.options) walkBlocks(o.blocks, fn)
    }
  }
}

/** Deep copy of the chosen scenes (in the given order; unknown ids are ignored). */
export function copyScenes(project: Project, ids: Id[]): SceneClipboard {
  const scenes: Scene[] = []
  for (const id of ids) {
    const s = project.scenes[id]
    if (s) scenes.push(JSON.parse(JSON.stringify(s)) as Scene)
  }
  return { scenes }
}

/**
 * Fresh scenes ready to add to a project. Every id is new (scenes, blocks, options, cases...).
 * Arrows between copied scenes are kept and point at the new copies; arrows (and Visit blocks)
 * leaving the copied set become empty. Positions move by `offset`. The start role and label lock are not copied.
 */
export function pasteScenes(clip: SceneClipboard, offset: { x: number; y: number }, existingChapterIds?: ReadonlySet<Id>): Scene[] {
  const idMap = new Map<Id, Id>()
  for (const s of clip.scenes) idMap.set(s.id, newId())
  const out: Scene[] = []
  for (const original of clip.scenes) {
    const copy = cloneWithNewIds(JSON.parse(JSON.stringify(original)) as Scene)
    copy.id = idMap.get(original.id) as Id
    copy.position = { x: original.position.x + offset.x, y: original.position.y + offset.y }
    copy.labelLock = null
    copy.role = 'normal'
    if (copy.chapterId !== null && existingChapterIds && !existingChapterIds.has(copy.chapterId)) copy.chapterId = null
    for (const x of listExits(copy)) {
      if (x.target === null) continue
      setExitTarget(copy, x.handleId, idMap.get(x.target) ?? null)
    }
    walkBlocks(copy.blocks, (b) => {
      if (b.type === 'visit' && b.sceneId !== null) b.sceneId = idMap.get(b.sceneId) ?? null
    })
    out.push(copy)
  }
  return out
}
