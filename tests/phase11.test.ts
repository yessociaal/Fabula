import { beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { deriveVisitEdges, deriveEdges, sceneSuccessors } from '@shared/edges'
import {
  createAsset,
  createBlock,
  createCharacter,
  createClause,
  createCondition,
  createExpression,
  createInlineOption,
  createOption,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import { NOWHERE_NOTICE, start, step, type PlayState } from '@shared/interpreter'
import type { Block, Condition, Id, Project, Scene } from '@shared/model'
import { blockSchema, parseProject } from '@shared/schema'
import { appliedBlocks, computeStage, computeStageAt } from '@shared/stage'
import { sceneSetsBackgroundAt } from '@shared/stageView'
import { findUsage } from '@shared/usage'
import { validateProject } from '@shared/validate'
import { DEPTH_ERROR, findBlockPath, getBlockAt, type BlockPath } from '@shared/blockTree'
import { distancesFromStart, tidyLayout } from '../src/renderer/views/StoryMap/layout'
import { countArrowsInto, matchingSceneIds, sceneCardInfo, sceneMatches } from '../src/renderer/views/StoryMap/mapModel'
import {
  areaId,
  insertionAfter,
  insertionIntoArea,
  neighbourId,
  resolveDrop,
  selectionAfterDeleteAt,
  siblingMoveTarget,
  speakerBeforeBlock
} from '../src/renderer/views/SceneEditor/editorHelpers'
import { summarizeBlock } from '../src/renderer/views/SceneEditor/blockSummaries'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'

type Of<T extends Block['type']> = Extract<Block, { type: T }>

const say = (text: string, characterId: string | null = null, id?: string): Block => ({
  ...(createBlock('say') as Of<'say'>),
  ...(id ? { id } : {}),
  characterId,
  text
})
const visit = (sceneId: string | null, id?: string): Block => ({ ...(createBlock('visit') as Of<'visit'>), ...(id ? { id } : {}), sceneId })
const when = (variableId: string | null, op: 'eq' | 'gte' = 'eq', value: boolean | number = true): Condition => ({
  join: 'and',
  clauses: [{ ...createClause(variableId), op, value }]
})
const iff = (condition: Condition, then: Block[], otherwise: Block[] = [], id?: string): Block => ({
  ...(createBlock('if') as Of<'if'>),
  ...(id ? { id } : {}),
  condition,
  then,
  otherwise
})
const menu = (
  options: { text: string; condition?: Condition | null; blocks?: Block[]; id?: string }[],
  prompt: Of<'inlineChoice'>['prompt'] = null,
  id?: string
): Block => ({
  ...(createBlock('inlineChoice') as Of<'inlineChoice'>),
  ...(id ? { id } : {}),
  prompt,
  options: options.map((o) => ({ id: o.id ?? createInlineOption().id, text: o.text, condition: o.condition ?? null, blocks: o.blocks ?? [] }))
})

interface World {
  p: Project
  start: Scene
  cellar: Scene
  key: Id
  courage: Id
  anna: Id
}

/** Start (jump to Cellar... no: ends) and a Cellar sub-scene that ends. Variables Has key (true/false) and Courage (number); character Anna. */
function world(): World {
  const p = createProject('T')
  const start = p.scenes[p.startSceneId as string]
  start.name = 'Start'
  const cellar = createScene({ x: 0, y: 200 }, 'Cellar')
  cellar.blocks = [say('Dust.')]
  cellar.ending = { type: 'end' }
  p.scenes[cellar.id] = cellar
  const key = createVariable('Has key', 'boolean')
  const courage = createVariable('Courage', 'number')
  for (const v of [key, courage]) {
    p.variables[v.id] = v
    p.variableOrder.push(v.id)
  }
  const anna = createCharacter('Anna')
  p.characters[anna.id] = anna
  p.characterOrder.push(anna.id)
  start.ending = { type: 'end' }
  return { p, start, cellar, key: key.id, courage: courage.id, anna: anna.id }
}

const script = (p: Project): string => compileProject(p).files.find((f) => f.path === 'script.rpy')!.content

describe('factory: new block types', () => {
  it('visit starts without a scene', () => {
    expect(createBlock('visit')).toMatchObject({ type: 'visit', sceneId: null })
  })
  it('if starts with one clause that has no variable (so the validator flags it) and two empty branches', () => {
    const b = createBlock('if') as Of<'if'>
    expect(b.condition.join).toBe('and')
    expect(b.condition.clauses).toHaveLength(1)
    expect(b.condition.clauses[0].variableId).toBeNull()
    expect(b.then).toEqual([])
    expect(b.otherwise).toEqual([])
  })
  it('inlineChoice starts with no prompt and two empty options', () => {
    const b = createBlock('inlineChoice') as Of<'inlineChoice'>
    expect(b.prompt).toBeNull()
    expect(b.options).toHaveLength(2)
    for (const o of b.options) expect(o).toMatchObject({ text: '', condition: null, blocks: [] })
    expect(b.options[0].id).not.toBe(b.options[1].id)
  })
  it('all three pass the schema, also with children', () => {
    for (const t of ['visit', 'if', 'inlineChoice'] as const) expect(blockSchema.safeParse(createBlock(t)).success, t).toBe(true)
    const nested = iff(createCondition(), [menu([{ text: 'a', blocks: [visit(null)] }])])
    expect(blockSchema.safeParse(nested).success).toBe(true)
  })
})

describe('store: nested blocks', () => {
  const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
  let w: World
  let sceneId: Id
  const blocks = (): Block[] => S().project!.scenes[sceneId].blocks

  beforeEach(() => {
    w = world()
    S().loadProject('C:/story', w.p)
    sceneId = w.start.id
  })

  /** [say a, if i { then: [say b], otherwise: [] }, say z] */
  function seed(): void {
    S().addBlock(sceneId, 'say')
    S().updateBlock(sceneId, blocks()[0].id, { text: 'a' })
    const i = S().addBlock(sceneId, 'if') as Id
    const b = S().addBlock(sceneId, 'say', [{ i: 1, in: 'then' }, { i: 0 }]) as Id
    S().updateBlock(sceneId, b, { text: 'b' })
    const z = S().addBlock(sceneId, 'say') as Id
    S().updateBlock(sceneId, z, { text: 'z' })
    void i
  }
  const texts = (list: Block[]): string[] => list.map((b) => (b.type === 'say' ? b.text : b.type))

  it('addBlock with a path inserts into the area, and with a number still inserts at the top level', () => {
    seed()
    const ifBlock = blocks()[1] as Of<'if'>
    expect(texts(blocks())).toEqual(['a', 'if', 'z'])
    expect(texts(ifBlock.then)).toEqual(['b'])
    const o = S().addBlock(sceneId, 'say', [{ i: 1, in: 'otherwise' }, { i: 0 }])
    expect(o).toBeTruthy()
    expect(texts((blocks()[1] as Of<'if'>).otherwise)).toEqual([''])
    S().addBlock(sceneId, 'pause', 0)
    expect(blocks()[0].type).toBe('pause')
  })
  it('addBlock clamps the index, and addBlockAt reports an error for a missing place', () => {
    seed()
    S().addBlock(sceneId, 'say', [{ i: 1, in: 'then' }, { i: 99 }])
    expect((blocks()[1] as Of<'if'>).then).toHaveLength(2)
    const r = S().addBlockAt(sceneId, 'say', [{ i: 0, in: 'then' }, { i: 0 }])
    expect(r.ok).toBe(false)
    expect(S().addBlock(sceneId, 'say', [{ i: 7, in: 'then' }, { i: 0 }])).toBeNull()
    expect(S().addBlockAt('nope', 'say', [{ i: 0 }])).toEqual({ ok: false, error: 'That scene no longer exists.' })
  })
  it('a block can sit 4 levels deep; the 5th level is refused with the toast text', () => {
    const level = (n: number): BlockPath => {
      const path: BlockPath = []
      for (let k = 0; k < n; k++) path.push({ i: 0, in: 'then' })
      return path
    }
    S().addBlock(sceneId, 'if')
    expect(S().addBlockAt(sceneId, 'if', [...level(1), { i: 0 }]).ok).toBe(true)
    expect(S().addBlockAt(sceneId, 'if', [...level(2), { i: 0 }]).ok).toBe(true)
    // an If at depth 4 would need areas at depth 5: refused
    const refused = S().addBlockAt(sceneId, 'if', [...level(3), { i: 0 }])
    expect(refused).toEqual({ ok: false, error: DEPTH_ERROR })
    expect(DEPTH_ERROR).toBe('Blocks can only be nested 4 levels deep')
    // a plain block still fits at depth 4
    const ok = S().addBlockAt(sceneId, 'say', [...level(3), { i: 0 }])
    expect(ok.ok).toBe(true)
    // but nothing fits at depth 5
    expect(S().addBlockAt(sceneId, 'say', [...level(4), { i: 0 }]).ok).toBe(false)
    expect(S().addBlock(sceneId, 'say', [...level(4), { i: 0 }])).toBeNull()
  })
  it('updateBlock finds a nested block by id', () => {
    seed()
    const inner = (blocks()[1] as Of<'if'>).then[0]
    S().updateBlock(sceneId, inner.id, { text: 'changed' })
    expect(((blocks()[1] as Of<'if'>).then[0] as Of<'say'>).text).toBe('changed')
    S().updateBlock(sceneId, blocks()[1].id, { condition: when(w.key) })
    expect((blocks()[1] as Of<'if'>).condition.clauses[0].variableId).toBe(w.key)
  })
  it('deleteBlock removes a nested block, and a container takes its children with it', () => {
    seed()
    const inner = (blocks()[1] as Of<'if'>).then[0]
    S().deleteBlock(sceneId, inner.id)
    expect((blocks()[1] as Of<'if'>).then).toEqual([])
    S().addBlock(sceneId, 'say', [{ i: 1, in: 'then' }, { i: 0 }])
    S().deleteBlock(sceneId, blocks()[1].id)
    expect(texts(blocks())).toEqual(['a', 'z'])
    expect(JSON.stringify(blocks())).not.toContain('then')
  })
  it('deleting a container with children is one undo step', () => {
    seed()
    const before = JSON.stringify(blocks())
    S().deleteBlock(sceneId, blocks()[1].id)
    undo()
    expect(JSON.stringify(blocks())).toBe(before)
    redo()
    expect(texts(blocks())).toEqual(['a', 'z'])
  })
  it('duplicateBlock copies a nested block after it, and a container with fresh ids all the way down', () => {
    seed()
    const inner = (blocks()[1] as Of<'if'>).then[0]
    const copyId = S().duplicateBlock(sceneId, inner.id)
    expect(copyId).toBeTruthy()
    const then = (blocks()[1] as Of<'if'>).then
    expect(then).toHaveLength(2)
    expect(then[1].id).toBe(copyId)
    expect(then[1].id).not.toBe(inner.id)
    const containerCopy = S().duplicateBlock(sceneId, blocks()[1].id)
    expect(blocks()[2].id).toBe(containerCopy)
    const ids = new Set<string>()
    const walk = (list: Block[]): void => {
      for (const b of list) {
        expect(ids.has(b.id)).toBe(false)
        ids.add(b.id)
        if (b.type === 'if') {
          walk(b.then)
          walk(b.otherwise)
        }
      }
    }
    walk(blocks())
    expect(((blocks()[2] as Of<'if'>).then).map((b) => (b as Of<'say'>).text)).toEqual(['b', 'b'])
    expect(S().duplicateBlock(sceneId, 'missing')).toBeNull()
  })
  it('block ids stay unique project-wide after duplicating a scene', () => {
    seed()
    S().duplicateScene(sceneId)
    const all: string[] = []
    const walk = (list: Block[]): void => {
      for (const b of list) {
        all.push(b.id)
        if (b.type === 'if') {
          walk(b.then)
          walk(b.otherwise)
        }
      }
    }
    for (const s of Object.values(S().project!.scenes)) walk(s.blocks)
    expect(new Set(all).size).toBe(all.length)
  })

  describe('moveBlock', () => {
    it('still moves top-level blocks by index', () => {
      seed()
      const result = S().moveBlock(sceneId, 0, 2)
      expect(result.ok).toBe(true)
      expect(texts(blocks())).toEqual(['if', 'z', 'a'])
      S().moveBlock(sceneId, 2, 0)
      expect(texts(blocks())).toEqual(['a', 'if', 'z'])
    })
    it('moves a top-level block into an area, as one undo step', () => {
      seed()
      const before = JSON.stringify(blocks())
      // z (index 2) into the Otherwise area of the If at index 1
      const r = S().moveBlock(sceneId, [{ i: 2 }], [{ i: 1, in: 'otherwise' }, { i: 0 }])
      expect(r.ok).toBe(true)
      expect(texts(blocks())).toEqual(['a', 'if'])
      expect(texts((blocks()[1] as Of<'if'>).otherwise)).toEqual(['z'])
      undo()
      expect(JSON.stringify(blocks())).toBe(before)
      redo()
      expect(texts((blocks()[1] as Of<'if'>).otherwise)).toEqual(['z'])
    })
    it('destination paths are read before the block is taken out (an earlier block moving into a later container)', () => {
      seed()
      // a (index 0) into the Then area of the If at index 1 (which shifts to 0 once a is gone)
      expect(S().moveBlock(sceneId, [{ i: 0 }], [{ i: 1, in: 'then' }, { i: 1 }]).ok).toBe(true)
      expect(texts(blocks())).toEqual(['if', 'z'])
      expect(texts((blocks()[0] as Of<'if'>).then)).toEqual(['b', 'a'])
    })
    it('moves a nested block out to the top level and between areas', () => {
      seed()
      expect(S().moveBlock(sceneId, [{ i: 1, in: 'then' }, { i: 0 }], [{ i: 0 }]).ok).toBe(true)
      expect(texts(blocks())).toEqual(['b', 'a', 'if', 'z'])
      expect((blocks()[2] as Of<'if'>).then).toEqual([])
      expect(S().moveBlock(sceneId, [{ i: 0 }], [{ i: 2, in: 'then' }, { i: 0 }]).ok).toBe(true)
      expect(texts((blocks()[1] as Of<'if'>).then)).toEqual(['b'])
      expect(S().moveBlock(sceneId, [{ i: 1, in: 'then' }, { i: 0 }], [{ i: 1, in: 'otherwise' }, { i: 0 }]).ok).toBe(true)
      expect(texts((blocks()[1] as Of<'if'>).otherwise)).toEqual(['b'])
      expect((blocks()[1] as Of<'if'>).then).toEqual([])
    })
    it('reorders inside one list: an insertion index counts the list before the block is taken out', () => {
      seed()
      S().addBlock(sceneId, 'pause', [{ i: 1, in: 'then' }, { i: 1 }])
      S().addBlock(sceneId, 'hide', [{ i: 1, in: 'then' }, { i: 2 }])
      const order = (): string[] => (blocks()[1] as Of<'if'>).then.map((b) => b.type)
      expect(order()).toEqual(['say', 'pause', 'hide'])
      S().moveBlock(sceneId, [{ i: 1, in: 'then' }, { i: 0 }], [{ i: 1, in: 'then' }, { i: 3 }])
      expect(order()).toEqual(['pause', 'hide', 'say'])
      S().moveBlock(sceneId, [{ i: 1, in: 'then' }, { i: 2 }], [{ i: 1, in: 'then' }, { i: 0 }])
      expect(order()).toEqual(['say', 'pause', 'hide'])
    })
    it('a move that changes nothing records no change and no undo step', () => {
      seed()
      const past = useProjectStore.temporal.getState().pastStates.length
      expect(S().moveBlock(sceneId, [{ i: 1 }], [{ i: 1 }]).ok).toBe(true)
      expect(S().moveBlock(sceneId, [{ i: 1 }], [{ i: 2 }]).ok).toBe(true)
      expect(useProjectStore.temporal.getState().pastStates.length).toBe(past)
    })
    it('refuses to move a container into itself or into something inside it', () => {
      seed()
      const into = S().moveBlock(sceneId, [{ i: 1 }], [{ i: 1, in: 'then' }, { i: 0 }])
      expect(into).toEqual({ ok: false, error: "A block can't be moved into itself." })
      S().addBlock(sceneId, 'if', [{ i: 1, in: 'then' }, { i: 0 }])
      const deeper = S().moveBlock(sceneId, [{ i: 1 }], [{ i: 1, in: 'then' }, { i: 0, in: 'otherwise' }, { i: 0 }])
      expect(deeper.ok).toBe(false)
      expect(texts(blocks())).toEqual(['a', 'if', 'z'])
    })
    it('refuses to nest a subtree too deep, and says why', () => {
      // if0 > if1 > if2, and a separate container holding a container
      S().addBlock(sceneId, 'if')
      S().addBlock(sceneId, 'if', [{ i: 0, in: 'then' }, { i: 0 }])
      S().addBlock(sceneId, 'if', [{ i: 0, in: 'then' }, { i: 0, in: 'then' }, { i: 0 }])
      S().addBlock(sceneId, 'if')
      S().addBlock(sceneId, 'if', [{ i: 1, in: 'then' }, { i: 0 }])
      const r = S().moveBlock(sceneId, [{ i: 1 }], [{ i: 0, in: 'then' }, { i: 0, in: 'then' }, { i: 0, in: 'then' }, { i: 0 }])
      expect(r).toEqual({ ok: false, error: DEPTH_ERROR })
      // two levels of containers fit under one level
      const fits = S().moveBlock(sceneId, [{ i: 1 }], [{ i: 0, in: 'otherwise' }, { i: 0 }])
      expect(fits.ok).toBe(true)
    })
    it('errors for a missing block, a mixed call and a missing destination', () => {
      seed()
      expect(S().moveBlock(sceneId, [{ i: 9 }], [{ i: 0 }]).ok).toBe(false)
      expect(S().moveBlock(sceneId, 0, [{ i: 1 }]).ok).toBe(false)
      expect(S().moveBlock(sceneId, [{ i: 0 }], [{ i: 5, in: 'then' }, { i: 0 }]).ok).toBe(false)
      expect(S().moveBlock(sceneId, [{ i: 0 }], []).ok).toBe(false)
      expect(S().moveBlock('nope', 0, 1).ok).toBe(false)
    })
    it('moves an inline Choice option block between options', () => {
      const m = S().addBlock(sceneId, 'inlineChoice') as Id
      const [o1, o2] = (blocks()[0] as Of<'inlineChoice'>).options
      S().addBlock(sceneId, 'say', [{ i: 0, in: `opt:${o1.id}` }, { i: 0 }])
      expect(S().moveBlock(sceneId, [{ i: 0, in: `opt:${o1.id}` }, { i: 0 }], [{ i: 0, in: `opt:${o2.id}` }, { i: 0 }]).ok).toBe(true)
      const after = blocks()[0] as Of<'inlineChoice'>
      expect(after.id).toBe(m)
      expect(after.options[0].blocks).toHaveLength(0)
      expect(after.options[1].blocks).toHaveLength(1)
    })
  })

  describe('cleanup reaches nested blocks', () => {
    it('deleteScenes empties nested Visit blocks', () => {
      const id = S().addBlock(sceneId, 'if') as Id
      void id
      S().addBlock(sceneId, 'visit', [{ i: 0, in: 'then' }, { i: 0 }])
      const v = (blocks()[0] as Of<'if'>).then[0]
      S().updateBlock(sceneId, v.id, { sceneId: w.cellar.id })
      S().deleteScenes([w.cellar.id])
      expect(((blocks()[0] as Of<'if'>).then[0] as Of<'visit'>).sceneId).toBeNull()
    })
    it('deleteVariable clears nested If and option conditions', () => {
      S().addBlock(sceneId, 'if')
      S().updateBlock(sceneId, blocks()[0].id, { condition: when(w.key) })
      S().addBlock(sceneId, 'inlineChoice', [{ i: 0, in: 'then' }, { i: 0 }])
      const inner = (blocks()[0] as Of<'if'>).then[0] as Of<'inlineChoice'>
      S().updateBlock(sceneId, inner.id, { options: [{ ...inner.options[0], condition: when(w.key) }, inner.options[1]] })
      S().deleteVariable(w.key)
      const outer = blocks()[0] as Of<'if'>
      expect(outer.condition.clauses[0].variableId).toBeNull()
      expect(((outer.then[0] as Of<'inlineChoice'>).options[0].condition as Condition).clauses[0].variableId).toBeNull()
    })
    it('deleteCharacter clears nested speakers and a nested Choice prompt', () => {
      S().addBlock(sceneId, 'if')
      S().addBlock(sceneId, 'say', [{ i: 0, in: 'then' }, { i: 0 }])
      S().updateBlock(sceneId, (blocks()[0] as Of<'if'>).then[0].id, { characterId: w.anna })
      S().addBlock(sceneId, 'inlineChoice', [{ i: 0, in: 'otherwise' }, { i: 0 }])
      S().updateBlock(sceneId, (blocks()[0] as Of<'if'>).otherwise[0].id, { prompt: { characterId: w.anna, text: 'Hm?' } })
      S().deleteCharacter(w.anna)
      const outer = blocks()[0] as Of<'if'>
      expect((outer.then[0] as Of<'say'>).characterId).toBeNull()
      expect((outer.otherwise[0] as Of<'inlineChoice'>).prompt?.characterId).toBeNull()
    })
    it('deleteAsset clears a nested background', () => {
      const a = createAsset('background', 'Forest', 'backgrounds/f.png')
      S().addAsset(a)
      S().addBlock(sceneId, 'inlineChoice')
      const o = (blocks()[0] as Of<'inlineChoice'>).options[0]
      S().addBlock(sceneId, 'background', [{ i: 0, in: `opt:${o.id}` }, { i: 0 }])
      S().updateBlock(sceneId, (blocks()[0] as Of<'inlineChoice'>).options[0].blocks[0].id, { assetId: a.id })
      S().deleteAsset(a.id)
      expect(((blocks()[0] as Of<'inlineChoice'>).options[0].blocks[0] as Of<'background'>).assetId).toBeNull()
    })
    it('changeVariableType resets nested condition values', () => {
      S().addBlock(sceneId, 'if')
      S().updateBlock(sceneId, blocks()[0].id, { condition: when(w.courage, 'gte', 3) })
      S().changeVariableType(w.courage, 'boolean')
      expect((blocks()[0] as Of<'if'>).condition.clauses[0]).toMatchObject({ op: 'eq', value: false })
    })
  })
})

describe('compiler: nested blocks', () => {
  it('visit compiles to call <label>', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    expect(script(w.p)).toContain('label start:\n\n    call cellar\n\n    return')
  })
  it('a visit with no scene, or a deleted scene, is skipped', () => {
    const w = world()
    w.start.blocks = [visit(null), visit('gone')]
    expect(script(w.p)).toContain('label start:\n\n    return')
  })
  it('if compiles to if COND: with the blocks indented, and else only when Otherwise has blocks', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [say('Yes.')], [say('No.')])]
    expect(script(w.p)).toContain('label start:\n\n    if has_key:\n        "Yes."\n    else:\n        "No."\n\n    return')
    w.start.blocks = [iff(when(w.courage, 'gte', 3), [say('Yes.'), say('Twice.')])]
    expect(script(w.p)).toContain('    if courage >= 3:\n        "Yes."\n\n        "Twice."\n\n    return')
    expect(script(w.p)).not.toContain('else:')
  })
  it('an empty Then emits pass; with an Otherwise it still has else', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [], [say('No.')])]
    expect(script(w.p)).toContain('    if has_key:\n        pass\n    else:\n        "No."\n')
    w.start.blocks = [iff(when(w.key), [])]
    expect(script(w.p)).toContain('    if has_key:\n        pass\n\n    return')
  })
  it('an If whose branches compile to nothing still emits valid code', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [visit(null)], [visit(null)])]
    expect(script(w.p)).toContain('    if has_key:\n        pass\n\n    return')
  })
  it('a condition with no usable clause is True', () => {
    const w = world()
    w.start.blocks = [iff({ join: 'and', clauses: [createClause(null)] }, [say('Always.')])]
    expect(script(w.p)).toContain('    if True:\n        "Always."')
  })
  it('inlineChoice compiles to a menu with the option blocks indented, pass for an empty option and no jumps', () => {
    const w = world()
    w.start.blocks = [
      menu(
        [
          { text: 'Look around', blocks: [say('Dust.')] },
          { text: 'Use the key', condition: when(w.key), blocks: [visit(w.cellar.id)] },
          { text: 'Leave' }
        ],
        { characterId: w.anna, text: 'What now?' }
      )
    ]
    expect(script(w.p)).toContain(
      [
        'label start:',
        '',
        '    menu:',
        '',
        '        anna "What now?"',
        '',
        '        "Look around":',
        '            "Dust."',
        '',
        '        "Use the key" if has_key:',
        '            call cellar',
        '',
        '        "Leave":',
        '            pass',
        '',
        '    return',
        ''
      ].join('\n')
    )
    const out = script(w.p)
    expect(out.slice(out.indexOf('label start:'), out.indexOf('label cellar:'))).not.toMatch(/jump/)
  })
  it('a Choice without prompt has no prompt line; with no options it emits nothing', () => {
    const w = world()
    w.start.blocks = [menu([{ text: 'A' }, { text: 'B' }])]
    expect(script(w.p)).toContain('    menu:\n\n        "A":\n            pass\n\n        "B":\n            pass\n')
    w.start.blocks = [menu([])]
    expect(script(w.p)).toContain('label start:\n\n    return')
  })
  it('an If inside a Choice option inside an If is indented correctly and the ending continues normally', () => {
    const w = world()
    w.start.blocks = [
      say('Before.'),
      iff(
        when(w.courage, 'gte', 1),
        [menu([{ text: 'Go', blocks: [iff(when(w.key), [visit(w.cellar.id)], [say('Dark.')])] }, { text: 'Stay' }])],
        []
      ),
      say('After.')
    ]
    w.start.ending = { type: 'jump', target: w.cellar.id }
    expect(script(w.p)).toContain(
      [
        'label start:',
        '',
        '    "Before."',
        '',
        '    if courage >= 1:',
        '        menu:',
        '',
        '            "Go":',
        '                if has_key:',
        '                    call cellar',
        '                else:',
        '                    "Dark."',
        '',
        '            "Stay":',
        '                pass',
        '',
        '    "After."',
        '',
        '    jump cellar',
        ''
      ].join('\n')
    )
  })
  it('nested blocks keep their own rules: escaping, asset copies and the ambient channel', () => {
    const w = world()
    const rain = createAsset('ambient', 'Rain', 'ambient/r.ogg')
    w.p.assets[rain.id] = rain
    const playAmbient = { ...(createBlock('playMusic') as Of<'playMusic'>), assetId: rain.id, channel: 'ambient' as const }
    w.start.blocks = [iff(when(w.key), [say('He said "hi" [nobody] {b}x{/b}', null), playAmbient])]
    const result = compileProject(w.p)
    const text = result.files[0].content
    expect(text).toContain('"He said \\"hi\\" [[nobody] {b}x{/b}"')
    expect(text).toContain('play ambient "audio/ambient/rain.ogg"')
    expect(text).toContain('renpy.music.register_channel("ambient", "sfx", loop=True)')
    expect(result.assetCopies.map((c) => c.to)).toContain('audio/ambient/rain.ogg')
  })
  it('never writes a comment or blank-only indentation, and is deterministic', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [menu([{ text: 'A', blocks: [say('x')] }, { text: 'B' }])], [say('y')])]
    const a = script(w.p)
    expect(a).not.toMatch(/^\s*#/m)
    expect(a).not.toMatch(/^[ ]+$/m)
    expect(script(w.p)).toBe(a)
  })
  it('a persistent variable and a text variable work in nested conditions and text', () => {
    const w = world()
    const seen = createVariable('Seen', 'boolean')
    seen.persistent = true
    w.p.variables[seen.id] = seen
    w.p.variableOrder.push(seen.id)
    w.start.blocks = [iff(when(seen.id), [say('Seen [persistent.seen]')])]
    expect(script(w.p)).toContain('    if persistent.seen:')
  })
})

describe('validator: nested blocks', () => {
  const messages = (p: Project, severity?: 'error' | 'warning'): string[] =>
    validateProject(p)
      .filter((x) => (severity ? x.severity === severity : true))
      .map((x) => x.message)

  function clean(): World {
    const w = world()
    w.start.blocks = [say('Hi', null)]
    w.start.ending = { type: 'jump', target: w.cellar.id }
    return w
  }

  it('a clean project with a sub-scene has no errors', () => {
    const w = clean()
    w.start.blocks = [say('Hi'), visit(w.cellar.id)]
    w.start.ending = { type: 'end' }
    w.p.variables[w.key].name = 'Has key'
    expect(messages(w.p, 'error')).toEqual([])
  })
  it('Visit without a scene is an error with the block', () => {
    const w = clean()
    const v = visit(null, 'v1')
    w.start.blocks = [v]
    const hit = validateProject(w.p).find((x) => x.blockId === 'v1')
    expect(hit?.severity).toBe('error')
    expect(hit?.message).toBe('"Start": the Visit block (block 1) has no scene to visit. Pick a scene.')
    expect(validateProject(w.p).some((x) => x.blockId === 'v1' && x.severity === 'error')).toBe(true)
    // a deleted target counts as missing too
    w.start.blocks = [visit('gone', 'v2')]
    expect(validateProject(w.p).some((x) => x.blockId === 'v2' && x.severity === 'error')).toBe(true)
  })
  it('Visit nested in a branch is validated at any depth and labelled with its position', () => {
    const w = clean()
    w.start.blocks = [say('a'), iff(when(w.key), [say('b'), menu([{ text: 'x', blocks: [visit(null, 'deep')] }, { text: 'y' }])])]
    const hit = validateProject(w.p).find((x) => x.blockId === 'deep')
    expect(hit?.message).toContain('(block 2.2.1)')
  })
  it('a Visit cycle is an error on every Visit block of the cycle', () => {
    const w = clean()
    w.start.blocks = [visit(w.cellar.id, 'va')]
    w.cellar.blocks = [visit(w.start.id, 'vb')]
    const errors = validateProject(w.p).filter((x) => x.severity === 'error')
    expect(errors.map((e) => e.blockId).sort()).toEqual(['va', 'vb'])
    expect(errors[0].message).toContain('would never finish')
    expect(errors.find((e) => e.blockId === 'va')?.message).toBe(
      '"Start": the Visit block (block 1) visits "Cellar", which visits "Start" again, so it would never finish. Break the loop.'
    )
  })
  it('a scene visiting itself is a cycle; a diamond is not', () => {
    const w = clean()
    w.start.blocks = [visit(w.start.id, 'self')]
    expect(messages(w.p, 'error').some((m) => m.includes('visits itself, so it would never finish'))).toBe(true)
    const third = createScene({ x: 0, y: 400 }, 'Third')
    third.blocks = [say('t')]
    third.ending = { type: 'end' }
    w.p.scenes[third.id] = third
    w.start.blocks = [visit(w.cellar.id), visit(third.id)]
    w.cellar.blocks = [visit(third.id)]
    expect(messages(w.p, 'error').filter((m) => m.includes('never finish'))).toEqual([])
  })
  it('a sub-scene whose ending is not End gets the warning, an End sub-scene does not', () => {
    const w = clean()
    w.start.blocks = [visit(w.cellar.id)]
    w.start.ending = { type: 'end' }
    expect(messages(w.p, 'warning').some((m) => m.includes('is visited as a sub-scene but does not end the story'))).toBe(false)
    w.cellar.ending = { type: 'jump', target: w.start.id }
    expect(messages(w.p, 'warning')).toContain(
      '"Cellar" is visited as a sub-scene but does not end the story; it will continue into whatever it points to.'
    )
  })
  it('visiting the start scene warns', () => {
    const w = clean()
    w.cellar.blocks = [visit(w.start.id), say('x')]
    w.start.blocks = [say('s')]
    w.start.ending = { type: 'jump', target: w.cellar.id }
    expect(messages(w.p, 'warning').some((m) => m.includes('"Start" is the start scene and is also visited as a sub-scene by "Cellar"'))).toBe(true)
  })
  it('a scene that is only visited counts as reachable', () => {
    const w = clean()
    w.start.blocks = [visit(w.cellar.id)]
    w.start.ending = { type: 'end' }
    expect(messages(w.p, 'warning').some((m) => m.includes('no path from the start scene'))).toBe(false)
    w.start.blocks = [say('no visit now')]
    expect(messages(w.p, 'warning').some((m) => m.includes('"Cellar": no path from the start scene'))).toBe(true)
    // visited from an unreachable scene stays unreachable
    const third = createScene({ x: 0, y: 400 }, 'Third')
    third.blocks = [visit(w.cellar.id)]
    third.ending = { type: 'end' }
    w.p.scenes[third.id] = third
    expect(messages(w.p, 'warning').filter((m) => m.includes('no path from the start scene')).length).toBe(2)
  })
  it('an If with no condition, or a condition without a variable, is an error', () => {
    const w = clean()
    const empty = iff({ join: 'and', clauses: [] }, [say('x')], [], 'if0')
    w.start.blocks = [empty]
    expect(validateProject(w.p).find((x) => x.blockId === 'if0')?.message).toBe('"Start": the If block (block 1) has no condition. Add one.')
    w.start.blocks = [createBlock('if')]
    const hit = validateProject(w.p).find((x) => x.blockId === w.start.blocks[0].id)
    expect(hit?.severity).toBe('error')
    expect(hit?.message).toContain('the If block (block 1) has a condition with no variable picked')
  })
  it('an If with a type mismatch is an error; a good one is not', () => {
    const w = clean()
    w.start.blocks = [iff(when(w.key, 'eq', 5), [say('x')], [], 'bad')]
    expect(messages(w.p, 'error').some((m) => m.includes('compares "Has key" with a value that is not a true/false'))).toBe(true)
    w.start.blocks = [iff(when(w.key), [say('x')])]
    expect(messages(w.p, 'error')).toEqual([])
  })
  it('a Choice with no options, an empty option text or a bad option condition is an error', () => {
    const w = clean()
    w.start.blocks = [menu([], null, 'c0')]
    expect(validateProject(w.p).find((x) => x.blockId === 'c0')?.message).toBe('"Start": the Choice block (block 1) has no options. Add at least one option.')
    w.start.blocks = [menu([{ text: '  ' }, { text: 'ok' }], null, 'c1')]
    expect(validateProject(w.p).find((x) => x.blockId === 'c1')?.message).toContain('an option of the Choice block (block 1) has no text')
    w.start.blocks = [menu([{ text: 'a', condition: { join: 'and', clauses: [createClause(null)] } }, { text: 'b' }], null, 'c2')]
    expect(messages(w.p, 'error').some((m) => m.includes('an option of the Choice block (block 1) has a condition with no variable picked'))).toBe(true)
  })
  it('a Choice whose options all have conditions warns', () => {
    const w = clean()
    w.start.blocks = [menu([{ text: 'a', condition: when(w.key) }, { text: 'b', condition: when(w.key) }], null, 'c3')]
    expect(validateProject(w.p).find((x) => x.blockId === 'c3' && x.severity === 'warning')?.message).toContain('every option of the Choice block')
    expect(messages(w.p, 'error')).toEqual([])
  })
  it('nesting deeper than 4 levels is an error on the first block that is too deep', () => {
    const w = clean()
    const deepest = say('too deep', null, 'd5')
    const l4 = iff(when(w.key), [deepest], [], 'l4')
    w.start.blocks = [iff(when(w.key), [iff(when(w.key), [iff(when(w.key), [l4])])], [], 'l1')]
    const hit = validateProject(w.p).find((x) => x.blockId === 'd5')
    expect(hit?.severity).toBe('error')
    expect(hit?.message).toBe('"Start": a block (block 1.1.1.1.1) is nested more than 4 levels deep. Move it out of its containers.')
    // exactly four levels is fine
    w.start.blocks = [iff(when(w.key), [iff(when(w.key), [iff(when(w.key), [say('ok', null, 'd4')])])])]
    expect(messages(w.p, 'error')).toEqual([])
  })
  it('old rules apply at any depth: empty dialogue, show without a character, setVariable without a variable', () => {
    const w = clean()
    const show = { ...(createBlock('show') as Of<'show'>), id: 'sh' }
    const setVar = { ...(createBlock('setVariable') as Of<'setVariable'>), id: 'sv' }
    const empty = say('', null, 'em')
    w.start.blocks = [iff(when(w.key), [menu([{ text: 'x', blocks: [show, setVar, empty] }, { text: 'y' }])])]
    const problems = validateProject(w.p)
    expect(problems.find((x) => x.blockId === 'sh')?.severity).toBe('error')
    expect(problems.find((x) => x.blockId === 'sv')?.severity).toBe('error')
    expect(problems.find((x) => x.blockId === 'em')?.severity).toBe('warning')
  })
  it('stage warning works inside a branch and does not leak between branches', () => {
    const w = clean()
    const sprite = createAsset('sprite', 'a', 'sprites/a.png')
    w.p.assets[sprite.id] = sprite
    const ex = createExpression('happy', sprite.id)
    w.p.characters[w.anna].expressions.push(ex)
    const show = (id: string): Block => ({ ...(createBlock('show') as Of<'show'>), id, characterId: w.anna, expressionId: ex.id })
    w.start.blocks = [iff(when(w.key), [show('s1'), show('s2')], [show('s3')])]
    const warnings = validateProject(w.p).filter((x) => x.message.includes('already on stage'))
    expect(warnings.map((x) => x.blockId)).toEqual(['s2'])
    expect(warnings[0].message).toContain('(block 1.2)')
  })
  it('the usage index and unused checks see nested blocks', () => {
    const w = clean()
    const rain = createAsset('background', 'bg', 'backgrounds/b.png')
    w.p.assets[rain.id] = rain
    const bg = { ...(createBlock('background') as Of<'background'>), assetId: rain.id }
    w.start.blocks = [iff(when(w.key), [menu([{ text: 'x', blocks: [bg, say('hi', w.anna)] }, { text: 'y' }])])]
    const usage = findUsage(w.p)
    expect(usage.assets[rain.id]).toHaveLength(1)
    expect(usage.characters[w.anna]).toHaveLength(1)
    expect(usage.variables[w.key]).toHaveLength(1)
    expect(messages(w.p).some((m) => m.includes('never used'))).toBe(true) // Courage only
    expect(messages(w.p).some((m) => m.includes('"Anna" is never used'))).toBe(false)
  })
  it('fixture-style project from JSON round-trips through parseProject with nested blocks', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [menu([{ text: 'x', blocks: [visit(w.cellar.id)] }])])]
    const parsed = parseProject(JSON.stringify(w.p))
    expect(parsed.ok).toBe(true)
  })
})

describe('Quick play interpreter: nested blocks and the call stack', () => {
  const run = (p: Project, ...inputs: Parameters<typeof step>[2][]): PlayState => {
    let s = start(p, p.startSceneId)
    for (const i of inputs) s = step(p, s, i)
    return s
  }
  const click = { type: 'advance' } as const

  it('an If runs Then or Otherwise depending on the variable, then carries on after the block', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [say('Then.')], [say('Else.')]), say('After.')]
    expect(run(w.p).line?.text).toBe('Else.')
    expect(run(w.p, click).line?.text).toBe('After.')
    w.p.variables[w.key].defaultValue = true
    expect(run(w.p).line?.text).toBe('Then.')
    expect(run(w.p, click).line?.text).toBe('After.')
    expect(run(w.p, click, click).status).toBe('ended')
  })
  it('an If with an empty branch just skips it', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [say('Then.')]), say('After.')]
    expect(run(w.p).line?.text).toBe('After.')
  })
  it('an If sees variables changed earlier, including inside a branch', () => {
    const w = world()
    const set = { ...(createBlock('setVariable') as Of<'setVariable'>), effect: { variableId: w.key, op: 'set' as const, value: true } }
    w.start.blocks = [iff(when(w.courage, 'gte', 0), [set]), iff(when(w.key), [say('Key!')], [say('No key')])]
    expect(run(w.p).line?.text).toBe('Key!')
  })
  it('an inline Choice shows its options (conditional ones hidden), runs the picked option, then continues', () => {
    const w = world()
    const a = createInlineOption('A')
    const b = createInlineOption('B')
    const c = createInlineOption('C')
    w.start.blocks = [
      menu(
        [
          { id: a.id, text: 'A', blocks: [say('You chose A.')] },
          { id: b.id, text: 'B (needs key)', condition: when(w.key), blocks: [say('B!')] },
          { id: c.id, text: 'C' }
        ],
        { characterId: w.anna, text: 'Which?' }
      ),
      say('After.')
    ]
    const s0 = run(w.p)
    expect(s0.menu?.map((o) => o.text)).toEqual(['A', 'C'])
    expect(s0.line).toEqual({ characterId: w.anna, text: 'Which?' })
    expect(step(w.p, s0, click)).toBe(s0)
    expect(step(w.p, s0, { type: 'choose', optionId: b.id })).toBe(s0)
    const s1 = step(w.p, s0, { type: 'choose', optionId: a.id })
    expect(s1.menu).toBeNull()
    expect(s1.line?.text).toBe('You chose A.')
    const s2 = step(w.p, s1, click)
    expect(s2.line?.text).toBe('After.')
    const viaC = step(w.p, s0, { type: 'choose', optionId: c.id })
    expect(viaC.line?.text).toBe('After.')
    expect(s0.menu).not.toBeNull()
  })
  it('an inline Choice with no visible option is skipped', () => {
    const w = world()
    w.start.blocks = [menu([{ text: 'A', condition: when(w.key) }]), say('After.')]
    expect(run(w.p).line?.text).toBe('After.')
  })
  it('an inline Choice with no prompt shows only the buttons', () => {
    const w = world()
    w.start.blocks = [menu([{ text: 'A' }, { text: 'B' }])]
    const s = run(w.p)
    expect(s.line).toBeNull()
    expect(s.menu).toHaveLength(2)
  })
  it('an If inside a Choice option inside an If works and continues at each level', () => {
    const w = world()
    w.p.variables[w.key].defaultValue = true
    const opt = createInlineOption('Go')
    w.start.blocks = [
      iff(
        when(w.key),
        [menu([{ id: opt.id, text: 'Go', blocks: [say('one'), iff(when(w.key), [say('two')], [say('nope')]), say('three')] }]), say('four')],
        [say('never')]
      ),
      say('five')
    ]
    let s = run(w.p)
    expect(s.menu).toHaveLength(1)
    const lines: string[] = []
    s = step(w.p, s, { type: 'choose', optionId: opt.id })
    while (s.status === 'running') {
      lines.push(s.line!.text)
      s = step(w.p, s, click)
    }
    expect(lines).toEqual(['one', 'two', 'three', 'four', 'five'])
  })
  it('Visit runs the sub-scene and resumes after the Visit block when it ends', () => {
    const w = world()
    w.start.blocks = [say('Before.'), visit(w.cellar.id), say('After.')]
    w.cellar.blocks = [say('Inside.')]
    const s0 = run(w.p)
    expect(s0.line?.text).toBe('Before.')
    const s1 = step(w.p, s0, click)
    expect(s1.line?.text).toBe('Inside.')
    expect(s1.sceneId).toBe(w.cellar.id)
    expect(s1.callStack).toHaveLength(1)
    const s2 = step(w.p, s1, click)
    expect(s2.line?.text).toBe('After.')
    expect(s2.sceneId).toBe(w.start.id)
    expect(s2.callStack).toHaveLength(0)
    expect(step(w.p, s2, click).status).toBe('ended')
    expect(s2.history).toEqual(['Start', 'Cellar', 'Start'])
  })
  it('a sub-scene visited twice returns each time to the right place', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id), say('Middle.'), visit(w.cellar.id), say('Last.')]
    w.cellar.blocks = [say('Inside.')]
    const seen: string[] = []
    let s = run(w.p)
    while (s.status === 'running') {
      seen.push(s.line!.text)
      s = step(w.p, s, click)
    }
    expect(seen).toEqual(['Inside.', 'Middle.', 'Inside.', 'Last.'])
    expect(s.notice).toBeNull()
  })
  it('Visit inside an inline Choice option inside an If returns into the option, then the rest of the story', () => {
    const w = world()
    w.p.variables[w.key].defaultValue = true
    const opt = createInlineOption('Look')
    w.start.blocks = [
      iff(when(w.key), [menu([{ id: opt.id, text: 'Look', blocks: [visit(w.cellar.id), say('Back in option.')] }]), say('After menu.')]),
      say('After if.')
    ]
    let s = step(w.p, run(w.p), { type: 'choose', optionId: opt.id })
    const seen: string[] = []
    while (s.status === 'running') {
      seen.push(`${s.line!.text}@${s.callStack.length}`)
      s = step(w.p, s, click)
    }
    expect(seen).toEqual(['Dust.@1', 'Back in option.@0', 'After menu.@0', 'After if.@0'])
  })
  it('nested visits: the call stack grows and unwinds', () => {
    const w = world()
    const inner = createScene({ x: 0, y: 400 }, 'Inner')
    inner.blocks = [say('Innermost.')]
    inner.ending = { type: 'end' }
    w.p.scenes[inner.id] = inner
    w.cellar.blocks = [say('Cellar start.'), visit(inner.id), say('Cellar end.')]
    w.start.blocks = [visit(w.cellar.id), say('Home.')]
    const depths: number[] = []
    const lines: string[] = []
    let s = run(w.p)
    while (s.status === 'running') {
      lines.push(s.line!.text)
      depths.push(s.callStack.length)
      s = step(w.p, s, click)
    }
    expect(lines).toEqual(['Cellar start.', 'Innermost.', 'Cellar end.', 'Home.'])
    expect(depths).toEqual([1, 2, 1, 0])
  })
  it('an End ending with an empty call stack ends the story; inside a visit it only returns', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    w.cellar.blocks = []
    const s = run(w.p)
    expect(s.status).toBe('ended')
    expect(s.notice).toBeNull()
    expect(s.history).toEqual(['Start', 'Cellar', 'Start'])
  })
  it('a sub-scene whose ending is a jump keeps the stack and returns when the scene it reaches ends', () => {
    const w = world()
    const third = createScene({ x: 0, y: 400 }, 'Third')
    third.blocks = [say('Third.')]
    third.ending = { type: 'end' }
    w.p.scenes[third.id] = third
    w.cellar.ending = { type: 'jump', target: third.id }
    w.start.blocks = [visit(w.cellar.id), say('Home.')]
    const lines: string[] = []
    let s = run(w.p)
    while (s.status === 'running') {
      lines.push(s.line!.text)
      s = step(w.p, s, click)
    }
    expect(lines).toEqual(['Dust.', 'Third.', 'Home.'])
  })
  it('a choice ending inside a visited scene still works, and a dead exit stops the story', () => {
    const w = world()
    const o = createOption('Back')
    o.target = w.start.id
    w.cellar.ending = { type: 'choice', prompt: null, options: [o] }
    w.start.blocks = [visit(w.cellar.id)]
    const s0 = run(w.p, click)
    expect(s0.menu).toHaveLength(1)
    expect(s0.sceneId).toBe(w.cellar.id)
    w.cellar.ending = { type: 'jump', target: null }
    const dead = run(w.p, click, click)
    expect(dead.notice).toBe(NOWHERE_NOTICE)
  })
  it('Visit with no scene is skipped', () => {
    const w = world()
    w.start.blocks = [visit(null), visit('gone'), say('Fine.')]
    expect(run(w.p).line?.text).toBe('Fine.')
  })
  it('scenes that visit each other are stopped by the depth guard instead of hanging', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    w.cellar.blocks = [visit(w.start.id)]
    const s = run(w.p)
    expect(s.status).toBe('ended')
    expect(s.notice).toContain('visit each other')
  })
  it('step does not modify the input state, including the cursor and call stack', () => {
    const w = world()
    w.start.blocks = [say('Before.'), visit(w.cellar.id), say('After.')]
    const s0 = run(w.p)
    const copy = JSON.stringify(s0)
    step(w.p, s0, click)
    expect(JSON.stringify(s0)).toBe(copy)
  })
  it('Quick play can start in a nested scene position: starting at a scene runs from its first block', () => {
    const w = world()
    w.cellar.blocks = [iff(when(w.key), [say('x')], [say('y')])]
    const s = start(w.p, w.cellar.id)
    expect(s.line?.text).toBe('y')
    expect(s.callStack).toEqual([])
  })
})

describe('stage preview: nesting rule', () => {
  function world2() {
    const w = world()
    const bgA = createAsset('background', 'A', 'backgrounds/a.png')
    const bgB = createAsset('background', 'B', 'backgrounds/b.png')
    const bgC = createAsset('background', 'C', 'backgrounds/c.png')
    for (const a of [bgA, bgB, bgC]) w.p.assets[a.id] = a
    const bg = (assetId: string, id: string): Block => ({ ...(createBlock('background') as Of<'background'>), id, assetId })
    return { ...w, bg, a: bgA.id, b: bgB.id, c: bgC.id }
  }
  it('blocks before the If apply; inside a branch only that branch counts', () => {
    const w = world2()
    w.start.blocks = [w.bg(w.a, 'b0'), iff(when(w.key), [say('t'), w.bg(w.b, 'bt'), say('t2')], [w.bg(w.c, 'bo')], 'if1'), say('after', null, 'af')]
    const at = (path: BlockPath): string | null => computeStageAt(w.p, w.start.id, path).background
    expect(at([{ i: 0 }])).toBe(w.a)
    expect(at([{ i: 1, in: 'then' }, { i: 0 }])).toBe(w.a)
    expect(at([{ i: 1, in: 'then' }, { i: 1 }])).toBe(w.b)
    expect(at([{ i: 1, in: 'otherwise' }, { i: 0 }])).toBe(w.c)
    // the Otherwise branch does not see what Then did
    expect(computeStageAt(w.p, w.start.id, [{ i: 1, in: 'otherwise' }, { i: 0 }], false).background).toBe(w.a)
  })
  it('after an If, the Then branch is applied (the simple rule), the Otherwise branch is not', () => {
    const w = world2()
    w.start.blocks = [w.bg(w.a, 'b0'), iff(when(w.key), [w.bg(w.b, 'bt')], [w.bg(w.c, 'bo')], 'if1'), say('after', null, 'af')]
    expect(computeStageAt(w.p, w.start.id, [{ i: 2 }]).background).toBe(w.b)
    // the selected If itself counts as having run its Then branch
    expect(computeStageAt(w.p, w.start.id, [{ i: 1 }]).background).toBe(w.b)
    // before the If it has not run yet
    expect(computeStageAt(w.p, w.start.id, [{ i: 1 }], false).background).toBe(w.a)
  })
  it('after an inline Choice the first option is applied; inside an option only that option counts', () => {
    const w = world2()
    const o1 = createInlineOption('1')
    const o2 = createInlineOption('2')
    w.start.blocks = [menu([{ id: o1.id, text: '1', blocks: [w.bg(w.a, 'x1')] }, { id: o2.id, text: '2', blocks: [w.bg(w.b, 'x2'), say('in 2', null, 'in2')] }], null, 'm1'), say('after')]
    expect(computeStageAt(w.p, w.start.id, [{ i: 1 }]).background).toBe(w.a)
    expect(computeStageAt(w.p, w.start.id, [{ i: 0, in: `opt:${o2.id}` }, { i: 1 }]).background).toBe(w.b)
    expect(computeStageAt(w.p, w.start.id, [{ i: 0, in: `opt:${o2.id}` }, { i: 0 }], false).background).toBeNull()
  })
  it('a Visit block does not change the stage', () => {
    const w = world2()
    w.cellar.blocks = [w.bg(w.c, 'cb')]
    w.start.blocks = [w.bg(w.a, 'b0'), visit(w.cellar.id)]
    expect(computeStageAt(w.p, w.start.id, [{ i: 1 }]).background).toBe(w.a)
  })
  it('sprites follow the same rule', () => {
    const w = world2()
    const sprite = createAsset('sprite', 'a', 'sprites/a.png')
    w.p.assets[sprite.id] = sprite
    const ex = createExpression('happy', sprite.id)
    w.p.characters[w.anna].expressions.push(ex)
    const show = { ...(createBlock('show') as Of<'show'>), id: 'sh', characterId: w.anna, expressionId: ex.id }
    const hide = { ...(createBlock('hide') as Of<'hide'>), id: 'hi', characterId: w.anna }
    w.start.blocks = [iff(when(w.key), [show, hide], [show])]
    expect(computeStageAt(w.p, w.start.id, [{ i: 0, in: 'then' }, { i: 0 }]).sprites).toHaveLength(1)
    expect(computeStageAt(w.p, w.start.id, [{ i: 0, in: 'then' }, { i: 1 }]).sprites).toHaveLength(0)
    expect(computeStageAt(w.p, w.start.id, [{ i: 0, in: 'otherwise' }, { i: 0 }]).sprites).toHaveLength(1)
  })
  it('the old top-level computeStage still works', () => {
    const w = world2()
    w.start.blocks = [w.bg(w.a, 'b0'), w.bg(w.b, 'b1')]
    expect(computeStage(w.p, w.start.id, -1).background).toBeNull()
    expect(computeStage(w.p, w.start.id, 0).background).toBe(w.a)
    expect(computeStage(w.p, w.start.id, 99).background).toBe(w.b)
    expect(computeStage(w.p, 'nope', 0).background).toBeNull()
  })
  it('appliedBlocks lists only plain blocks, and sceneSetsBackgroundAt follows the nesting rule', () => {
    const w = world2()
    w.start.blocks = [iff(when(w.key), [w.bg(w.a, 'in-then')], [say('x', null, 'sx')]), say('y', null, 'sy')]
    expect(appliedBlocks(w.start.blocks, [{ i: 1 }]).map((b) => b.id)).toEqual(['in-then', 'sy'])
    expect(sceneSetsBackgroundAt(w.p, w.start.id, [{ i: 1 }])).toBe(true)
    expect(sceneSetsBackgroundAt(w.p, w.start.id, [{ i: 0, in: 'otherwise' }, { i: 0 }])).toBe(false)
  })
})

describe('Story Map: Visit arrows', () => {
  it('deriveVisitEdges gives one edge per Visit block at any depth, with ids and source handle', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id, 'v1'), iff(when(w.key), [visit(w.cellar.id, 'v2')]), visit(null, 'v3'), visit('gone', 'v4')]
    const edges = deriveVisitEdges(w.p)
    expect(edges.map((e) => e.blockId)).toEqual(['v1', 'v2'])
    expect(edges[0]).toEqual({ id: `${w.start.id}:visit:v1`, kind: 'visit', source: w.start.id, blockId: 'v1', handle: 'visit', target: w.cellar.id })
  })
  it('deriveEdges (the exits) is unchanged by Visit blocks', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    expect(deriveEdges(w.p)).toEqual([])
    w.start.ending = { type: 'jump', target: w.cellar.id }
    expect(deriveEdges(w.p)).toHaveLength(1)
    expect(deriveVisitEdges(w.p)).toHaveLength(1)
  })
  it('sceneSuccessors lists exits first, then visited scenes, without repeats', () => {
    const w = world()
    const third = createScene({ x: 0, y: 400 }, 'Third')
    w.p.scenes[third.id] = third
    w.start.ending = { type: 'jump', target: third.id }
    w.start.blocks = [visit(w.cellar.id), visit(third.id), visit(w.cellar.id)]
    expect(sceneSuccessors(w.p, w.start.id)).toEqual([third.id, w.cellar.id])
    expect(sceneSuccessors(w.p, 'nope')).toEqual([])
  })
  it('Tidy up and distances count Visit arrows as steps', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    expect(distancesFromStart(w.p).get(w.cellar.id)).toBe(1)
    const layout = tidyLayout(w.p)
    expect(layout[w.start.id].x).toBe(0)
    expect(layout[w.cellar.id].x).toBeGreaterThan(0)
    w.start.blocks = []
    expect(distancesFromStart(w.p).has(w.cellar.id)).toBe(false)
  })
  it('deleting a scene counts the Visit arrows into it', () => {
    const w = world()
    w.start.blocks = [visit(w.cellar.id)]
    expect(countArrowsInto(w.p, [w.cellar.id])).toBe(1)
    w.start.blocks = []
    expect(countArrowsInto(w.p, [w.cellar.id])).toBe(0)
  })
  it('search matches dialogue at any depth and the card shows the nested first line and block count', () => {
    const w = world()
    w.start.blocks = [iff(when(w.key), [menu([{ text: 'x', blocks: [say('Needle in a haystack', w.anna)] }, { text: 'y' }])])]
    expect(sceneMatches(w.start, 'needle')).toBe(true)
    expect(sceneMatches(w.start, 'absent')).toBe(false)
    expect(matchingSceneIds(w.p, 'haystack')).toEqual([w.start.id])
    const info = sceneCardInfo(w.start, w.p)
    expect(info.firstLine).toBe('Anna: Needle in a haystack')
    expect(info.blockCount).toBe(3)
  })
  it('a background nested in a branch is used for the card thumbnail', () => {
    const w = world()
    const a = createAsset('background', 'A', 'backgrounds/a.png')
    w.p.assets[a.id] = a
    w.start.blocks = [iff(when(w.key), [{ ...(createBlock('background') as Of<'background'>), assetId: a.id }])]
    expect(sceneCardInfo(w.start, w.p).backgroundAssetId).toBe(a.id)
  })
})

describe('Scene Editor helpers for nested blocks', () => {
  /**
   * 0 say a
   * 1 if i1 { then: [0 say b, 1 menu m1 { o1: [say c], o2: [] }], otherwise: [] }
   * 2 say e
   */
  function nested() {
    const o1 = createInlineOption('one')
    const o2 = createInlineOption('two')
    const blocks: Block[] = [
      say('A', null, 'a'),
      iff(
        when(null),
        [say('B', null, 'b'), { ...(menu([{ id: o1.id, text: 'one', blocks: [say('C', null, 'c')] }, { id: o2.id, text: 'two' }], null, 'm1') as Of<'inlineChoice'>) }],
        [],
        'i1'
      ),
      say('E', null, 'e')
    ]
    return { blocks, o1: o1.id, o2: o2.id }
  }

  it('resolveDrop turns a row, an area and the list end into insertion paths', () => {
    const { blocks, o1 } = nested()
    expect(resolveDrop(blocks, 'e', false)).toMatchObject({ path: [{ i: 2 }], listKey: 'root', index: 2, fits: true })
    expect(resolveDrop(blocks, 'e', true)).toMatchObject({ path: [{ i: 3 }], listKey: 'root', index: 3 })
    expect(resolveDrop(blocks, 'list-end', false)).toMatchObject({ path: [{ i: 3 }], listKey: 'root' })
    expect(resolveDrop(blocks, 'b', true)).toMatchObject({ path: [{ i: 1, in: 'then' }, { i: 1 }], listKey: 'i1:then', index: 1 })
    expect(resolveDrop(blocks, areaId('i1', 'otherwise'), false)).toMatchObject({ path: [{ i: 1, in: 'otherwise' }, { i: 0 }], listKey: 'i1:otherwise' })
    expect(resolveDrop(blocks, areaId('m1', `opt:${o1}`), false)).toMatchObject({
      path: [{ i: 1, in: 'then' }, { i: 1, in: `opt:${o1}` }, { i: 1 }],
      listKey: `m1:opt:${o1}`
    })
    expect(resolveDrop(blocks, 'c', false)).toMatchObject({ path: [{ i: 1, in: 'then' }, { i: 1, in: `opt:${o1}` }, { i: 0 }] })
    expect(resolveDrop(blocks, 'nope', false)).toBeNull()
    expect(resolveDrop(blocks, areaId('nope', 'then'), false)).toBeNull()
    expect(resolveDrop(blocks, areaId('a', 'then'), false)).toBeNull()
  })
  it('resolveDrop refuses the dragged block itself and anything inside it', () => {
    const { blocks, o2 } = nested()
    expect(resolveDrop(blocks, 'i1', false, 3, 'i1')).toBeNull()
    expect(resolveDrop(blocks, 'b', false, 3, 'i1')).toBeNull()
    expect(resolveDrop(blocks, areaId('i1', 'otherwise'), false, 3, 'i1')).toBeNull()
    expect(resolveDrop(blocks, areaId('m1', `opt:${o2}`), false, 3, 'i1')).toBeNull()
    expect(resolveDrop(blocks, 'e', false, 3, 'i1')).not.toBeNull()
    // dropping a child onto its own parent container's row is fine (it moves out)
    expect(resolveDrop(blocks, 'i1', false, 1, 'b')).not.toBeNull()
  })
  it('resolveDrop says when a drop would nest too deep', () => {
    const { blocks, o1 } = nested()
    // that area is at depth 3: a plain block (1) or an empty container (2) fits, a container holding a container (3) does not
    expect(resolveDrop(blocks, areaId('m1', `opt:${o1}`), false, 3)?.fits).toBe(false)
    expect(resolveDrop(blocks, areaId('m1', `opt:${o1}`), false, 2)?.fits).toBe(true)
    expect(resolveDrop(blocks, areaId('m1', `opt:${o1}`), false, 1)?.fits).toBe(true)
    expect(resolveDrop(blocks, 'e', false, 4)?.fits).toBe(true)
    expect(resolveDrop(blocks, 'e', false, 5)?.fits).toBe(false)
  })
  it('neighbourId walks the rows in the order they appear, containers before their children', () => {
    const { blocks } = nested()
    const order = ['a', 'i1', 'b', 'm1', 'c', 'e']
    let id: string | null = null
    const down: (string | null)[] = []
    for (let k = 0; k < order.length; k++) {
      id = neighbourId(blocks, id, 1)
      down.push(id)
    }
    expect(down).toEqual(order)
    expect(neighbourId(blocks, 'e', 1)).toBe('e')
    expect(neighbourId(blocks, 'c', -1)).toBe('m1')
    expect(neighbourId(blocks, null, -1)).toBe('e')
    expect(neighbourId([], null, 1)).toBeNull()
  })
  it('insertionAfter puts a new block after the selected one in its own list', () => {
    const { blocks, o1 } = nested()
    expect(insertionAfter(blocks, null)).toEqual([{ i: 3 }])
    expect(insertionAfter(blocks, 'a')).toEqual([{ i: 1 }])
    expect(insertionAfter(blocks, 'b')).toEqual([{ i: 1, in: 'then' }, { i: 1 }])
    expect(insertionAfter(blocks, 'c')).toEqual([{ i: 1, in: 'then' }, { i: 1, in: `opt:${o1}` }, { i: 1 }])
    expect(insertionAfter(blocks, 'gone')).toEqual([{ i: 3 }])
  })
  it('insertionIntoArea appends to the end of an area', () => {
    const { blocks, o1 } = nested()
    expect(insertionIntoArea(blocks, 'i1', 'then')).toEqual([{ i: 1, in: 'then' }, { i: 2 }])
    expect(insertionIntoArea(blocks, 'i1', 'otherwise')).toEqual([{ i: 1, in: 'otherwise' }, { i: 0 }])
    expect(insertionIntoArea(blocks, 'm1', `opt:${o1}`)).toEqual([{ i: 1, in: 'then' }, { i: 1, in: `opt:${o1}` }, { i: 1 }])
    expect(insertionIntoArea(blocks, 'a', 'then')).toBeNull()
  })
  it('siblingMoveTarget swaps within the same area and stops at its edges', () => {
    const { blocks } = nested()
    expect(siblingMoveTarget(blocks, 'a', -1)).toBeNull()
    expect(siblingMoveTarget(blocks, 'e', 1)).toBeNull()
    expect(siblingMoveTarget(blocks, 'a', 1)).toEqual({ from: [{ i: 0 }], to: [{ i: 2 }] })
    expect(siblingMoveTarget(blocks, 'e', -1)).toEqual({ from: [{ i: 2 }], to: [{ i: 1 }] })
    expect(siblingMoveTarget(blocks, 'b', -1)).toBeNull()
    expect(siblingMoveTarget(blocks, 'b', 1)?.to).toEqual([{ i: 1, in: 'then' }, { i: 2 }])
    expect(siblingMoveTarget(blocks, 'c', 1)).toBeNull()
    expect(siblingMoveTarget(blocks, 'zzz', 1)).toBeNull()
  })
  it('Alt+Up/Down moves through the store as one undo step', () => {
    const w = world()
    w.start.blocks = nested().blocks
    useProjectStore.getState().loadProject('C:/s', w.p)
    const before = JSON.stringify(useProjectStore.getState().project!.scenes[w.start.id].blocks)
    const move = siblingMoveTarget(w.start.blocks, 'b', 1)!
    expect(useProjectStore.getState().moveBlock(w.start.id, move.from, move.to).ok).toBe(true)
    const inThen = (useProjectStore.getState().project!.scenes[w.start.id].blocks[1] as Of<'if'>).then
    expect(inThen.map((b) => b.id)).toEqual(['m1', 'b'])
    undo()
    expect(JSON.stringify(useProjectStore.getState().project!.scenes[w.start.id].blocks)).toBe(before)
  })
  it('selectionAfterDeleteAt prefers the neighbour in the same list, then the container', () => {
    const { blocks } = nested()
    expect(selectionAfterDeleteAt(blocks, 'a')).toBe('i1')
    expect(selectionAfterDeleteAt(blocks, 'e')).toBe('i1')
    expect(selectionAfterDeleteAt(blocks, 'b')).toBe('m1')
    expect(selectionAfterDeleteAt(blocks, 'c')).toBe('m1')
    expect(selectionAfterDeleteAt(blocks, 'gone')).toBeNull()
    expect(selectionAfterDeleteAt([say('only', null, 'o')], 'o')).toBeNull()
  })
  it('a new Dialogue starts with the closest earlier speaker in reading order, at any depth', () => {
    const w = world()
    w.start.blocks = [say('x', w.anna, 'sp'), iff(when(w.key), [say('', null, 'new')])]
    expect(speakerBeforeBlock(w.p, w.start, 'new')).toBe(w.anna)
    w.start.blocks = [iff(when(w.key), [say('', null, 'new')])]
    expect(speakerBeforeBlock(w.p, w.start, 'new')).toBe(w.anna) // falls back to the first character
  })
  it('summaries of the new blocks read well', () => {
    const w = world()
    expect(summarizeBlock(visit(w.cellar.id), w.p)).toEqual({ title: 'Visit scene', detail: 'Cellar · then comes back here' })
    expect(summarizeBlock(visit(null), w.p).detail).toBe('Pick a scene')
    expect(summarizeBlock(visit('gone'), w.p).detail).toBe('Missing scene')
    expect(summarizeBlock(iff(when(w.key), []), w.p)).toEqual({ title: 'If', detail: 'Has key' })
    expect(summarizeBlock(createBlock('if'), w.p).detail).toBe('Pick a condition')
    expect(summarizeBlock(menu([{ text: 'a' }, { text: 'b' }], { characterId: null, text: 'Now?' }), w.p)).toEqual({
      title: 'Choice',
      detail: '"Now?" · 2 options · stays in this scene'
    })
    expect(summarizeBlock(menu([{ text: 'a' }]), w.p).detail).toBe('1 option · stays in this scene')
  })
  it('blocks are found by id at any depth (findBlockPath/getBlockAt agree)', () => {
    const { blocks } = nested()
    const path = findBlockPath(blocks, 'c')!
    expect(getBlockAt(blocks, path)?.id).toBe('c')
  })
})
