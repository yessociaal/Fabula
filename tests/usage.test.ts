import { describe, expect, it } from 'vitest'
import {
  createAsset,
  createBlock,
  createCase,
  createCharacter,
  createClause,
  createCondition,
  createExpression,
  createOption,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import type { Block, Project, Scene } from '@shared/model'
import { countUsage, findUsage, outsideScenes, scenesUsing } from '@shared/usage'

function setup() {
  const p: Project = createProject('T')
  const scene: Scene = createScene({ x: 0, y: 0 }, 'Forest')
  const other: Scene = createScene({ x: 0, y: 0 }, 'Cellar')
  p.scenes[scene.id] = scene
  p.scenes[other.id] = other
  const anna = createCharacter('Anna')
  const sprite = createAsset('sprite', 'happy', 'sprites/a.png')
  const expr = createExpression('happy', sprite.id)
  anna.expressions.push(expr)
  p.characters[anna.id] = anna
  p.characterOrder.push(anna.id)
  p.assets[sprite.id] = sprite
  const v = createVariable('courage', 'number')
  p.variables[v.id] = v
  p.variableOrder.push(v.id)
  return { p, scene, other, anna, sprite, expr, v }
}

describe('findUsage', () => {
  it('is empty for an empty project', () => {
    const u = findUsage(createProject('T'))
    expect(u).toEqual({ assets: {}, characters: {}, variables: {} })
    expect(countUsage(undefined)).toBe(0)
  })

  it('finds asset use in background, music, sound, movie and voice blocks', () => {
    const { p, scene } = setup()
    const bg = createAsset('background', 'Forest', 'backgrounds/f.png')
    const song = createAsset('music', 'Song', 'music/s.ogg')
    const door = createAsset('sound', 'Door', 'sounds/d.ogg')
    const voice = createAsset('voice', 'Line', 'voice/v.ogg')
    const movie = createAsset('movie', 'Intro', 'movies/m.webm')
    for (const a of [bg, song, door, voice, movie]) p.assets[a.id] = a
    const b = createBlock('background') as Extract<Block, { type: 'background' }>
    b.assetId = bg.id
    const m = createBlock('playMusic') as Extract<Block, { type: 'playMusic' }>
    m.assetId = song.id
    const s = createBlock('playSound') as Extract<Block, { type: 'playSound' }>
    s.assetId = door.id
    const say = createBlock('say') as Extract<Block, { type: 'say' }>
    say.voiceAssetId = voice.id
    const mv = { id: 'mv', type: 'movie', assetId: movie.id } as Block
    scene.blocks.push(b, m, s, say, mv)
    const u = findUsage(p)
    for (const a of [bg, song, door, voice, movie]) {
      expect(u.assets[a.id]).toHaveLength(1)
      expect(u.assets[a.id][0].sceneId).toBe(scene.id)
      expect(u.assets[a.id][0].sceneName).toBe('Forest')
    }
    expect(u.assets[bg.id][0].blockId).toBe(b.id)
  })

  it('counts a show block as use of the expression image, and of the character', () => {
    const { p, scene, anna, expr, sprite } = setup()
    const show = createBlock('show') as Extract<Block, { type: 'show' }>
    show.characterId = anna.id
    show.expressionId = expr.id
    scene.blocks.push(show)
    const u = findUsage(p)
    const spriteRefs = u.assets[sprite.id]
    // the expression itself (outside scenes) plus the show block
    expect(spriteRefs).toHaveLength(2)
    expect(outsideScenes(spriteRefs)).toHaveLength(1)
    expect(scenesUsing(spriteRefs)).toEqual([{ id: scene.id, name: 'Forest' }])
    expect(u.characters[anna.id]).toHaveLength(1)
  })

  it('finds character use in say, hide, inline choice prompt and choice ending prompt', () => {
    const { p, scene, other, anna } = setup()
    const say = createBlock('say') as Extract<Block, { type: 'say' }>
    say.characterId = anna.id
    say.text = 'Hello there'
    const hide = createBlock('hide') as Extract<Block, { type: 'hide' }>
    hide.characterId = anna.id
    const inline = {
      id: 'ic',
      type: 'inlineChoice',
      prompt: { characterId: anna.id, text: 'Pick' },
      options: []
    } as Block
    scene.blocks.push(say, hide, inline)
    other.ending = { type: 'choice', prompt: { characterId: anna.id, text: '?' }, options: [] }
    const refs = findUsage(p).characters[anna.id]
    expect(refs).toHaveLength(4)
    expect(refs[0].description).toContain('Hello there')
    expect(scenesUsing(refs).map((s) => s.name)).toEqual(['Forest', 'Cellar'])
  })

  it('finds variable use in effects, conditions, ask blocks and screen bars', () => {
    const { p, scene, other, v } = setup()
    const set = createBlock('setVariable') as Extract<Block, { type: 'setVariable' }>
    set.effect.variableId = v.id
    const ask = { id: 'a', type: 'ask', variableId: v.id, prompt: '', defaultText: '', maxLength: 10 } as Block
    scene.blocks.push(set, ask)
    const opt = createOption('Go')
    opt.condition = { join: 'and', clauses: [createClause(v.id)] }
    opt.effects.push({ variableId: v.id, op: 'add', value: 1 })
    other.ending = { type: 'choice', prompt: null, options: [opt] }
    const refs = findUsage(p).variables[v.id]
    // set block, ask block, option condition, option effect
    expect(refs).toHaveLength(4)
    expect(refs.some((r) => r.optionId === opt.id)).toBe(true)

    const c = createCase()
    c.condition = { join: 'or', clauses: [createClause(v.id), createClause(v.id)] }
    other.ending = { type: 'branch', cases: [c], elseTarget: null }
    expect(findUsage(p).variables[v.id].filter((r) => r.caseId === c.id)).toHaveLength(2)

    p.screens.s1 = {
      id: 's1',
      name: 'Hud',
      modal: false,
      elements: [
        { id: 'e1', name: 'trust', x: 0, y: 0, w: 1, h: 1, type: 'bar', variableId: v.id, max: 10 },
        {
          id: 'e2',
          name: 'plus',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          type: 'button',
          text: '+',
          action: { type: 'setVariable', effect: { variableId: v.id, op: 'add', value: 1 } }
        }
      ]
    }
    const withScreen = findUsage(p).variables[v.id]
    expect(outsideScenes(withScreen)).toHaveLength(2)
  })

  it('finds nested uses inside if and inline choice blocks, and conditions there', () => {
    const { p, scene, anna, v } = setup()
    const innerSay = createBlock('say') as Extract<Block, { type: 'say' }>
    innerSay.characterId = anna.id
    const innerSet = createBlock('setVariable') as Extract<Block, { type: 'setVariable' }>
    innerSet.effect.variableId = v.id
    const cond = createCondition()
    cond.clauses[0].variableId = v.id
    const ifBlock = { id: 'if', type: 'if', condition: cond, then: [innerSay], otherwise: [innerSet] } as Block
    const optCond = createCondition()
    optCond.clauses[0].variableId = v.id
    const deepSay = createBlock('say') as Extract<Block, { type: 'say' }>
    deepSay.characterId = anna.id
    const inline = {
      id: 'ic',
      type: 'inlineChoice',
      prompt: null,
      options: [{ id: 'o1', text: 'Yes', condition: optCond, blocks: [ifBlock, deepSay] }]
    } as Block
    scene.blocks.push(inline)
    const u = findUsage(p)
    expect(u.characters[anna.id]).toHaveLength(2)
    // option condition + if condition + effect inside otherwise
    expect(u.variables[v.id]).toHaveLength(3)
  })

  it('tolerates unknown block types that carry nested block lists', () => {
    const { p, scene, anna } = setup()
    const say = createBlock('say') as Extract<Block, { type: 'say' }>
    say.characterId = anna.id
    const odd = { id: 'x', type: 'future', blocks: [say] } as unknown as Block
    scene.blocks.push(odd)
    expect(findUsage(p).characters[anna.id]).toHaveLength(1)
  })

  it('finds asset use by side image, screen elements and fonts', () => {
    const { p, anna } = setup()
    const side = createAsset('sprite', 'side', 'sprites/s.png')
    const font = createAsset('font', 'Font', 'fonts/f.ttf')
    const ui = createAsset('ui', 'Door', 'ui/d.png')
    for (const a of [side, font, ui]) p.assets[a.id] = a
    anna.sideAssetId = side.id
    p.screens.s1 = {
      id: 's1',
      name: 'Desk',
      modal: true,
      elements: [
        { id: 'i', name: 'bg', x: 0, y: 0, w: 1, h: 1, type: 'image', assetId: ui.id },
        { id: 't', name: 'label', x: 0, y: 0, w: 1, h: 1, type: 'text', text: 'x', size: 12, color: '#fff', fontAssetId: font.id },
        { id: 'b', name: 'door', x: 0, y: 0, w: 1, h: 1, type: 'imageButton', idleAssetId: ui.id, hoverAssetId: null, action: { type: 'leave' } }
      ]
    }
    const u = findUsage(p)
    expect(u.assets[side.id]).toHaveLength(1)
    expect(u.assets[font.id]).toHaveLength(1)
    expect(u.assets[ui.id]).toHaveLength(2)
  })

  it('ignores null references and missing ids', () => {
    const { p, scene } = setup()
    scene.blocks.push(createBlock('background'), createBlock('say'), createBlock('show'))
    const u = findUsage(p)
    expect(Object.keys(u.characters)).toHaveLength(0)
    expect(Object.keys(u.variables)).toHaveLength(0)
  })
})
