import type { Block, Id, Project, Scene } from './model'

/**
 * Blocks nest: an If block holds two lists of blocks and an inline Choice block holds one list per option.
 * This file is the one place that knows how to walk, address and measure that tree.
 *
 * ENCODING OF A BLOCK PATH
 * A `BlockPath` addresses one block (or, for insertions, the gap before the block at that index).
 * It is an array of steps. Every step has `i`, the index of a block inside one list.
 * Every step except the last also has `in`, which names the child list of that block that the NEXT step indexes into:
 *   'then' | 'otherwise'  for an If block
 *   'opt:<optionId>'      for an option of an inline Choice block (the option id, not its position, so reordering options keeps paths valid)
 *   'blocks'              any other block type that carries a plain `blocks` list (future container types)
 * The first step indexes `scene.blocks`.
 *   [{ i: 3 }]                              scene.blocks[3]
 *   [{ i: 3, in: 'then' }, { i: 1 }]        scene.blocks[3].then[1]
 *   [{ i: 0, in: 'opt:ab12' }, { i: 2 }]    scene.blocks[0] (inline Choice), option ab12, its block 2
 * An empty path means "the scene itself". The depth of a block is its path length (a top-level block is depth 1).
 */
export type BranchKey = 'then' | 'otherwise' | 'blocks' | `opt:${string}`
export interface PathStep {
  i: number
  in?: BranchKey
}
export type BlockPath = PathStep[]

/** No block may sit deeper than this (a top-level block is depth 1). */
export const MAX_BLOCK_DEPTH = 4
export const DEPTH_ERROR = 'Blocks can only be nested 4 levels deep'

/** The child lists of a block (none for a leaf block). */
export function childLists(block: Block): { key: BranchKey; blocks: Block[] }[] {
  if (block.type === 'if') {
    return [
      { key: 'then', blocks: block.then },
      { key: 'otherwise', blocks: block.otherwise }
    ]
  }
  if (block.type === 'inlineChoice') return block.options.map((o) => ({ key: `opt:${o.id}` as BranchKey, blocks: o.blocks }))
  // A block type this version does not know that carries a plain `blocks` list is walked too ('blocks' key).
  const plain = (block as unknown as { blocks?: unknown }).blocks
  return Array.isArray(plain) ? [{ key: 'blocks', blocks: plain as Block[] }] : []
}

export function isContainer(block: Block): boolean {
  return block.type === 'if' || block.type === 'inlineChoice'
}

/** One child list of a block, or undefined when the block has no such list. */
export function listOf(block: Block, key: BranchKey): Block[] | undefined {
  return childLists(block).find((l) => l.key === key)?.blocks
}

/** Where a block sits: the list that holds it and its index in that list. */
export function splitPath(path: BlockPath): { container: BlockPath; index: number } {
  return { container: path.slice(0, -1), index: path.length === 0 ? 0 : path[path.length - 1].i }
}

/** The list a container path leads to. `[]` is the scene's own list. Every step must carry `in`. */
export function resolveList(root: Block[], container: BlockPath): Block[] | undefined {
  let list = root
  for (const step of container) {
    const block = list[step.i]
    if (!block || step.in === undefined) return undefined
    const next = listOf(block, step.in)
    if (!next) return undefined
    list = next
  }
  return list
}

export function getBlockAt(blocks: Block[], path: BlockPath): Block | undefined {
  if (path.length === 0) return undefined
  const { container, index } = splitPath(path)
  return resolveList(blocks, container)?.[index]
}

/** Same as `getBlockAt`, starting from a scene. */
export function getSceneBlockAt(scene: Scene, path: BlockPath): Block | undefined {
  return getBlockAt(scene.blocks, path)
}

export function pathsEqual(a: BlockPath, b: BlockPath): boolean {
  return a.length === b.length && a.every((s, k) => s.i === b[k].i && (k === a.length - 1 || s.in === b[k].in))
}

/** A short stable text form, e.g. `3[then]/1`. Handy for React keys and test names. */
export function pathKey(path: BlockPath): string {
  return path.map((s) => (s.in === undefined ? String(s.i) : `${s.i}[${s.in}]`)).join('/')
}

/** Whether `path` is `ancestor` itself or lies somewhere inside the block `ancestor` addresses. */
export function isInsidePath(path: BlockPath, ancestor: BlockPath): boolean {
  if (ancestor.length === 0 || path.length < ancestor.length) return false
  for (let k = 0; k < ancestor.length; k++) {
    if (path[k].i !== ancestor[k].i) return false
    if (k < ancestor.length - 1 && path[k].in !== ancestor[k].in) return false
  }
  return true
}

export interface BlockInfo {
  path: BlockPath
  /** Index in `list`. */
  index: number
  /** The list that holds the block. */
  list: Block[]
  /** The container block this one is directly inside, or null at the top level. */
  parent: Block | null
  /** Which list of `parent` holds the block. */
  key: BranchKey | null
  /** Path length: a top-level block is 1. */
  depth: number
}

/**
 * Visit every block in reading order (a container comes before the blocks inside it).
 * The visitor may return 'skip' to leave a container's children unvisited.
 */
export function walkBlocks(blocks: Block[], visit: (block: Block, info: BlockInfo) => void | 'skip'): void {
  const go = (list: Block[], prefix: BlockPath, parent: Block | null, key: BranchKey | null): void => {
    list.forEach((block, index) => {
      const path: BlockPath = [...prefix, { i: index }]
      const result = visit(block, { path, index, list, parent, key, depth: path.length })
      if (result === 'skip') return
      for (const child of childLists(block)) {
        go(child.blocks, [...prefix, { i: index, in: child.key }], block, child.key)
      }
    })
  }
  go(blocks, [], null, null)
}

/** Every block with its path, in reading order (the order the rows appear on screen). */
export function flattenBlocks(blocks: Block[]): { block: Block; path: BlockPath }[] {
  const out: { block: Block; path: BlockPath }[] = []
  walkBlocks(blocks, (block, info) => {
    out.push({ block, path: info.path })
  })
  return out
}

export function findBlockPath(blocks: Block[], id: Id): BlockPath | null {
  let found: BlockPath | null = null
  walkBlocks(blocks, (block, info) => {
    if (found) return 'skip'
    if (block.id === id) {
      found = info.path
      return 'skip'
    }
    return undefined
  })
  return found
}

export interface FoundBlock {
  sceneId: Id
  scene: Scene
  path: BlockPath
  block: Block
}

/** Find a block anywhere in the project by id (block ids are unique project-wide). */
export function findBlock(project: Project, blockId: Id): FoundBlock | null {
  for (const scene of Object.values(project.scenes)) {
    const path = findBlockPath(scene.blocks, blockId)
    if (path) {
      const block = getBlockAt(scene.blocks, path) as Block
      return { sceneId: scene.id, scene, path, block }
    }
  }
  return null
}

/**
 * Rebuild the tree bottom-up: children are mapped first, then `fn` gets the block with its new children.
 * Nothing is mutated; blocks `fn` returns unchanged keep their identity only when none of their children changed.
 */
export function mapBlocks(blocks: Block[], fn: (block: Block) => Block): Block[] {
  return blocks.map((block) => {
    let rebuilt = block
    if (block.type === 'if') {
      rebuilt = { ...block, then: mapBlocks(block.then, fn), otherwise: mapBlocks(block.otherwise, fn) }
    } else if (block.type === 'inlineChoice') {
      rebuilt = { ...block, options: block.options.map((o) => ({ ...o, blocks: mapBlocks(o.blocks, fn) })) }
    }
    return fn(rebuilt)
  })
}

/** Number of blocks including the ones nested inside containers (a container counts as one). */
export function countBlocks(blocks: Block[]): number {
  let n = 0
  walkBlocks(blocks, () => {
    n++
  })
  return n
}

/** The first dialogue line in reading order that has text, or null. */
export function firstSayText(blocks: Block[]): { characterId: Id | null; text: string } | null {
  let found: { characterId: Id | null; text: string } | null = null
  walkBlocks(blocks, (block) => {
    if (found) return 'skip'
    if (block.type === 'say' && block.text.trim() !== '') found = { characterId: block.characterId, text: block.text }
    return undefined
  })
  return found
}

/**
 * How many levels this block needs, counting itself: a plain block is 1. A container is at least 2, because its
 * (possibly empty) areas must always be able to take a block. Placing a block at path length N is allowed when
 * N + height - 1 <= MAX_BLOCK_DEPTH.
 */
export function blockHeight(block: Block): number {
  const lists = childLists(block)
  if (lists.length === 0) return 1
  let tallest = 1
  for (const l of lists) for (const child of l.blocks) tallest = Math.max(tallest, blockHeight(child))
  return 1 + tallest
}

/** Whether a block of `height` fits when its own path would be `pathLength` long. */
export function fitsDepth(pathLength: number, height: number): boolean {
  return pathLength + height - 1 <= MAX_BLOCK_DEPTH
}

/** Longest path of any block in the list (0 for an empty list). */
export function maxBlockDepth(blocks: Block[]): number {
  let deepest = 0
  walkBlocks(blocks, (_, info) => {
    deepest = Math.max(deepest, info.depth)
  })
  return deepest
}

/** Scene ids visited by Visit blocks (at any depth), in reading order, without repeats. Missing scenes are skipped. */
export function visitTargets(blocks: Block[]): Id[] {
  const out: Id[] = []
  walkBlocks(blocks, (block) => {
    if (block.type === 'visit' && block.sceneId !== null && !out.includes(block.sceneId)) out.push(block.sceneId)
  })
  return out
}

/** Two container paths (every step carries `in`) lead to the same list. */
export function containersEqual(a: BlockPath, b: BlockPath): boolean {
  return a.length === b.length && a.every((s, k) => s.i === b[k].i && s.in === b[k].in)
}
