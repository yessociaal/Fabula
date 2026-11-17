import { describe, expect, it } from 'vitest'
import { kitContext } from './helpers/kits'
import { validateProject } from '@shared/validate'
import type { Problem } from '@shared/validate'
import {
  createAsset,
  createBlock,
  createCase,
  createCharacter,
  createExpression,
  createOption,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import type { BranchCase, Block, ChoiceOption, Condition } from '@shared/model'

/** A valid, warning-free project: Start shows nothing special and ends at "Forest gate" which ends the game. */
function base() {
  const project = createProject('T')
  const start = project.scenes[project.startSceneId as string]
  start.name = 'Start'
  const gate = createScene({ x: 0, y: 200 }, 'Forest gate')
  project.scenes[gate.id] = gate
  const say = createBlock('say')
  if (say.type === 'say') say.text = 'Hello'
  start.blocks = [say]
  start.ending = { type: 'jump', target: gate.id }
  gate.blocks = [{ ...say, id: 'gate-say' }]
  gate.ending = { type: 'end' }
  const sprite = createAsset('sprite', 'Anna happy', 'sprites/a.png')
  const bg = createAsset('background', 'Forest', 'backgrounds/f.png')
  const music = createAsset('music', 'Morning', 'music/m.ogg')
  const sound = createAsset('sound', 'Door', 'sounds/d.ogg')
  for (const a of [sprite, bg, music, sound]) project.assets[a.id] = a
  const anna = createCharacter('Anna')
  const happy = createExpression('Happy', sprite.id)
  anna.expressions.push(happy)
  project.characters[anna.id] = anna
  project.characterOrder.push(anna.id)
  const num = createVariable('Courage', 'number')
  const flag = createVariable('Has key', 'boolean')
  for (const v of [num, flag]) {
    project.variables[v.id] = v
    project.variableOrder.push(v.id)
  }
  return { project, start, gate, sprite, bg, music, sound, anna, happy, num, flag }
}
type Base = ReturnType<typeof base>

/** Make everything in `base` used so unused warnings are silent. */
function useAll(b: Base): void {
  const blocks: Block[] = [
    { ...createBlock('background'), assetId: b.bg.id } as Block,
    { ...createBlock('show'), characterId: b.anna.id, expressionId: b.happy.id } as Block,
    { ...createBlock('playMusic'), assetId: b.music.id } as Block,
    { ...createBlock('playSound'), assetId: b.sound.id } as Block,
    { ...createBlock('setVariable'), effect: { variableId: b.num.id, op: 'add', value: 1 } } as Block,
    { ...createBlock('setVariable'), effect: { variableId: b.flag.id, op: 'set', value: true } } as Block
  ]
  b.start.blocks.push(...blocks)
}

const errors = (p: Problem[]): Problem[] => p.filter((x) => x.severity === 'error')
const warnings = (p: Problem[]): Problem[] => p.filter((x) => x.severity === 'warning')
const has = (p: Problem[], re: RegExp): boolean => p.some((x) => re.test(x.message))

function cond(variableId: string | null, op: 'eq' | 'gt' = 'eq', value: boolean | number | string = true): Condition {
  return { join: 'and', clauses: [{ id: 'cl', variableId, op, value }] }
}

describe('a clean project', () => {
  it('has no errors and no warnings', () => {
    const b = base()
    useAll(b)
    expect(validateProject(b.project)).toEqual([])
  })
})

describe('errors', () => {
  it('no start scene', () => {
    const b = base()
    useAll(b)
    b.project.startSceneId = null
    expect(has(validateProject(b.project), /no start scene/)).toBe(true)
    b.project.startSceneId = b.start.id
    expect(has(validateProject(b.project), /no start scene/)).toBe(false)
  })

  it('jump with no target (message names the scene)', () => {
    const b = base()
    useAll(b)
    b.start.ending = { type: 'jump', target: null }
    const p = errors(validateProject(b.project))
    expect(p).toHaveLength(1)
    expect(p[0].message).toContain('"Start"')
    expect(p[0].exitId).toBe('jump')
    expect(p[0].sceneId).toBe(b.start.id)
    b.start.ending = { type: 'jump', target: b.gate.id }
    expect(errors(validateProject(b.project))).toHaveLength(0)
  })

  it('jump to a deleted scene counts as no target', () => {
    const b = base()
    useAll(b)
    b.start.ending = { type: 'jump', target: 'gone' }
    expect(errors(validateProject(b.project))).toHaveLength(1)
  })

  it('choice option with no target, naming the option', () => {
    const b = base()
    useAll(b)
    const option: ChoiceOption = { ...createOption('Use the key'), target: null }
    b.gate.ending = { type: 'choice', prompt: null, options: [option] }
    const p = errors(validateProject(b.project))
    expect(p).toHaveLength(1)
    expect(p[0].message).toBe(
      `"Forest gate": the choice "Use the key" doesn't lead anywhere. Drag its dot to a scene.`
    )
    expect(p[0].exitId).toBe(`opt:${option.id}`)
    option.target = b.start.id
    expect(errors(validateProject(b.project))).toHaveLength(0)
  })

  it('branch case and else with no target', () => {
    const b = base()
    useAll(b)
    const c: BranchCase = { ...createCase(), target: null }
    c.condition = cond(b.flag.id)
    b.gate.ending = { type: 'branch', cases: [c], elseTarget: null }
    const p = errors(validateProject(b.project))
    expect(p.map((x) => x.exitId)).toEqual([`case:${c.id}`, 'else'])
    c.target = b.start.id
    b.gate.ending = { type: 'branch', cases: [c], elseTarget: b.start.id }
    expect(errors(validateProject(b.project))).toHaveLength(0)
  })

  it('choice ending with zero options', () => {
    const b = base()
    useAll(b)
    b.gate.ending = { type: 'choice', prompt: null, options: [] }
    expect(has(errors(validateProject(b.project)), /"Forest gate": the choice has no options/)).toBe(true)
    b.gate.ending = { type: 'choice', prompt: null, options: [{ ...createOption('Go'), target: b.start.id }] }
    expect(has(errors(validateProject(b.project)), /no options/)).toBe(false)
  })

  it('option with empty text', () => {
    const b = base()
    useAll(b)
    b.gate.ending = { type: 'choice', prompt: null, options: [{ ...createOption('  '), target: b.start.id }] }
    expect(has(errors(validateProject(b.project)), /an option has no text/)).toBe(true)
    b.gate.ending = { type: 'choice', prompt: null, options: [{ ...createOption('Go'), target: b.start.id }] }
    expect(has(errors(validateProject(b.project)), /no text/)).toBe(false)
  })

  it('branch with zero cases', () => {
    const b = base()
    useAll(b)
    b.gate.ending = { type: 'branch', cases: [], elseTarget: b.start.id }
    expect(has(errors(validateProject(b.project)), /"Forest gate": the "If" ending has no cases/)).toBe(true)
    const c = { ...createCase(), target: b.start.id }
    c.condition = cond(b.flag.id)
    b.gate.ending = { type: 'branch', cases: [c], elseTarget: b.start.id }
    expect(has(errors(validateProject(b.project)), /no cases/)).toBe(false)
  })

  describe('block missing a required pick', () => {
    const missing = (mutate: (b: Base) => Block): Problem[] => {
      const b = base()
      useAll(b)
      const block = mutate(b)
      b.gate.blocks.push(block)
      return errors(validateProject(b.project))
    }

    it('show without character', () => {
      const p = missing((b) => ({ ...createBlock('show'), expressionId: b.happy.id }) as Block)
      expect(p).toHaveLength(1)
      expect(p[0].message).toContain('"Forest gate"')
      expect(p[0].blockId).toBeDefined()
    })
    it('show without expression', () => {
      expect(missing((b) => ({ ...createBlock('show'), characterId: b.anna.id }) as Block)).toHaveLength(1)
    })
    it('show with both is fine', () => {
      expect(
        missing((b) => ({ ...createBlock('show'), characterId: b.anna.id, expressionId: b.happy.id }) as Block)
      ).toHaveLength(0)
    })
    it('playMusic without asset', () => {
      expect(missing(() => createBlock('playMusic'))).toHaveLength(1)
      expect(missing((b) => ({ ...createBlock('playMusic'), assetId: b.music.id }) as Block)).toHaveLength(0)
    })
    it('playSound without asset', () => {
      expect(missing(() => createBlock('playSound'))).toHaveLength(1)
      expect(missing((b) => ({ ...createBlock('playSound'), assetId: b.sound.id }) as Block)).toHaveLength(0)
    })
    it('setVariable without variable', () => {
      expect(missing(() => createBlock('setVariable'))).toHaveLength(1)
      expect(
        missing(
          (b) => ({ ...createBlock('setVariable'), effect: { variableId: b.flag.id, op: 'set', value: false } }) as Block
        )
      ).toHaveLength(0)
    })
    it('condition clause without variable (option and case)', () => {
      const b = base()
      useAll(b)
      b.gate.ending = {
        type: 'choice',
        prompt: null,
        options: [{ ...createOption('Go'), condition: cond(null), target: b.start.id }]
      }
      expect(has(errors(validateProject(b.project)), /condition with no variable/)).toBe(true)
      const c = { ...createCase(), target: b.start.id }
      c.condition = cond(null)
      b.gate.ending = { type: 'branch', cases: [c], elseTarget: b.start.id }
      expect(has(errors(validateProject(b.project)), /condition with no variable/)).toBe(true)
      c.condition = cond(b.flag.id)
      expect(has(errors(validateProject(b.project)), /condition with no variable/)).toBe(false)
    })
  })

  it('expression without an image that a show block uses', () => {
    const b = base()
    useAll(b)
    const blank = createExpression('Blank', null)
    b.anna.expressions.push(blank)
    const show = { ...createBlock('show'), characterId: b.anna.id, expressionId: blank.id } as Block
    expect(has(errors(validateProject(b.project)), /has no image/)).toBe(false)
    b.gate.blocks.push(show)
    const p = errors(validateProject(b.project))
    expect(p).toHaveLength(1)
    expect(p[0].message).toContain('Blank')
    expect(p[0].message).toContain('"Forest gate"')
  })

  describe('value type not matching the variable type', () => {
    it('setVariable set', () => {
      const b = base()
      useAll(b)
      const blocks = (value: boolean | number | string): Block[] => [
        { ...createBlock('setVariable'), effect: { variableId: b.num.id, op: 'set', value } } as Block
      ]
      b.gate.blocks = blocks('five')
      expect(has(errors(validateProject(b.project)), /sets "Courage" to a value that is not a number/)).toBe(true)
      b.gate.blocks = blocks(5)
      expect(errors(validateProject(b.project))).toHaveLength(0)
    })
    it('add needs a number variable', () => {
      const b = base()
      useAll(b)
      b.gate.blocks = [
        { ...createBlock('setVariable'), effect: { variableId: b.flag.id, op: 'add', value: 1 } } as Block
      ]
      expect(errors(validateProject(b.project))).toHaveLength(1)
    })
    it('condition clause value', () => {
      const b = base()
      useAll(b)
      const c = { ...createCase(), target: b.start.id }
      c.condition = cond(b.flag.id, 'eq', 3)
      b.gate.ending = { type: 'branch', cases: [c], elseTarget: b.start.id }
      expect(has(errors(validateProject(b.project)), /compares "Has key" with a value that is not a true\/false/)).toBe(true)
      c.condition = cond(b.flag.id, 'eq', false)
      expect(errors(validateProject(b.project))).toHaveLength(0)
    })
    it('choice option effect', () => {
      const b = base()
      useAll(b)
      const option: ChoiceOption = {
        ...createOption('Go'),
        target: b.start.id,
        effects: [{ variableId: b.num.id, op: 'set', value: true }]
      }
      b.gate.ending = { type: 'choice', prompt: null, options: [option] }
      expect(has(errors(validateProject(b.project)), /not a number/)).toBe(true)
      option.effects[0].value = 2
      expect(errors(validateProject(b.project))).toHaveLength(0)
    })
  })

  it('empty character name', () => {
    const b = base()
    useAll(b)
    b.anna.name = '  '
    expect(has(errors(validateProject(b.project)), /character has no name/)).toBe(true)
    b.anna.name = 'Anna'
    expect(has(errors(validateProject(b.project)), /character has no name/)).toBe(false)
  })

  it('empty variable name', () => {
    const b = base()
    useAll(b)
    b.num.name = ''
    expect(has(errors(validateProject(b.project)), /variable has no name/)).toBe(true)
    b.num.name = 'Courage'
    expect(has(errors(validateProject(b.project)), /variable has no name/)).toBe(false)
  })
})

describe('warnings', () => {
  it('scene unreachable from start', () => {
    const b = base()
    useAll(b)
    const lost = createScene({ x: 500, y: 0 }, 'Lost')
    lost.blocks = [{ ...createBlock('say'), text: 'x' } as Block]
    lost.ending = { type: 'end' }
    b.project.scenes[lost.id] = lost
    const w = warnings(validateProject(b.project))
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('"Lost"')
    b.gate.ending = { type: 'jump', target: lost.id }
    expect(warnings(validateProject(b.project))).toHaveLength(0)
  })

  it('empty dialogue text', () => {
    const b = base()
    useAll(b)
    b.gate.blocks = [createBlock('say')]
    const w = warnings(validateProject(b.project))
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('"Forest gate"')
    expect(w[0].message).toContain('empty')
    b.gate.blocks = [{ ...createBlock('say'), text: 'Hi' } as Block]
    expect(warnings(validateProject(b.project))).toHaveLength(0)
  })

  it('every option of a choice is conditional', () => {
    const b = base()
    useAll(b)
    const guarded = { ...createOption('A'), condition: cond(b.flag.id), target: b.start.id }
    const plain = { ...createOption('B'), target: b.start.id }
    b.gate.ending = { type: 'choice', prompt: null, options: [guarded, plain] }
    expect(has(warnings(validateProject(b.project)), /every option/)).toBe(false)
    b.gate.ending = { type: 'choice', prompt: null, options: [guarded] }
    expect(has(warnings(validateProject(b.project)), /every option/)).toBe(true)
  })

  it('show of a character already on stage in the same position and expression', () => {
    const b = base()
    useAll(b)
    const show = (position: 'left' | 'right'): Block =>
      ({ ...createBlock('show'), characterId: b.anna.id, expressionId: b.happy.id, position }) as Block
    b.gate.blocks = [show('left'), show('left')]
    expect(has(warnings(validateProject(b.project)), /already on stage/)).toBe(true)
    b.gate.blocks = [show('left'), show('right')]
    expect(has(warnings(validateProject(b.project)), /already on stage/)).toBe(false)
    b.gate.blocks = [show('left'), { ...createBlock('hide'), characterId: b.anna.id } as Block, show('left')]
    expect(has(warnings(validateProject(b.project)), /already on stage/)).toBe(false)
    b.gate.blocks = [show('left'), { ...createBlock('background') } as Block, show('left')]
    expect(has(warnings(validateProject(b.project)), /already on stage/)).toBe(false)
  })

  it('unused asset, character and variable', () => {
    const b = base()
    expect(has(warnings(validateProject(b.project)), /file "Forest" is not used/)).toBe(true)
    expect(has(warnings(validateProject(b.project)), /character "Anna" is never used/)).toBe(true)
    expect(has(warnings(validateProject(b.project)), /variable "Courage" is never used/)).toBe(true)
    useAll(b)
    const w = validateProject(b.project)
    expect(has(w, /is not used/)).toBe(false)
    expect(has(w, /never used/)).toBe(false)
  })

  it('a variable used only in a condition counts as used; a character used only as a prompt speaker too', () => {
    const b = base()
    useAll(b)
    const extra = createVariable('Extra', 'boolean')
    b.project.variables[extra.id] = extra
    b.project.variableOrder.push(extra.id)
    const who = createCharacter('Bea')
    b.project.characters[who.id] = who
    b.project.characterOrder.push(who.id)
    expect(warnings(validateProject(b.project))).toHaveLength(2)
    b.gate.ending = {
      type: 'choice',
      prompt: { characterId: who.id, text: 'Well?' },
      options: [{ ...createOption('Go'), condition: cond(extra.id), target: b.start.id }]
    }
    expect(has(warnings(validateProject(b.project)), /Extra|Bea/)).toBe(false)
  })

  it('scene with no blocks', () => {
    const b = base()
    useAll(b)
    b.gate.blocks = []
    const w = warnings(validateProject(b.project))
    expect(w).toHaveLength(1)
    expect(w[0].message).toBe('"Forest gate": this scene has no blocks.')
    b.gate.blocks = [{ ...createBlock('say'), text: 'x' } as Block]
    expect(warnings(validateProject(b.project))).toHaveLength(0)
  })
})

describe('the demo fixture', () => {
  it('has only the deliberate dangling Otherwise exit of the second Gate', async () => {
    const { readFileSync } = await import('node:fs')
    const { parseProject } = await import('@shared/schema')
    const parsed = parseProject(readFileSync(new URL('./fixtures/demo.fabula.json', import.meta.url), 'utf8'))
    if (!parsed.ok) throw new Error(parsed.error)
    expect(errors(validateProject(parsed.project, kitContext())).map((p) => [p.sceneId, p.exitId])).toEqual([['s_gate2', 'else']])
  })
})

