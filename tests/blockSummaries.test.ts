import { describe, expect, it } from 'vitest'
import { createAsset, createBlock, createCharacter, createExpression, createProject, createVariable } from '@shared/factory'
import type { Block, CoreBlockType, Project } from '@shared/model'
import { MAX_SUMMARY_TEXT, describeEffect, oneLine, summarizeBlock, summaryText } from '../src/renderer/views/SceneEditor/blockSummaries'

function world(): { p: Project; anna: string; happy: string; forest: string; morning: string; door: string; courage: string; key: string } {
  const p = createProject('T')
  const anna = createCharacter('Anna')
  const happy = createExpression('Happy', 'a_happy')
  anna.expressions.push(happy)
  p.characters[anna.id] = anna
  p.characterOrder.push(anna.id)
  const forest = createAsset('background', 'Forest', 'backgrounds/f.png')
  const morning = createAsset('music', 'Morning', 'music/m.ogg')
  const door = createAsset('sound', 'Door', 'sounds/d.ogg')
  for (const a of [forest, morning, door]) p.assets[a.id] = a
  const courage = createVariable('Courage', 'number')
  const key = createVariable('Has Key', 'boolean')
  for (const v of [courage, key]) {
    p.variables[v.id] = v
    p.variableOrder.push(v.id)
  }
  return { p, anna: anna.id, happy: happy.id, forest: forest.id, morning: morning.id, door: door.id, courage: courage.id, key: key.id }
}

const make = <T extends Block>(type: CoreBlockType, patch: Partial<T> = {}): T => ({ ...createBlock(type), ...patch }) as T

describe('summarizeBlock', () => {
  it('say: narrator, character, empty, missing character and long text', () => {
    const w = world()
    expect(summarizeBlock(make('say', { text: 'The path splits.' }), w.p)).toEqual({ title: 'Narration', detail: '"The path splits."' })
    expect(summarizeBlock(make('say', { characterId: w.anna, text: 'You made it!' }), w.p)).toEqual({
      title: 'Anna',
      detail: '"You made it!"'
    })
    expect(summarizeBlock(make('say', { characterId: w.anna, text: '  ' }), w.p).detail).toBe('(empty)')
    expect(summarizeBlock(make('say', { characterId: 'gone', text: 'x' }), w.p).title).toBe('Missing character')
    const long = summarizeBlock(make('say', { text: 'word '.repeat(40) }), w.p).detail
    expect(long.endsWith('…"')).toBe(true)
    expect(long.length).toBeLessThanOrEqual(MAX_SUMMARY_TEXT + 2)
    expect(long).toContain('…')
  })

  it('say: line breaks become spaces', () => {
    const w = world()
    expect(summarizeBlock(make('say', { text: 'one\ntwo' }), w.p).detail).toBe('"one two"')
  })

  it('background: picture, black, transition, missing file', () => {
    const w = world()
    expect(summarizeBlock(make('background', { assetId: w.forest, transition: 'fade' }), w.p)).toEqual({
      title: 'Background',
      detail: 'Forest · fade'
    })
    expect(summarizeBlock(make('background', { assetId: null }), w.p).detail).toBe('Black')
    expect(summarizeBlock(make('background', { assetId: null, transition: 'dissolve' }), w.p).detail).toBe('Black · dissolve')
    expect(summarizeBlock(make('background', { assetId: 'gone' }), w.p).detail).toBe('Missing file')
  })

  it('show: full pick, missing expression, missing character, position words, transition', () => {
    const w = world()
    expect(
      summarizeBlock(make('show', { characterId: w.anna, expressionId: w.happy, position: 'left', transition: 'dissolve' }), w.p)
    ).toEqual({ title: 'Show', detail: 'Anna · Happy · left · dissolve' })
    expect(summarizeBlock(make('show', { characterId: w.anna, position: 'center' }), w.p).detail).toBe('Anna · no expression picked · centre')
    expect(summarizeBlock(make('show', {}), w.p).detail).toBe('Pick a character')
    expect(summarizeBlock(make('show', { characterId: 'gone' }), w.p).detail).toBe('Missing character')
  })

  it('hide', () => {
    const w = world()
    expect(summarizeBlock(make('hide', { characterId: w.anna, transition: 'fade' }), w.p)).toEqual({ title: 'Hide', detail: 'Anna · fade' })
    expect(summarizeBlock(make('hide', {}), w.p).detail).toBe('Pick a character')
  })

  it('playMusic: fade, loop, nothing picked', () => {
    const w = world()
    expect(summarizeBlock(make('playMusic', { assetId: w.morning }), w.p)).toEqual({ title: 'Play music', detail: 'Morning' })
    expect(summarizeBlock(make('playMusic', { assetId: w.morning, fadeIn: 1.5, loop: false }), w.p).detail).toBe(
      'Morning · fade in 1.5s · plays once'
    )
    expect(summarizeBlock(make('playMusic', { fadeIn: 2 }), w.p).detail).toBe('Pick a track · fade in 2s')
  })

  it('stopMusic', () => {
    const w = world()
    expect(summarizeBlock(make('stopMusic', { fadeOut: 2 }), w.p).detail).toBe('fade out 2s')
    expect(summarizeBlock(make('stopMusic', { fadeOut: 0 }), w.p).detail).toBe('right away')
  })

  it('playSound', () => {
    const w = world()
    expect(summarizeBlock(make('playSound', { assetId: w.door }), w.p)).toEqual({ title: 'Play sound', detail: 'Door' })
    expect(summarizeBlock(make('playSound', {}), w.p).detail).toBe('Pick a sound')
  })

  it('setVariable: every operation, text value, nothing picked, missing variable', () => {
    const w = world()
    const eff = (op: 'set' | 'add' | 'subtract' | 'toggle', variableId: string | null, value: boolean | number | string) =>
      summarizeBlock(make('setVariable', { effect: { variableId, op, value } }), w.p).detail
    expect(eff('set', w.courage, 1)).toBe('Set Courage to 1')
    expect(eff('add', w.courage, 2)).toBe('Add 2 to Courage')
    expect(eff('subtract', w.courage, 1)).toBe('Subtract 1 from Courage')
    expect(eff('toggle', w.key, true)).toBe('Flip Has Key')
    expect(eff('set', w.key, true)).toBe('Set Has Key to true')
    expect(eff('set', null, 1)).toBe('Pick a variable')
    expect(eff('set', 'gone', 1)).toBe('Missing variable')
    const text = createVariable('Nickname', 'text')
    w.p.variables[text.id] = text
    expect(eff('set', text.id, 'Bob')).toBe('Set Nickname to "Bob"')
  })

  it('pause and transition', () => {
    const w = world()
    expect(summarizeBlock(make('pause', { seconds: null }), w.p).detail).toBe('Until click')
    expect(summarizeBlock(make('pause', { seconds: 1.5 }), w.p).detail).toBe('For 1.5 seconds')
    expect(summarizeBlock(make('pause', { seconds: 1 }), w.p).detail).toBe('For 1 second')
    expect(summarizeBlock(make('transition', { transition: 'moveinleft' }), w.p)).toEqual({
      title: 'Transition',
      detail: 'Move in from the left'
    })
  })

  it('covers every core block type without throwing and always returns text', () => {
    const w = world()
    const types: CoreBlockType[] = ['say', 'background', 'show', 'hide', 'playMusic', 'stopMusic', 'playSound', 'setVariable', 'pause', 'transition']
    for (const t of types) {
      const s = summarizeBlock(createBlock(t), w.p)
      expect(s.title.length).toBeGreaterThan(0)
      expect(s.detail.length).toBeGreaterThan(0)
    }
  })
})

describe('summaryText / oneLine / describeEffect', () => {
  it('joins title and detail', () => {
    const w = world()
    expect(summaryText(make('background', { assetId: w.forest, transition: 'fade' }), w.p)).toBe('Background: Forest · fade')
    expect(summaryText(make('say', { characterId: w.anna, text: 'Hi' }), w.p)).toBe('Anna "Hi"')
  })
  it('oneLine trims and cuts', () => {
    expect(oneLine('  a \n b  ')).toBe('a b')
    expect(oneLine('abcdefghij', 5)).toBe('abcd…')
    expect(oneLine('abcde', 5)).toBe('abcde')
  })
  it('describeEffect works on its own', () => {
    const w = world()
    expect(describeEffect({ variableId: w.courage, op: 'add', value: 3 }, w.p)).toBe('Add 3 to Courage')
  })
})
