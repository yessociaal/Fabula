import { beforeEach, describe, expect, it } from 'vitest'
import { createBlock, createCharacter, createClause, createProject, createScene, createVariable } from '@shared/factory'
import type { Block, Effect, Project } from '@shared/model'
import {
  CLAUSE_OP_LABELS,
  EFFECT_OP_LABELS,
  clauseOpsFor,
  effectOpsFor,
  retargetClause,
  retargetEffect,
  valueMatchesType
} from '../src/renderer/components/variableOps'
import { freeSpotNear, uniqueName } from '../src/renderer/components/entityHelpers'
import {
  TRANSITION_OPTIONS,
  appendIndex,
  charactersForHide,
  defaultSpeaker,
  dropInsertIndex,
  insertAtSelection,
  neighbourId,
  selectionAfterDelete,
  wrapSelection
} from '../src/renderer/views/SceneEditor/editorHelpers'
import { batch } from '../src/renderer/store/batch'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'

describe('valid operations per variable type', () => {
  it('effect ops', () => {
    expect(effectOpsFor('boolean')).toEqual(['set', 'toggle'])
    expect(effectOpsFor('number')).toEqual(['set', 'add', 'subtract'])
    expect(effectOpsFor('text')).toEqual(['set'])
    expect(effectOpsFor(null)).toEqual(['set', 'add', 'subtract', 'toggle'])
    expect(EFFECT_OP_LABELS).toEqual({ set: 'Set to', add: 'Add', subtract: 'Subtract', toggle: 'Flip' })
  })
  it('condition operators: boolean and text only get is / is not', () => {
    expect(clauseOpsFor('boolean')).toEqual(['eq', 'neq'])
    expect(clauseOpsFor('text')).toEqual(['eq', 'neq'])
    expect(clauseOpsFor('number')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte'])
    expect(clauseOpsFor(null)).toHaveLength(6)
    expect(Object.values(CLAUSE_OP_LABELS)).toEqual(['is', 'is not', '>', '≥', '<', '≤'])
  })
  it('valueMatchesType', () => {
    expect(valueMatchesType('boolean', true)).toBe(true)
    expect(valueMatchesType('boolean', 1)).toBe(false)
    expect(valueMatchesType('number', 2)).toBe(true)
    expect(valueMatchesType('text', 'a')).toBe(true)
    expect(valueMatchesType('text', 2)).toBe(false)
  })
  it('retargetEffect keeps what still fits and resets what does not', () => {
    const num = createVariable('n', 'number')
    const flag = createVariable('f', 'boolean')
    const txt = createVariable('t', 'text')
    const add: Effect = { variableId: num.id, op: 'add', value: 5 }
    expect(retargetEffect(add, createVariable('m', 'number'))).toMatchObject({ op: 'add', value: 5 })
    expect(retargetEffect(add, flag)).toMatchObject({ variableId: flag.id, op: 'set', value: false })
    expect(retargetEffect(add, txt)).toMatchObject({ op: 'set', value: '' })
    const toggle: Effect = { variableId: flag.id, op: 'toggle', value: true }
    expect(retargetEffect(toggle, num)).toMatchObject({ op: 'set', value: 0 })
    expect(retargetEffect(add, undefined).variableId).toBeNull()
  })
  it('retargetClause keeps the id and fixes operator and value', () => {
    const num = createVariable('n', 'number')
    const flag = createVariable('f', 'boolean')
    const c = { ...createClause(num.id), op: 'gte' as const, value: 3 }
    const r = retargetClause(c, flag)
    expect(r).toMatchObject({ id: c.id, variableId: flag.id, op: 'eq', value: false })
    expect(retargetClause(c, createVariable('m', 'number'))).toMatchObject({ op: 'gte', value: 3 })
  })
})

describe('text helpers', () => {
  it('wrapSelection wraps the selection and keeps it selected', () => {
    const r = wrapSelection('say hello now', 4, 9, '{b}', '{/b}')
    expect(r.text).toBe('say {b}hello{/b} now')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('hello')
  })
  it('wrapSelection with nothing selected puts the caret between the tags', () => {
    const r = wrapSelection('ab', 1, 1, '{i}', '{/i}')
    expect(r.text).toBe('a{i}{/i}b')
    expect(r.selStart).toBe(4)
    expect(r.selEnd).toBe(4)
  })
  it('wrapSelection tolerates a backwards or out-of-range selection', () => {
    expect(wrapSelection('abc', 3, 1, '[', ']').text).toBe('a[bc]')
    expect(wrapSelection('abc', 0, 99, '[', ']').text).toBe('[abc]')
  })
  it('insertAtSelection replaces the selection and moves the caret after it', () => {
    const r = insertAtSelection('Hi NAME!', 3, 7, '[courage]')
    expect(r.text).toBe('Hi [courage]!')
    expect(r.selStart).toBe(12)
    expect(r.selEnd).toBe(12)
    expect(insertAtSelection('', 0, 0, '[x]').text).toBe('[x]')
  })
})

describe('transitions', () => {
  it('lists all 16 with friendly labels', () => {
    expect(TRANSITION_OPTIONS).toHaveLength(16)
    expect(new Set(TRANSITION_OPTIONS.map((o) => o.value)).size).toBe(16)
    expect(TRANSITION_OPTIONS[0]).toEqual({ value: 'none', label: 'None' })
    expect(TRANSITION_OPTIONS.find((o) => o.value === 'hpunch')?.label).toBe('Shake sideways')
  })
})

describe('block list helpers', () => {
  const blocks = (n: number): Block[] => Array.from({ length: n }, () => createBlock('pause'))

  it('appendIndex inserts after the selection or at the end', () => {
    const b = blocks(3)
    expect(appendIndex(b, b[0].id)).toBe(1)
    expect(appendIndex(b, b[2].id)).toBe(3)
    expect(appendIndex(b, null)).toBe(3)
    expect(appendIndex(b, 'gone')).toBe(3)
  })
  it('selectionAfterDelete picks the block that takes the place, else the previous, else null', () => {
    const b = blocks(3)
    expect(selectionAfterDelete(b, 0)).toBe(b[1].id)
    expect(selectionAfterDelete(b, 2)).toBe(b[1].id)
    expect(selectionAfterDelete(blocks(1), 0)).toBeNull()
  })
  it('neighbourId clamps and handles no selection', () => {
    const b = blocks(3)
    expect(neighbourId(b, b[1].id, 1)).toBe(b[2].id)
    expect(neighbourId(b, b[2].id, 1)).toBe(b[2].id)
    expect(neighbourId(b, b[0].id, -1)).toBe(b[0].id)
    expect(neighbourId(b, null, 1)).toBe(b[0].id)
    expect(neighbourId(b, null, -1)).toBe(b[2].id)
    expect(neighbourId([], null, 1)).toBeNull()
  })
  it('dropInsertIndex', () => {
    expect(dropInsertIndex(2, false)).toBe(2)
    expect(dropInsertIndex(2, true)).toBe(3)
  })
})

describe('speaker and stage helpers', () => {
  let p: Project
  let anna: string
  let bob: string
  beforeEach(() => {
    p = createProject('T')
    const a = createCharacter('Anna')
    const b = createCharacter('Bob')
    for (const c of [a, b]) {
      p.characters[c.id] = c
      p.characterOrder.push(c.id)
    }
    anna = a.id
    bob = b.id
  })

  it('defaultSpeaker: closest earlier speaker, else the first character, else narrator', () => {
    const scene = createScene({ x: 0, y: 0 })
    scene.blocks = [
      { ...createBlock('say'), characterId: bob, text: 'a' } as Block,
      { ...createBlock('say'), characterId: null, text: 'narration' } as Block,
      createBlock('pause')
    ]
    expect(defaultSpeaker(p, scene, 3)).toBe(bob)
    expect(defaultSpeaker(p, scene, 0)).toBe(anna)
    const empty = createProject('E')
    expect(defaultSpeaker(empty, createScene({ x: 0, y: 0 }), 0)).toBeNull()
  })

  it('charactersForHide lists the ones on stage first', () => {
    const scene = p.scenes[p.startSceneId!]
    scene.blocks = [
      { ...createBlock('show'), characterId: bob, expressionId: null } as Block,
      createBlock('hide')
    ]
    const r = charactersForHide(p, scene.id, 1)
    expect(r.onStage).toEqual([bob])
    expect(r.others).toEqual([anna])
    expect(charactersForHide(p, scene.id, 0).onStage).toEqual([])
  })
})

describe('entity helpers', () => {
  it('uniqueName adds a number only when needed', () => {
    expect(uniqueName('New scene', [])).toBe('New scene')
    expect(uniqueName('New scene', ['New scene'])).toBe('New scene 2')
    expect(uniqueName('New scene', ['new scene', 'New scene 2'])).toBe('New scene 3')
  })
  it('freeSpotNear goes right of the scene and skips occupied spots', () => {
    const p = createProject('T')
    const start = p.scenes[p.startSceneId!]
    const first = freeSpotNear(p, start.position)
    expect(first.x).toBeGreaterThan(start.position.x)
    const other = createScene(first)
    p.scenes[other.id] = other
    const second = freeSpotNear(p, start.position)
    expect(second).not.toEqual(first)
    expect(second.x === first.x ? second.y > first.y : true).toBe(true)
  })
})

describe('batch undo', () => {
  beforeEach(() => {
    useProjectStore.getState().loadProject('C:/story', createProject('T'))
  })
  it('several actions inside batch() undo and redo as one step', () => {
    const S = useProjectStore.getState
    const sceneId = S().project!.startSceneId!
    const before = S().project
    batch(() => {
      const id = S().addScene({ x: 400, y: 0 }, 'Next')
      S().setExitTarget(sceneId, 'jump', id)
    })
    const after = S().project
    expect(Object.keys(after!.scenes)).toHaveLength(2)
    expect(after!.scenes[sceneId].ending).toMatchObject({ type: 'jump' })
    undo()
    expect(S().project).toEqual(before)
    redo()
    expect(S().project).toEqual(after)
  })
})
