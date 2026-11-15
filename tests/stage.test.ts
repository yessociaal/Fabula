import { describe, expect, it } from 'vitest'
import { computeStage } from '@shared/stage'
import { createBlock, createProject } from '@shared/factory'
import type { Block, Project } from '@shared/model'

type Of<T extends Block['type']> = Extract<Block, { type: T }>

function make(blocks: Block[]): { p: Project; id: string } {
  const p = createProject('T')
  const id = p.startSceneId!
  p.scenes[id].blocks = blocks
  return { p, id }
}
const show = (characterId: string, expressionId: string, position: 'left' | 'center' | 'right'): Block => ({
  ...(createBlock('show') as Of<'show'>),
  characterId,
  expressionId,
  position
})
const bg = (assetId: string | null): Block => ({ ...(createBlock('background') as Of<'background'>), assetId })
const hide = (characterId: string): Block => ({ ...(createBlock('hide') as Of<'hide'>), characterId })
const music = (assetId: string | null): Block => ({ ...(createBlock('playMusic') as Of<'playMusic'>), assetId })

describe('computeStage', () => {
  it('is empty before the first block and for unknown scenes', () => {
    const { p, id } = make([bg('b1')])
    expect(computeStage(p, id, -1)).toEqual({ background: null, sprites: [], music: null })
    expect(computeStage(p, 'nope', 3)).toEqual({ background: null, sprites: [], music: null })
  })
  it('background sets the image and clears sprites', () => {
    const { p, id } = make([show('c1', 'e1', 'left'), bg('b1'), show('c2', 'e2', 'right')])
    expect(computeStage(p, id, 0).sprites).toHaveLength(1)
    const s = computeStage(p, id, 1)
    expect(s.background).toBe('b1')
    expect(s.sprites).toEqual([])
    expect(computeStage(p, id, 2).sprites).toEqual([{ characterId: 'c2', expressionId: 'e2', position: 'right' }])
  })
  it('background with null asset means black', () => {
    const { p, id } = make([bg('b1'), bg(null)])
    expect(computeStage(p, id, 1).background).toBeNull()
  })
  it('hide removes only that character', () => {
    const { p, id } = make([show('c1', 'e1', 'left'), show('c2', 'e2', 'right'), hide('c1')])
    expect(computeStage(p, id, 2).sprites.map((s) => s.characterId)).toEqual(['c2'])
  })
  it('show of a character already on stage replaces it', () => {
    const { p, id } = make([show('c1', 'e1', 'left'), show('c2', 'e2', 'right'), show('c1', 'e3', 'center')])
    const s = computeStage(p, id, 2)
    expect(s.sprites).toEqual([
      { characterId: 'c1', expressionId: 'e3', position: 'center' },
      { characterId: 'c2', expressionId: 'e2', position: 'right' }
    ])
  })
  it('tracks music and stop', () => {
    const { p, id } = make([music('m1'), bg('b1'), createBlock('stopMusic'), music('m2')])
    expect(computeStage(p, id, 1).music).toBe('m1')
    expect(computeStage(p, id, 2).music).toBeNull()
    expect(computeStage(p, id, 3).music).toBe('m2')
  })
  it('ignores the ambient channel and clamps the index', () => {
    const amb = { ...(createBlock('playMusic') as Of<'playMusic'>), assetId: 'amb', channel: 'ambient' as const }
    const { p, id } = make([music('m1'), amb])
    expect(computeStage(p, id, 99).music).toBe('m1')
  })
})
