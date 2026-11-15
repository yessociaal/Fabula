import { describe, expect, it } from 'vitest'
import { dialogueFor, resolveSprites, sceneSetsBackground, variableResolver } from '@shared/stageView'
import { createAsset, createBlock, createCharacter, createExpression, createProject, createVariable } from '@shared/factory'

describe('stageView helpers', () => {
  const p = createProject('T')
  const anna = createCharacter('Anna', '#ff0000')
  const happy = createExpression('happy', 'asset1')
  const sad = createExpression('sad', null)
  anna.expressions = [happy, sad]
  p.characters[anna.id] = anna
  p.characterOrder.push(anna.id)
  const asset = createAsset('sprite', 'Anna happy', 'sprites/a.png', { width: 10, height: 10, bytes: 5 })
  asset.id = 'asset1'
  p.assets.asset1 = asset

  it('resolves sprites with art, without art, and for unknown characters', () => {
    const r = resolveSprites(p.characters, p.assets, [
      { characterId: anna.id, expressionId: happy.id, position: 'left' },
      { characterId: anna.id, expressionId: sad.id, position: 'center' },
      { characterId: 'ghost', expressionId: null, position: 'right' }
    ])
    expect(r[0].asset?.id).toBe('asset1')
    expect(r[1].asset).toBeNull()
    expect(r[1].label).toBe('Anna · sad')
    expect(r[2].label).toBe('Unknown character')
  })

  it('dialogueFor gives speaker name and colour, or none for the narrator', () => {
    expect(dialogueFor(p, anna.id, 'Hi')).toEqual({ speakerName: 'Anna', speakerColor: '#ff0000', text: 'Hi' })
    expect(dialogueFor(p, null, 'Hi')).toEqual({ speakerName: null, speakerColor: null, text: 'Hi' })
  })

  it('variableResolver maps [name] to the current value', () => {
    const v = createVariable('Player Name', 'text')
    const f = createVariable('Has Key', 'boolean')
    p.variables[v.id] = v
    p.variables[f.id] = f
    p.variableOrder.push(v.id, f.id)
    const r = variableResolver(p, { [v.id]: 'Al', [f.id]: true })
    expect(r('player_name')).toBe('Al')
    expect(r('has_key')).toBe('True')
    expect(r('nope')).toBeUndefined()
  })

  it('sceneSetsBackground looks only at blocks up to the index', () => {
    const id = p.startSceneId!
    p.scenes[id].blocks = [createBlock('say'), createBlock('background')]
    expect(sceneSetsBackground(p, id, 0)).toBe(false)
    expect(sceneSetsBackground(p, id, 1)).toBe(true)
    expect(sceneSetsBackground(p, id, -1)).toBe(false)
  })
})
