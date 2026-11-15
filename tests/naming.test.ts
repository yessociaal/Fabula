import { describe, expect, it } from 'vitest'
import { buildNameTable, slugify } from '@shared/naming'
import {
  createAsset,
  createChapter,
  createCharacter,
  createExpression,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'

describe('slugify', () => {
  const table: [string, string, string][] = [
    ['Hello World', 'x', 'hello_world'],
    ['Café Déjà Vu', 'x', 'cafe_deja_vu'],
    ['  --Forest!!Gate--  ', 'x', 'forest_gate'],
    ['Party 🎉 Time', 'x', 'party_time'],
    ['🎉', 'scene', 'scene'],
    ['', 'scene', 'scene'],
    ['   ', 'value', 'value'],
    ['3 Doors', 'scene', 'scene_3_doors'],
    ['123', 'value', 'value_123'],
    ['ñandú', 'x', 'nandu'],
    ['日本語', 'character', 'character'],
    ['a__b', 'x', 'a_b']
  ]
  it.each(table)('slugify(%j, %j) = %j', (input, fallback, expected) => {
    expect(slugify(input, fallback)).toBe(expected)
  })
})

describe('buildNameTable', () => {
  it('names the start scene "start" and suffixes duplicates', () => {
    const p = createProject('T')
    const startId = p.startSceneId!
    const a = createScene({ x: 0, y: 100 }, 'Forest')
    const b = createScene({ x: 0, y: 200 }, 'Forest')
    const c = createScene({ x: 0, y: 300 }, 'Forest')
    for (const s of [a, b, c]) p.scenes[s.id] = s
    const t = buildNameTable(p)
    expect(t.sceneLabels[startId]).toBe('start')
    expect(t.sceneLabels[a.id]).toBe('forest')
    expect(t.sceneLabels[b.id]).toBe('forest_2')
    expect(t.sceneLabels[c.id]).toBe('forest_3')
  })

  it('suffixes reserved words per namespace', () => {
    const p = createProject('T')
    const s = createScene({ x: 0, y: 50 }, 'Start')
    const s2 = createScene({ x: 0, y: 60 }, 'Return')
    p.scenes[s.id] = s
    p.scenes[s2.id] = s2
    const left = createCharacter('Left')
    const narr = createCharacter('Narrator')
    p.characters[left.id] = left
    p.characters[narr.id] = narr
    p.characterOrder.push(left.id, narr.id)
    const v = createVariable('True')
    const v2 = createVariable('Config')
    p.variables[v.id] = v
    p.variables[v2.id] = v2
    p.variableOrder.push(v.id, v2.id)
    const t = buildNameTable(p)
    expect(t.sceneLabels[s.id]).toBe('start_scene')
    expect(t.sceneLabels[s2.id]).toBe('return_scene')
    expect(t.characters[left.id]).toBe('left_char')
    expect(t.characters[narr.id]).toBe('narrator_char')
    expect(t.variables[v.id]).toBe('true_value')
    expect(t.variables[v2.id]).toBe('config_value')
  })

  it('shares the store namespace between characters and variables', () => {
    const p = createProject('T')
    const c = createCharacter('Anna')
    const v = createVariable('Anna')
    p.characters[c.id] = c
    p.characterOrder.push(c.id)
    p.variables[v.id] = v
    p.variableOrder.push(v.id)
    const t = buildNameTable(p)
    expect(t.characters[c.id]).toBe('anna')
    expect(t.variables[v.id]).toBe('anna_2')
  })

  it('names expressions per character, backgrounds, stems and chapter files', () => {
    const p = createProject('T')
    const c1 = createCharacter('Anna')
    const c2 = createCharacter('Ben')
    const e1 = createExpression('Happy')
    const e2 = createExpression('happy!')
    const e3 = createExpression('Happy')
    c1.expressions.push(e1, e2)
    c2.expressions.push(e3)
    for (const c of [c1, c2]) {
      p.characters[c.id] = c
      p.characterOrder.push(c.id)
    }
    const bg1 = createAsset('background', 'Forest', 'a.png')
    const bg2 = createAsset('background', 'Forest', 'b.png')
    const m = createAsset('music', '', 'c.ogg')
    const snd = createAsset('sound', 'Forest', 'd.ogg')
    for (const a of [bg1, bg2, m, snd]) p.assets[a.id] = a
    const ch1 = createChapter('Script')
    const ch2 = createChapter('Act One')
    const ch3 = createChapter('Act One')
    for (const c of [ch1, ch2, ch3]) {
      p.chapters[c.id] = c
      p.chapterOrder.push(c.id)
    }
    const t = buildNameTable(p)
    expect(t.expressions[e1.id]).toBe('happy')
    expect(t.expressions[e2.id]).toBe('happy_2')
    expect(t.expressions[e3.id]).toBe('happy')
    const bgNames = [t.backgrounds[bg1.id], t.backgrounds[bg2.id]].sort()
    expect(bgNames).toEqual(['bg forest', 'bg forest_2'])
    expect(t.stems[m.id]).toBe('track')
    expect(t.stems[snd.id]).toBe('forest')
    expect(t.chapterFiles[ch1.id]).toBe('script_2.rpy')
    expect(t.chapterFiles[ch2.id]).toBe('act_one.rpy')
    expect(t.chapterFiles[ch3.id]).toBe('act_one_2.rpy')
  })

  it('is deterministic and orders scenes by chapter, y, x, id', () => {
    const p = createProject('T')
    const ch = createChapter('Act')
    p.chapters[ch.id] = ch
    p.chapterOrder.push(ch.id)
    const a = createScene({ x: 50, y: 10 }, 'Room')
    const b = createScene({ x: 10, y: 10 }, 'Room')
    const c = createScene({ x: 0, y: 0 }, 'Room')
    c.chapterId = ch.id
    for (const s of [a, b, c]) p.scenes[s.id] = s
    const t1 = buildNameTable(p)
    // unchaptered first: b (x=10) before a (x=50); chaptered scenes last
    expect(t1.sceneLabels[b.id]).toBe('room')
    expect(t1.sceneLabels[a.id]).toBe('room_2')
    expect(t1.sceneLabels[c.id]).toBe('room_3')
    // same project, different insertion order -> identical result
    const q = { ...p, scenes: Object.fromEntries(Object.entries(p.scenes).reverse()) }
    expect(buildNameTable(q)).toEqual(t1)
    expect(buildNameTable(p)).toEqual(t1)
  })
})
