import { describe, expect, it } from 'vitest'
import {
  MAX_BLOCK_DEPTH,
  blockHeight,
  childLists,
  containersEqual,
  countBlocks,
  findBlock,
  findBlockPath,
  firstSayText,
  fitsDepth,
  flattenBlocks,
  getBlockAt,
  isContainer,
  isInsidePath,
  listOf,
  mapBlocks,
  maxBlockDepth,
  pathKey,
  pathsEqual,
  resolveList,
  splitPath,
  visitTargets,
  walkBlocks,
  type BlockPath
} from '@shared/blockTree'
import { createBlock, createProject, createScene } from '@shared/factory'
import type { Block, Project } from '@shared/model'

const say = (id: string, text: string, characterId: string | null = null): Block => ({
  id,
  type: 'say',
  characterId,
  text,
  voiceAssetId: null
})
const visit = (id: string, sceneId: string | null): Block => ({ id, type: 'visit', sceneId })
const iff = (id: string, then: Block[], otherwise: Block[] = []): Block => ({
  id,
  type: 'if',
  condition: { join: 'and', clauses: [] },
  then,
  otherwise
})
const choice = (id: string, options: { id: string; blocks: Block[] }[]): Block => ({
  id,
  type: 'inlineChoice',
  prompt: null,
  options: options.map((o) => ({ id: o.id, text: o.id, condition: null, blocks: o.blocks }))
})

/**
 * 0 say a
 * 1 if i1       then: [0 say b, 1 choice c1 { o1: [0 say c, 1 visit v1], o2: [] }]   otherwise: [0 say d]
 * 2 say e
 */
function tree(): Block[] {
  return [
    say('a', 'A'),
    iff('i1', [say('b', 'B'), choice('c1', [{ id: 'o1', blocks: [say('c', 'C'), visit('v1', 'S2')] }, { id: 'o2', blocks: [] }])], [say('d', 'D')]),
    say('e', 'E')
  ]
}

describe('block paths', () => {
  it('addresses blocks with steps that carry the branch they go into', () => {
    const t = tree()
    expect(getBlockAt(t, [{ i: 0 }])?.id).toBe('a')
    expect(getBlockAt(t, [{ i: 1, in: 'then' }, { i: 0 }])?.id).toBe('b')
    expect(getBlockAt(t, [{ i: 1, in: 'otherwise' }, { i: 0 }])?.id).toBe('d')
    expect(getBlockAt(t, [{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 1 }])?.id).toBe('v1')
    expect(getBlockAt(t, [{ i: 1, in: 'then' }, { i: 1, in: 'opt:o2' }, { i: 0 }])).toBeUndefined()
    expect(getBlockAt(t, [])).toBeUndefined()
    expect(getBlockAt(t, [{ i: 0, in: 'then' }, { i: 0 }])).toBeUndefined()
    expect(getBlockAt(t, [{ i: 9 }])).toBeUndefined()
  })
  it('resolveList returns the list a container path leads to', () => {
    const t = tree()
    expect(resolveList(t, [])).toBe(t)
    expect(resolveList(t, [{ i: 1, in: 'otherwise' }])?.map((b) => b.id)).toEqual(['d'])
    expect(resolveList(t, [{ i: 1, in: 'then' }, { i: 1, in: 'opt:o2' }])).toEqual([])
    expect(resolveList(t, [{ i: 1 }])).toBeUndefined()
    expect(resolveList(t, [{ i: 1, in: 'opt:nope' }])).toBeUndefined()
  })
  it('splitPath, pathsEqual, containersEqual and pathKey', () => {
    const p: BlockPath = [{ i: 1, in: 'then' }, { i: 0 }]
    expect(splitPath(p)).toEqual({ container: [{ i: 1, in: 'then' }], index: 0 })
    expect(splitPath([])).toEqual({ container: [], index: 0 })
    expect(pathsEqual(p, [{ i: 1, in: 'then' }, { i: 0 }])).toBe(true)
    expect(pathsEqual(p, [{ i: 1, in: 'otherwise' }, { i: 0 }])).toBe(false)
    expect(pathsEqual(p, [{ i: 1, in: 'then' }, { i: 1 }])).toBe(false)
    expect(containersEqual([{ i: 1, in: 'then' }], [{ i: 1, in: 'then' }])).toBe(true)
    expect(containersEqual([{ i: 1, in: 'then' }], [{ i: 1, in: 'otherwise' }])).toBe(false)
    expect(pathKey(p)).toBe('1[then]/0')
    expect(pathKey([{ i: 3 }])).toBe('3')
  })
  it('isInsidePath is true for the block itself and for anything below it', () => {
    const container: BlockPath = [{ i: 1 }]
    expect(isInsidePath([{ i: 1, in: 'then' }, { i: 0 }], container)).toBe(true)
    expect(isInsidePath([{ i: 1 }], container)).toBe(true)
    expect(isInsidePath([{ i: 2 }], container)).toBe(false)
    expect(isInsidePath([{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 0 }], [{ i: 1, in: 'then' }, { i: 1 }])).toBe(true)
    expect(isInsidePath([{ i: 1, in: 'otherwise' }, { i: 0 }], [{ i: 1, in: 'then' }, { i: 0 }])).toBe(false)
    expect(isInsidePath([{ i: 0 }], [])).toBe(false)
  })
})

describe('walkBlocks and friends', () => {
  it('visits every block in reading order with its path, depth, parent and branch', () => {
    const seen: string[] = []
    walkBlocks(tree(), (b, info) => {
      seen.push(`${b.id}@${pathKey(info.path)} d${info.depth} in ${info.parent?.id ?? '-'}/${info.key ?? '-'}`)
    })
    expect(seen).toEqual([
      'a@0 d1 in -/-',
      'i1@1 d1 in -/-',
      'b@1[then]/0 d2 in i1/then',
      'c1@1[then]/1 d2 in i1/then',
      'c@1[then]/1[opt:o1]/0 d3 in c1/opt:o1',
      'v1@1[then]/1[opt:o1]/1 d3 in c1/opt:o1',
      'd@1[otherwise]/0 d2 in i1/otherwise',
      'e@2 d1 in -/-'
    ])
  })
  it('skip leaves a container unvisited inside', () => {
    const seen: string[] = []
    walkBlocks(tree(), (b) => {
      seen.push(b.id)
      if (b.id === 'i1') return 'skip'
      return undefined
    })
    expect(seen).toEqual(['a', 'i1', 'e'])
  })
  it('flattenBlocks gives the order of the rows on screen', () => {
    expect(flattenBlocks(tree()).map((f) => f.block.id)).toEqual(['a', 'i1', 'b', 'c1', 'c', 'v1', 'd', 'e'])
  })
  it('findBlockPath finds blocks at any depth, and null for unknown ids', () => {
    const t = tree()
    expect(findBlockPath(t, 'v1')).toEqual([{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 1 }])
    expect(findBlockPath(t, 'e')).toEqual([{ i: 2 }])
    expect(findBlockPath(t, 'zzz')).toBeNull()
  })
  it('findBlock searches the whole project', () => {
    const p: Project = createProject('T')
    const other = createScene({ x: 0, y: 0 }, 'Other')
    other.blocks = tree()
    p.scenes[other.id] = other
    const hit = findBlock(p, 'c')
    expect(hit?.sceneId).toBe(other.id)
    expect(hit?.block.id).toBe('c')
    expect(hit?.path).toEqual([{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 0 }])
    expect(findBlock(p, 'nope')).toBeNull()
  })
  it('countBlocks counts containers and everything inside', () => {
    expect(countBlocks([])).toBe(0)
    expect(countBlocks(tree())).toBe(8)
  })
  it('firstSayText skips empty lines and looks inside containers', () => {
    expect(firstSayText([])).toBeNull()
    expect(firstSayText([say('x', '  '), iff('i', [say('y', 'Deep', 'anna')])])).toEqual({ characterId: 'anna', text: 'Deep' })
    expect(firstSayText([iff('i', [], [say('y', 'Else')]), say('z', 'Later')])).toEqual({ characterId: null, text: 'Else' })
  })
  it('visitTargets lists visited scenes at any depth, once each', () => {
    expect(visitTargets(tree())).toEqual(['S2'])
    expect(visitTargets([visit('1', 'A'), iff('i', [visit('2', 'B'), visit('3', 'A')]), visit('4', null)])).toEqual(['A', 'B'])
  })
  it('mapBlocks rebuilds nested blocks without touching the input', () => {
    const t = tree()
    const out = mapBlocks(t, (b) => (b.type === 'say' ? { ...b, text: b.text.toLowerCase() } : b))
    expect(firstSayText(out)?.text).toBe('a')
    expect((getBlockAt(out, [{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 0 }]) as { text: string }).text).toBe('c')
    expect((getBlockAt(t, [{ i: 1, in: 'then' }, { i: 1, in: 'opt:o1' }, { i: 0 }]) as { text: string }).text).toBe('C')
    expect(countBlocks(out)).toBe(countBlocks(t))
  })
  it('childLists, listOf and isContainer', () => {
    const t = tree()
    expect(childLists(t[0])).toEqual([])
    expect(childLists(t[1]).map((l) => l.key)).toEqual(['then', 'otherwise'])
    expect(listOf(t[1], 'then')?.length).toBe(2)
    expect(listOf(t[1], 'opt:x')).toBeUndefined()
    expect(isContainer(t[1])).toBe(true)
    expect(isContainer(t[0])).toBe(false)
  })
})

describe('depth', () => {
  it('measures heights: a container needs at least two levels, plus whatever is inside', () => {
    expect(blockHeight(say('a', ''))).toBe(1)
    expect(blockHeight(createBlock('if'))).toBe(2)
    expect(blockHeight(createBlock('inlineChoice'))).toBe(2)
    expect(blockHeight(iff('i', [iff('j', [say('a', '')])]))).toBe(3)
    expect(blockHeight(iff('i', [iff('j', [iff('k', [])])]))).toBe(4)
  })
  it('fitsDepth allows up to MAX_BLOCK_DEPTH levels', () => {
    expect(MAX_BLOCK_DEPTH).toBe(4)
    expect(fitsDepth(4, 1)).toBe(true)
    expect(fitsDepth(5, 1)).toBe(false)
    expect(fitsDepth(3, 2)).toBe(true)
    expect(fitsDepth(4, 2)).toBe(false)
    expect(fitsDepth(1, 4)).toBe(true)
    expect(fitsDepth(1, 5)).toBe(false)
  })
  it('maxBlockDepth is the longest path', () => {
    expect(maxBlockDepth([])).toBe(0)
    expect(maxBlockDepth([say('a', '')])).toBe(1)
    expect(maxBlockDepth(tree())).toBe(3)
  })
  it('walks an unknown block type that carries a plain blocks list', () => {
    const odd = { id: 'x', type: 'future', blocks: [say('y', 'Inside')] } as unknown as Block
    expect(flattenBlocks([odd]).map((f) => f.block.id)).toEqual(['x', 'y'])
    expect(findBlockPath([odd], 'y')).toEqual([{ i: 0, in: 'blocks' }, { i: 0 }])
  })
})
