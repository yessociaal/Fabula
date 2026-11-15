import { describe, expect, it } from 'vitest'
import { createBlock, createCase, createCharacter, createClause, createOption, createProject, createScene, createVariable } from '@shared/factory'
import { deriveEdges } from '@shared/edges'
import type { Block, Id, Project, Scene } from '@shared/model'
import {
  CHAPTER_PALETTE,
  buildExitRows,
  countArrowsInto,
  matchingSceneIds,
  nextChapter,
  sceneCardInfo,
  sceneMatches,
  truncate
} from '../src/renderer/views/StoryMap/mapModel'

function setup(): { p: Project; s: Scene; target: Scene; key: Id } {
  const p = createProject('T')
  const s = p.scenes[p.startSceneId as Id]
  const target = createScene({ x: 300, y: 0 }, 'Target')
  p.scenes[target.id] = target
  const key = createVariable('has_key', 'boolean')
  p.variables[key.id] = key
  p.variableOrder.push(key.id)
  return { p, s, target, key: key.id }
}

describe('buildExitRows: every ending type', () => {
  it('jump: one "Then" row', () => {
    const { p, s, target } = setup()
    s.ending = { type: 'jump', target: target.id }
    expect(buildExitRows(s, p)).toEqual([{ handleId: 'jump', text: 'Then', ifTag: false, unset: false }])
    s.ending = { type: 'jump', target: null }
    expect(buildExitRows(s, p)[0].unset).toBe(true)
  })

  it('choice: one row per option with the text, an if tag when conditional, and unset when no target', () => {
    const { p, s, target, key } = setup()
    const plain = createOption('Take the left path')
    plain.target = target.id
    const cond = createOption('Use the key')
    cond.condition = { join: 'and', clauses: [createClause(key)] }
    const blank = createOption('')
    s.ending = { type: 'choice', prompt: null, options: [plain, cond, blank] }
    const rows = buildExitRows(s, p)
    expect(rows.map((r) => r.handleId)).toEqual([`opt:${plain.id}`, `opt:${cond.id}`, `opt:${blank.id}`])
    expect(rows.map((r) => r.text)).toEqual(['Take the left path', 'Use the key', 'Untitled choice'])
    expect(rows.map((r) => r.ifTag)).toEqual([false, true, false])
    expect(rows.map((r) => r.unset)).toEqual([false, true, true])
  })

  it('branch: each case as its condition in words, then Otherwise', () => {
    const { p, s, target, key } = setup()
    const c = createCase()
    c.condition = { join: 'and', clauses: [createClause(key)] }
    c.target = target.id
    s.ending = { type: 'branch', cases: [c], elseTarget: null }
    expect(buildExitRows(s, p)).toEqual([
      { handleId: `case:${c.id}`, text: 'has_key', ifTag: false, unset: false },
      { handleId: 'else', text: 'Otherwise', ifTag: false, unset: true }
    ])
  })

  it('end: no rows (the card shows END and has no handle)', () => {
    const { p, s } = setup()
    s.ending = { type: 'end' }
    expect(buildExitRows(s, p)).toEqual([])
    expect(sceneCardInfo(s, p).isEnd).toBe(true)
  })

  it('code and kit: one row per named exit', () => {
    const { p, s, target } = setup()
    s.ending = {
      type: 'code',
      code: '',
      exits: [
        { id: 'e1', name: 'win', target: target.id },
        { id: 'e2', name: 'lose', target: null }
      ]
    }
    expect(buildExitRows(s, p).map((r) => [r.handleId, r.text, r.unset])).toEqual([
      ['x:e1', 'win', false],
      ['x:e2', 'lose', true]
    ])
    s.ending = { type: 'kit', kitId: 'terminal', endingType: 'session', params: {}, exits: [{ id: 'k1', name: 'unlock', target: null }] }
    expect(buildExitRows(s, p).map((r) => r.handleId)).toEqual(['x:k1'])
  })

  it('screen: one row per leaving element', () => {
    const { p, s, target } = setup()
    p.screens['sc'] = {
      id: 'sc',
      name: 'Desk',
      modal: false,
      elements: [
        { id: 'h1', type: 'hotspot', name: 'drawer', x: 0, y: 0, w: 10, h: 10, action: { type: 'leave' } },
        { id: 'h2', type: 'hotspot', name: 'noop', x: 0, y: 0, w: 10, h: 10, action: { type: 'hideThis' } }
      ]
    }
    s.ending = { type: 'screen', screenId: 'sc', targets: { h1: target.id } }
    expect(buildExitRows(s, p).map((r) => [r.handleId, r.text, r.unset])).toEqual([['x:h1', 'drawer', false]])
  })

  it('the connected rows match the derived edges one to one', () => {
    const { p, s, target } = setup()
    const o = createOption('go')
    o.target = target.id
    s.ending = { type: 'choice', prompt: null, options: [o, createOption('later')] }
    const connected = buildExitRows(s, p)
      .filter((r) => !r.unset)
      .map((r) => `${s.id}:${r.handleId}`)
    expect(deriveEdges(p).map((e) => e.id)).toEqual(connected)
  })
})

describe('sceneCardInfo', () => {
  it('finds the first background, the first spoken line with its speaker and the block count', () => {
    const { p, s } = setup()
    const anna = createCharacter('Anna')
    p.characters[anna.id] = anna
    const bg1 = { ...createBlock('background'), assetId: 'asset1' }
    const bg2 = { ...createBlock('background'), assetId: 'asset2' }
    const empty = { ...createBlock('say'), text: '  ' }
    const line = { ...createBlock('say'), characterId: anna.id, text: 'You made it!\nFinally.' }
    s.blocks = [createBlock('pause'), bg1, bg2, empty, line] as Block[]
    const info = sceneCardInfo(s, p)
    expect(info.backgroundAssetId).toBe('asset1')
    expect(info.firstLine).toBe('Anna: You made it! Finally.')
    expect(info.blockCount).toBe(5)
  })
  it('has no background and no line for an empty scene', () => {
    const { p, s } = setup()
    expect(sceneCardInfo(s, p)).toMatchObject({ backgroundAssetId: null, firstLine: '', blockCount: 0 })
  })
})

describe('search, arrows and chapters', () => {
  it('matches name and dialogue, case-insensitively, and an empty query matches nothing', () => {
    const { p, s, target } = setup()
    s.blocks = [{ ...createBlock('say'), text: 'The Forest is dark' } as Block]
    expect(sceneMatches(s, 'forest')).toBe(true)
    expect(sceneMatches(s, 'START')).toBe(true)
    expect(sceneMatches(target, 'forest')).toBe(false)
    expect(sceneMatches(s, '  ')).toBe(false)
    expect(matchingSceneIds(p, 'forest')).toEqual([s.id])
  })
  it('orders matches top to bottom, then left to right', () => {
    const { p } = setup()
    const low = createScene({ x: 0, y: 500 }, 'Room low')
    const high = createScene({ x: 900, y: -5 }, 'Room high')
    p.scenes[low.id] = low
    p.scenes[high.id] = high
    expect(matchingSceneIds(p, 'room')).toEqual([high.id, low.id])
  })
  it('counts arrows into the deleted set from outside only', () => {
    const { p, s, target } = setup()
    const o = createOption('a')
    o.target = target.id
    const o2 = createOption('b')
    o2.target = target.id
    s.ending = { type: 'choice', prompt: null, options: [o, o2] }
    target.ending = { type: 'jump', target: s.id }
    expect(countArrowsInto(p, [target.id])).toBe(2)
    expect(countArrowsInto(p, [target.id, s.id])).toBe(0)
  })
  it('truncates labels to 24 characters', () => {
    expect(truncate('short', 24)).toBe('short')
    expect(truncate('x'.repeat(24), 24)).toHaveLength(24)
    expect(truncate('x'.repeat(30), 24)).toHaveLength(24)
    expect(truncate('x'.repeat(30), 24).endsWith('…')).toBe(true)
  })
  it('chapters are named Chapter N and cycle through a fixed palette', () => {
    const p = createProject('T')
    expect(nextChapter(p)).toEqual({ name: 'Chapter 1', color: CHAPTER_PALETTE[0] })
    p.chapterOrder = Array.from({ length: CHAPTER_PALETTE.length }, (_, i) => `c${i}`)
    expect(nextChapter(p)).toEqual({ name: `Chapter ${CHAPTER_PALETTE.length + 1}`, color: CHAPTER_PALETTE[0] })
  })
})
