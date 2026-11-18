import { describe, expect, it } from 'vitest'
import { applyEffect, NOWHERE_NOTICE, start, step, type PlayState } from '@shared/interpreter'
import { createBlock, createCondition, createOption, createProject, createScene, createVariable } from '@shared/factory'
import type { Block, Condition, Effect, Ending, Id, Project, Variable } from '@shared/model'

type Of<T extends Block['type']> = Extract<Block, { type: T }>

const say = (characterId: string | null, text: string): Block => ({ ...(createBlock('say') as Of<'say'>), characterId, text })
const bg = (assetId: string | null): Block => ({ ...(createBlock('background') as Of<'background'>), assetId })
const show = (characterId: string, expressionId: string): Block => ({ ...(createBlock('show') as Of<'show'>), characterId, expressionId })
const hide = (characterId: string): Block => ({ ...(createBlock('hide') as Of<'hide'>), characterId })
const pause = (seconds: number | null): Block => ({ ...(createBlock('pause') as Of<'pause'>), seconds })
const music = (assetId: string | null, loop = true): Block => ({ ...(createBlock('playMusic') as Of<'playMusic'>), assetId, loop })
const sound = (assetId: string): Block => ({ ...(createBlock('playSound') as Of<'playSound'>), assetId })
const setVar = (effect: Effect): Block => ({ ...(createBlock('setVariable') as Of<'setVariable'>), effect })
const eff = (variableId: string, op: Effect['op'], value: Effect['value']): Effect => ({ variableId, op, value })
const when = (variableId: string, op: 'eq' | 'gte', value: boolean | number): Condition => {
  const c = createCondition()
  c.clauses = [{ id: 'cl' + variableId + op, variableId, op, value }]
  return c
}

interface World {
  p: Project
  /** Add a scene. The first one added reuses the project's start scene. */
  add(name: string, blocks: Block[], ending: Ending): Id
  variable(name: string, type: Variable['type'], defaultValue?: Variable['defaultValue']): Id
}

function world(): World {
  const p = createProject('T')
  const startId = p.startSceneId!
  let first = true
  return {
    p,
    add(name, blocks, ending) {
      if (first) {
        first = false
        const s = p.scenes[startId]
        s.name = name
        s.blocks = blocks
        s.ending = ending
        return startId
      }
      const s = createScene({ x: 0, y: 0 }, name)
      s.blocks = blocks
      s.ending = ending
      p.scenes[s.id] = s
      return s.id
    },
    variable(name, type, defaultValue) {
      const v = createVariable(name, type)
      if (defaultValue !== undefined) v.defaultValue = defaultValue
      p.variables[v.id] = v
      p.variableOrder.push(v.id)
      return v.id
    }
  }
}

const advance = (p: Project, s: PlayState): PlayState => step(p, s, { type: 'advance' })

describe('interpreter', () => {
  it('runs a linear scene, pausing on every say, then follows a jump', () => {
    const w = world()
    const a = w.add('A', [say(null, 'one'), say(null, 'two')], { type: 'end' })
    const b = w.add('B', [say(null, 'second')], { type: 'end' })
    w.p.scenes[a].ending = { type: 'jump', target: b }
    let s = start(w.p, a)
    expect(s.line?.text).toBe('one')
    expect(s.status).toBe('running')
    s = advance(w.p, s)
    expect(s.line?.text).toBe('two')
    s = advance(w.p, s)
    expect(s.line?.text).toBe('second')
    expect(s.history).toEqual(['A', 'B'])
    s = advance(w.p, s)
    expect(s.status).toBe('ended')
    expect(s.notice).toBeNull()
  })

  it('a say block pauses; wrong inputs and inputs after the end change nothing', () => {
    const w = world()
    const a = w.add('A', [say(null, 'hi')], { type: 'end' })
    const s0 = start(w.p, a)
    expect(s0.line?.text).toBe('hi')
    expect(step(w.p, s0, { type: 'choose', optionId: 'x' })).toBe(s0)
    const ended = advance(w.p, s0)
    expect(ended.status).toBe('ended')
    expect(advance(w.p, ended)).toBe(ended)
  })

  it('background clears sprites; show replaces the same character; hide removes', () => {
    const w = world()
    const a = w.add(
      'A',
      [bg('b1'), show('c1', 'e1'), show('c2', 'e2'), show('c1', 'e3'), say(null, 'x'), hide('c2'), say(null, 'y'), bg('b2'), say(null, 'z')],
      { type: 'end' }
    )
    let s = start(w.p, a)
    expect(s.stage.background).toBe('b1')
    expect(s.stage.sprites.map((x) => [x.characterId, x.expressionId])).toEqual([
      ['c1', 'e3'],
      ['c2', 'e2']
    ])
    s = advance(w.p, s)
    expect(s.stage.sprites.map((x) => x.characterId)).toEqual(['c1'])
    s = advance(w.p, s)
    expect(s.stage.background).toBe('b2')
    expect(s.stage.sprites).toEqual([])
  })

  it('pause with seconds and pause until click both wait', () => {
    const w = world()
    const a = w.add('A', [pause(1.5), pause(null), say(null, 'after')], { type: 'end' })
    let s = start(w.p, a)
    expect(s.pause).toEqual({ seconds: 1.5 })
    s = advance(w.p, s)
    expect(s.pause).toEqual({ seconds: null })
    s = advance(w.p, s)
    expect(s.pause).toBeNull()
    expect(s.line?.text).toBe('after')
  })

  it('music and sound update state', () => {
    const w = world()
    const a = w.add('A', [music('m1', false), sound('s1'), say(null, 'x'), sound('s1'), say(null, 'y')], { type: 'end' })
    let s = start(w.p, a)
    expect(s.stage.music).toBe('m1')
    expect(s.musicLoop).toBe(false)
    expect(s.sound).toBe('s1')
    expect(s.soundSeq).toBe(1)
    s = advance(w.p, s)
    expect(s.soundSeq).toBe(2)
  })

  it('choice: applies the effect of the picked option and follows its target', () => {
    const w = world()
    const courage = w.variable('courage', 'number', 1)
    const a = w.add('Start', [say(null, 'Pick')], { type: 'end' })
    const left = w.add('Left', [say(null, 'left')], { type: 'end' })
    const opt = createOption('Go left')
    opt.effects = [eff(courage, 'add', 2)]
    opt.target = left
    w.p.scenes[a].ending = { type: 'choice', prompt: { characterId: null, text: 'Which?' }, options: [opt] }
    let s = start(w.p, a)
    expect(s.line?.text).toBe('Pick')
    s = advance(w.p, s)
    expect(s.menu).toEqual([{ id: opt.id, text: 'Go left' }])
    expect(s.line?.text).toBe('Which?')
    expect(advance(w.p, s)).toBe(s)
    s = step(w.p, s, { type: 'choose', optionId: opt.id })
    expect(s.variables[courage]).toBe(3)
    expect(s.line?.text).toBe('left')
    expect(s.menu).toBeNull()
  })

  it('hides options whose condition is false and shows them when it is true', () => {
    const w = world()
    const hasKey = w.variable('has_key', 'boolean', false)
    const a = w.add('Start', [], { type: 'end' })
    const gate = w.add('Gate', [say(null, 'gate')], { type: 'end' })
    const plain = createOption('Walk')
    plain.target = gate
    const keyed = createOption('Use the key')
    keyed.condition = when(hasKey, 'eq', true)
    keyed.target = gate
    w.p.scenes[a].ending = { type: 'choice', prompt: null, options: [plain, keyed] }
    let s = start(w.p, a)
    expect(s.menu?.map((o) => o.text)).toEqual(['Walk'])
    expect(s.line).toBeNull()
    expect(step(w.p, s, { type: 'choose', optionId: keyed.id })).toBe(s)
    w.p.variables[hasKey].defaultValue = true
    s = start(w.p, a)
    expect(s.menu?.map((o) => o.text)).toEqual(['Walk', 'Use the key'])
  })

  it('a choice whose options are all hidden ends with a notice', () => {
    const w = world()
    const v = w.variable('v', 'boolean', false)
    const a = w.add('Start', [], { type: 'end' })
    const o = createOption('Never')
    o.condition = when(v, 'eq', true)
    w.p.scenes[a].ending = { type: 'choice', prompt: null, options: [o] }
    const s = start(w.p, a)
    expect(s.status).toBe('ended')
    expect(s.notice).toBe('No choices are available')
  })

  it('branch takes the first true case, otherwise the else target', () => {
    const w = world()
    const n = w.variable('n', 'number', 5)
    const a = w.add('Start', [], { type: 'end' })
    const big = w.add('Big', [say(null, 'big')], { type: 'end' })
    const mid = w.add('Mid', [say(null, 'mid')], { type: 'end' })
    const small = w.add('Small', [say(null, 'small')], { type: 'end' })
    w.p.scenes[a].ending = {
      type: 'branch',
      cases: [
        { id: 'k1', condition: when(n, 'gte', 10), target: big },
        { id: 'k2', condition: when(n, 'gte', 5), target: mid }
      ],
      elseTarget: small
    }
    expect(start(w.p, a).line?.text).toBe('mid')
    w.p.variables[n].defaultValue = 50
    expect(start(w.p, a).line?.text).toBe('big')
    w.p.variables[n].defaultValue = 1
    expect(start(w.p, a).line?.text).toBe('small')
  })

  it('end finishes the story with no notice', () => {
    const w = world()
    const a = w.add('Start', [], { type: 'end' })
    const s = start(w.p, a)
    expect(s.status).toBe('ended')
    expect(s.notice).toBeNull()
    expect(s.line).toBeNull()
  })

  it('an exit with no target ends with the "goes nowhere" notice', () => {
    const w = world()
    const a = w.add('Start', [say(null, 'a')], { type: 'jump', target: null })
    const s = advance(w.p, start(w.p, a))
    expect(s.status).toBe('ended')
    expect(s.notice).toBe(NOWHERE_NOTICE)
  })

  it('an exit pointing at a deleted scene also ends with the notice', () => {
    const w = world()
    const a = w.add('Start', [], { type: 'jump', target: 'gone' })
    expect(start(w.p, a).notice).toBe(NOWHERE_NOTICE)
  })

  it('a loop that never waits is stopped', () => {
    const w = world()
    const a = w.add('Start', [], { type: 'end' })
    w.p.scenes[a].ending = { type: 'jump', target: a }
    const s = start(w.p, a)
    expect(s.status).toBe('ended')
    expect(s.notice).toMatch(/loops/)
  })

  it('variables start at their defaults and set / add / subtract / toggle work', () => {
    const w = world()
    const n = w.variable('n', 'number', 10)
    const flag = w.variable('flag', 'boolean', false)
    const txt = w.variable('txt', 'text', 'a')
    const a = w.add(
      'Start',
      [
        setVar(eff(n, 'add', 5)),
        setVar(eff(n, 'subtract', 3)),
        setVar(eff(flag, 'toggle', true)),
        setVar(eff(txt, 'set', 'hello')),
        say(null, 'x'),
        setVar(eff(n, 'set', 0)),
        setVar(eff(flag, 'toggle', true)),
        say(null, 'y')
      ],
      { type: 'end' }
    )
    let s = start(w.p, a)
    expect(s.variables).toEqual({ [n]: 12, [flag]: true, [txt]: 'hello' })
    s = advance(w.p, s)
    expect(s.variables).toEqual({ [n]: 0, [flag]: false, [txt]: 'hello' })
    expect(w.p.variables[n].defaultValue).toBe(10)
  })

  it('applyEffect ignores unknown variables and type mismatches', () => {
    const values = { a: 1, b: true }
    expect(applyEffect(values, eff('zzz', 'set', 1))).toBe(values)
    expect(applyEffect(values, { variableId: null, op: 'set', value: 1 })).toBe(values)
    expect(applyEffect(values, eff('a', 'toggle', true))).toBe(values)
    expect(applyEffect(values, eff('b', 'add', 1))).toBe(values)
  })

  it('is deterministic and never mutates its input state', () => {
    const w = world()
    const n = w.variable('n', 'number', 0)
    const a = w.add('Start', [bg('b'), show('c', 'e'), say(null, 'a'), setVar(eff(n, 'add', 1)), say(null, 'b')], { type: 'end' })
    const s0 = start(w.p, a)
    const frozen = JSON.stringify(s0)
    const x = advance(w.p, s0)
    const y = advance(w.p, s0)
    expect(JSON.stringify(s0)).toBe(frozen)
    expect(JSON.stringify(x)).toBe(JSON.stringify(y))
    expect(JSON.stringify(start(w.p, a))).toBe(frozen)
  })

  it('skips extended blocks and ends with a notice on an ending it does not know', () => {
    const w = world()
    const a = w.add('Start', [{ id: 'x', type: 'code', code: 'pass' }, say(null, 'after')], { type: 'mystery' } as never)
    let s = start(w.p, a)
    expect(s.line?.text).toBe('after')
    s = advance(w.p, s)
    expect(s.status).toBe('ended')
    expect(s.notice).toMatch(/kind of ending/)
  })

  it('starting from a missing scene ends with the notice', () => {
    const w = world()
    expect(start(w.p, null).notice).toBe(NOWHERE_NOTICE)
  })
})
