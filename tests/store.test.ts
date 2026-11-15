import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore, pauseHistory, resumeHistory, undo, redo } from '../src/renderer/store/projectStore'
import { useUiStore } from '../src/renderer/store/uiStore'
import { parseProject, projectSchema, blockSchema, endingSchema } from '@shared/schema'
import {
  createAsset,
  createBlock,
  createCase,
  createChapter,
  createCharacter,
  createClause,
  createCondition,
  createExpression,
  createOption,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import type { Block, CoreBlockType, Id, Project } from '@shared/model'

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const P = (): Project => S().project!
const snap = (): Project => JSON.parse(JSON.stringify(P())) as Project

beforeEach(() => {
  S().loadProject('C:/story', createProject('Test'))
})

describe('factories and schema', () => {
  const types: CoreBlockType[] = [
    'say',
    'background',
    'show',
    'hide',
    'playMusic',
    'stopMusic',
    'playSound',
    'setVariable',
    'pause',
    'transition'
  ]
  it('every block factory result passes the schema', () => {
    for (const t of types) {
      const b = createBlock(t)
      expect(b.type).toBe(t)
      expect(blockSchema.safeParse(b).success, t).toBe(true)
    }
  })
  it('applies the documented defaults', () => {
    expect(createBlock('say')).toMatchObject({ characterId: null, text: '', voiceAssetId: null })
    expect(createBlock('show')).toMatchObject({
      position: 'center',
      transition: 'none',
      placement: { mode: 'preset' },
      zorder: 0
    })
    expect(createBlock('playMusic')).toMatchObject({ channel: 'music' })
    expect(createBlock('stopMusic')).toMatchObject({ channel: 'music' })
    const s = createScene({ x: 1, y: 2 })
    expect(s.ending).toEqual({ type: 'jump', target: null })
    expect(s).toMatchObject({ labelLock: null, role: 'normal', chapterId: null })
    expect(createCharacter()).toMatchObject({ mode: 'adv', sideAssetId: null })
    expect(createVariable()).toMatchObject({ persistent: false })
  })
  it('createProject makes one scene named Start as the start scene', () => {
    const p = createProject('Hi')
    expect(p.meta.title).toBe('Hi')
    const scenes = Object.values(p.scenes)
    expect(scenes).toHaveLength(1)
    expect(scenes[0].name).toBe('Start')
    expect(p.startSceneId).toBe(scenes[0].id)
    expect(projectSchema.safeParse(p).success).toBe(true)
  })
  it('a fully populated project passes the schema', () => {
    const p = createProject('Full')
    const c = createCharacter('Anna')
    c.expressions.push(createExpression('happy'))
    p.characters[c.id] = c
    p.characterOrder.push(c.id)
    const v = createVariable('x', 'boolean')
    p.variables[v.id] = v
    p.variableOrder.push(v.id)
    const a = createAsset('background', 'bg', 'backgrounds/a.png', { width: 1, height: 1, bytes: 3 })
    p.assets[a.id] = a
    const ch = createChapter('Act')
    p.chapters[ch.id] = ch
    p.chapterOrder.push(ch.id)
    const s = p.scenes[p.startSceneId!]
    s.ending = { type: 'choice', prompt: { characterId: c.id, text: 'Hm?' }, options: [createOption('a')] }
    const k = createCase()
    k.condition.clauses.push(createClause(v.id))
    p.scenes['b'] = { ...createScene({ x: 0, y: 0 }), id: 'b', ending: { type: 'branch', cases: [k], elseTarget: null } }
    const nested: Block = {
      id: 'i1',
      type: 'if',
      condition: createCondition(),
      then: [createBlock('say')],
      otherwise: [{ id: 'k1', type: 'kit', kitId: 'k', blockType: 't', params: { a: 1 } }]
    }
    s.blocks.push(nested)
    expect(projectSchema.safeParse(p).success).toBe(true)
    expect(endingSchema.safeParse({ type: 'screen', screenId: null, targets: { e: null } }).success).toBe(true)
  })
  it('parseProject returns a readable error', () => {
    const good = parseProject(JSON.stringify(createProject('X')))
    expect(good.ok).toBe(true)
    const bad = parseProject({ formatVersion: 1 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.error).toContain('story file')
    const junk = parseProject('{not json')
    expect(junk.ok).toBe(false)
    if (!junk.ok) expect(junk.error).toContain('not valid JSON')
    const wrongType = createProject('X') as unknown as { scenes: unknown }
    wrongType.scenes = 5
    expect(parseProject(wrongType).ok).toBe(false)
  })
})

describe('scenes', () => {
  it('addScene / renameScene / moveScenes', () => {
    const id = S().addScene({ x: 10, y: 20 }, 'Forest')
    expect(P().scenes[id]).toMatchObject({ name: 'Forest', position: { x: 10, y: 20 } })
    S().renameScene(id, 'Woods')
    S().moveScenes({ [id]: { x: 5, y: 6 } })
    expect(P().scenes[id]).toMatchObject({ name: 'Woods', position: { x: 5, y: 6 } })
    expect(S().dirty).toBe(true)
  })

  it('deleteScenes clears exits that pointed at them and the start scene', () => {
    const startId = P().startSceneId!
    const b = S().addScene({ x: 0, y: 0 }, 'B')
    const c = S().addScene({ x: 0, y: 0 }, 'C')
    S().setEnding(startId, { type: 'jump', target: b })
    const o1 = createOption('to b')
    o1.target = b
    const o2 = createOption('to c')
    o2.target = c
    S().setEnding(c, { type: 'choice', prompt: null, options: [o1, o2] })
    const k = createCase()
    k.target = b
    S().setEnding(b, { type: 'branch', cases: [k], elseTarget: c })
    S().setEnding(startId, { type: 'jump', target: b })
    const d = S().addScene({ x: 0, y: 0 }, 'D')
    S().setEnding(d, { type: 'code', code: '', exits: [{ id: 'x1', name: 'go', target: b }] })
    S().deleteScenes([b])
    expect(P().scenes[b]).toBeUndefined()
    expect(P().scenes[startId].ending).toEqual({ type: 'jump', target: null })
    const ce = P().scenes[c].ending
    expect(ce.type === 'choice' && ce.options.map((o) => o.target)).toEqual([null, c])
    const de = P().scenes[d].ending
    expect(de.type === 'code' && de.exits[0].target).toBeNull()
    S().deleteScenes([startId])
    expect(P().startSceneId).toBeNull()
  })

  it('deleteScenes also clears a branch else and start pointing to a deleted scene', () => {
    const startId = P().startSceneId!
    const b = S().addScene({ x: 0, y: 0 })
    S().setEnding(b, { type: 'branch', cases: [], elseTarget: startId })
    S().deleteScenes([startId])
    expect(P().startSceneId).toBeNull()
    expect(P().scenes[b].ending).toEqual({ type: 'branch', cases: [], elseTarget: null })
  })

  it('duplicateScene copies blocks with fresh ids', () => {
    const startId = P().startSceneId!
    const blockId = S().addBlock(startId, 'say')!
    S().setEnding(startId, { type: 'choice', prompt: null, options: [createOption('x')] })
    const copyId = S().duplicateScene(startId)!
    const copy = P().scenes[copyId]
    expect(copy.id).not.toBe(startId)
    expect(copy.name).toBe('Start copy')
    expect(copy.blocks).toHaveLength(1)
    expect(copy.blocks[0].id).not.toBe(blockId)
    const orig = P().scenes[startId].ending
    expect(copy.ending.type === 'choice' && orig.type === 'choice' && copy.ending.options[0].id !== orig.options[0].id).toBe(true)
    expect(S().duplicateScene('nope')).toBeNull()
  })

  it('setStartScene and setSceneChapter', () => {
    const b = S().addScene({ x: 0, y: 0 })
    const ch = S().addChapter('Act')
    S().setStartScene(b)
    S().setSceneChapter(b, ch)
    expect(P().startSceneId).toBe(b)
    expect(P().scenes[b].chapterId).toBe(ch)
  })
})

describe('blocks', () => {
  it('add / update / move / duplicate / delete', () => {
    const sid = P().startSceneId!
    const a = S().addBlock(sid, 'say')!
    const b = S().addBlock(sid, 'background')!
    const c = S().addBlock(sid, 'pause', 0)!
    expect(P().scenes[sid].blocks.map((x) => x.id)).toEqual([c, a, b])
    S().updateBlock<Extract<Block, { type: 'say' }>>(sid, a, { text: 'Hello' })
    expect(P().scenes[sid].blocks[1]).toMatchObject({ text: 'Hello' })
    S().moveBlock(sid, 0, 2)
    expect(P().scenes[sid].blocks.map((x) => x.id)).toEqual([a, b, c])
    const d = S().duplicateBlock(sid, a)!
    expect(P().scenes[sid].blocks.map((x) => x.id)).toEqual([a, d, b, c])
    expect(P().scenes[sid].blocks[1]).toMatchObject({ type: 'say', text: 'Hello' })
    S().deleteBlock(sid, d)
    expect(P().scenes[sid].blocks.map((x) => x.id)).toEqual([a, b, c])
  })
})

describe('endings', () => {
  it('setEndingType keeps the first existing target', () => {
    const sid = P().startSceneId!
    const b = S().addScene({ x: 0, y: 0 })
    const c = S().addScene({ x: 0, y: 0 })
    S().setEnding(sid, { type: 'jump', target: b })
    S().setEndingType(sid, 'choice')
    let e = P().scenes[sid].ending
    expect(e.type === 'choice' && e.options.map((o) => o.target)).toEqual([b])
    S().setEndingType(sid, 'branch')
    e = P().scenes[sid].ending
    expect(e.type === 'branch' && e.elseTarget).toBe(b)
    S().setEndingType(sid, 'jump')
    expect(P().scenes[sid].ending).toEqual({ type: 'jump', target: b })
    S().setEndingType(sid, 'end')
    expect(P().scenes[sid].ending).toEqual({ type: 'end' })
    // first non-null target is chosen when several exist
    const o1 = createOption('a')
    const o2 = createOption('b')
    o2.target = c
    const o3 = createOption('c')
    o3.target = b
    S().setEnding(sid, { type: 'choice', prompt: null, options: [o1, o2, o3] })
    S().setEndingType(sid, 'jump')
    expect(P().scenes[sid].ending).toEqual({ type: 'jump', target: c })
  })

  it('setEndingType to the same type is a no-op', () => {
    const sid = P().startSceneId!
    const before = P().scenes[sid].ending
    S().setEndingType(sid, 'jump')
    expect(P().scenes[sid].ending).toBe(before)
  })

  it('options and cases', () => {
    const sid = P().startSceneId!
    expect(S().addOption(sid)).toBeNull()
    S().setEndingType(sid, 'choice')
    const o2 = S().addOption(sid)!
    const o3 = S().addOption(sid)!
    S().updateOption(sid, o2, { text: 'Two' })
    S().moveOption(sid, 2, 0)
    let e = P().scenes[sid].ending
    expect(e.type === 'choice' && e.options.map((o) => o.id)[0]).toBe(o3)
    S().deleteOption(sid, o3)
    e = P().scenes[sid].ending
    expect(e.type === 'choice' && e.options.map((o) => o.text)).toEqual(['', 'Two'])
    S().setEndingType(sid, 'branch')
    const k = S().addCase(sid)!
    S().updateCase(sid, k, { target: sid })
    e = P().scenes[sid].ending
    expect(e.type === 'branch' && e.cases.find((c) => c.id === k)?.target).toBe(sid)
    S().deleteCase(sid, k)
    e = P().scenes[sid].ending
    expect(e.type === 'branch' && e.cases.some((c) => c.id === k)).toBe(false)
  })

  it('setExitTarget', () => {
    const sid = P().startSceneId!
    const b = S().addScene({ x: 0, y: 0 })
    S().setExitTarget(sid, 'jump', b)
    expect(P().scenes[sid].ending).toEqual({ type: 'jump', target: b })
    S().setExitTarget(sid, 'jump', null)
    expect(P().scenes[sid].ending).toEqual({ type: 'jump', target: null })
  })
})

describe('reference cleanup', () => {
  function build(): { sid: Id; ch: Id; ex: Id; v: Id; bg: Id; mus: Id; voice: Id } {
    const sid = P().startSceneId!
    const ch = S().addCharacter({ name: 'Anna' })
    const bg = S().addAsset(createAsset('background', 'forest', 'backgrounds/f.png'))
    const mus = S().addAsset(createAsset('music', 'tune', 'music/t.ogg'))
    const voice = S().addAsset(createAsset('voice', 'line', 'voice/l.ogg'))
    const spr = S().addAsset(createAsset('sprite', 'anna', 'sprites/a.png'))
    const ex = S().addExpression(ch, 'happy', spr)!
    const v = S().addVariable({ name: 'courage', type: 'number' })
    S().addBlock(sid, 'say')
    S().addBlock(sid, 'show')
    S().addBlock(sid, 'hide')
    S().addBlock(sid, 'background')
    S().addBlock(sid, 'playMusic')
    S().addBlock(sid, 'setVariable')
    const [say, show, hide, back, music, setv] = P().scenes[sid].blocks.map((b) => b.id)
    S().updateBlock(sid, say, { characterId: ch, voiceAssetId: voice })
    S().updateBlock(sid, show, { characterId: ch, expressionId: ex })
    S().updateBlock(sid, hide, { characterId: ch })
    S().updateBlock(sid, back, { assetId: bg })
    S().updateBlock(sid, music, { assetId: mus })
    S().updateBlock(sid, setv, { effect: { variableId: v, op: 'add', value: 1 } })
    const opt = createOption('go')
    opt.condition = { join: 'and', clauses: [createClause(v)] }
    opt.effects = [{ variableId: v, op: 'add', value: 1 }]
    S().setEnding(sid, { type: 'choice', prompt: { characterId: ch, text: '?' }, options: [opt] })
    return { sid, ch, ex, v, bg, mus, voice }
  }

  it('deleteCharacter nulls references and removes it from the order', () => {
    const { sid, ch } = build()
    S().deleteCharacter(ch)
    expect(P().characters[ch]).toBeUndefined()
    expect(P().characterOrder).not.toContain(ch)
    const blocks = P().scenes[sid].blocks
    expect(blocks[0]).toMatchObject({ type: 'say', characterId: null })
    expect(blocks[1]).toMatchObject({ type: 'show', characterId: null, expressionId: null })
    expect(blocks[2]).toMatchObject({ type: 'hide', characterId: null })
    const e = P().scenes[sid].ending
    expect(e.type === 'choice' && e.prompt?.characterId).toBeNull()
  })

  it('deleteExpression nulls show blocks that used it', () => {
    const { sid, ch, ex } = build()
    S().deleteExpression(ch, ex)
    expect(P().characters[ch].expressions).toHaveLength(0)
    expect(P().scenes[sid].blocks[1]).toMatchObject({ type: 'show', expressionId: null, characterId: ch })
  })

  it('deleteVariable nulls effects and condition clauses', () => {
    const { sid, v } = build()
    S().deleteVariable(v)
    expect(P().variables[v]).toBeUndefined()
    expect(P().variableOrder).not.toContain(v)
    const setv = P().scenes[sid].blocks[5]
    expect(setv.type === 'setVariable' && setv.effect.variableId).toBeNull()
    const e = P().scenes[sid].ending
    expect(e.type === 'choice' && e.options[0].effects[0].variableId).toBeNull()
    expect(e.type === 'choice' && e.options[0].condition?.clauses[0].variableId).toBeNull()
  })

  it('deleteVariable also clears branch conditions', () => {
    const v = S().addVariable({ name: 'k', type: 'boolean' })
    const sid = P().startSceneId!
    const k = createCase()
    k.condition = { join: 'and', clauses: [createClause(v)] }
    S().setEnding(sid, { type: 'branch', cases: [k], elseTarget: null })
    S().deleteVariable(v)
    const e = P().scenes[sid].ending
    expect(e.type === 'branch' && e.cases[0].condition.clauses[0].variableId).toBeNull()
  })

  it('deleteAsset nulls blocks and expressions', () => {
    const { sid, ch, bg, mus, voice } = build()
    const sprite = P().characters[ch].expressions[0].assetId!
    S().deleteAsset(bg)
    S().deleteAsset(mus)
    S().deleteAsset(voice)
    S().deleteAsset(sprite)
    expect(P().assets[bg]).toBeUndefined()
    const blocks = P().scenes[sid].blocks
    expect(blocks[0]).toMatchObject({ voiceAssetId: null })
    expect(blocks[3]).toMatchObject({ type: 'background', assetId: null })
    expect(blocks[4]).toMatchObject({ type: 'playMusic', assetId: null })
    expect(P().characters[ch].expressions[0].assetId).toBeNull()
  })

  it('deleteAsset clears a character side image and nested blocks', () => {
    const a = S().addAsset(createAsset('sprite', 'side', 'sprites/s.png'))
    const ch = S().addCharacter({ name: 'B', sideAssetId: a })
    const sid = P().startSceneId!
    const inner = { ...createBlock('background'), assetId: a } as Block
    // nested block inserted through the draft API
    useProjectStore.setState((s) => {
      s.project!.scenes[sid].blocks.push({
        id: 'if1',
        type: 'if',
        condition: createCondition(),
        then: [inner],
        otherwise: []
      })
    })
    S().deleteAsset(a)
    expect(P().characters[ch].sideAssetId).toBeNull()
    const nested = P().scenes[sid].blocks.find((b) => b.type === 'if')
    expect(nested?.type === 'if' && nested.then[0]).toMatchObject({ assetId: null })
  })

  it('deleteChapter moves scenes out of it', () => {
    const ch = S().addChapter('Act')
    const sid = P().startSceneId!
    S().setSceneChapter(sid, ch)
    S().updateChapter(ch, { name: 'Act 1' })
    expect(P().chapters[ch].name).toBe('Act 1')
    S().deleteChapter(ch)
    expect(P().scenes[sid].chapterId).toBeNull()
    expect(P().chapterOrder).toEqual([])
  })

  it('character and variable updates', () => {
    const ch = S().addCharacter()
    S().updateCharacter(ch, { name: 'Zed', color: '#000000', mode: 'nvl' })
    expect(P().characters[ch]).toMatchObject({ name: 'Zed', mode: 'nvl' })
    const ex = S().addExpression(ch, 'sad')!
    S().updateExpression(ch, ex, { name: 'cry' })
    expect(P().characters[ch].expressions[0].name).toBe('cry')
    const v = S().addVariable({ name: 'x', type: 'number' })
    S().updateVariable(v, { type: 'boolean' })
    expect(P().variables[v]).toMatchObject({ type: 'boolean', defaultValue: false })
    S().renameAsset(S().addAsset(createAsset('music', 'm', 'music/m.ogg')), 'new')
    S().updateMeta({ title: 'Renamed' })
    expect(P().meta.title).toBe('Renamed')
  })
})

describe('undo / redo', () => {
  it('restores the exact project', () => {
    const start = snap()
    const sid = P().startSceneId!
    S().addScene({ x: 1, y: 1 }, 'A')
    const afterOne = snap()
    S().addBlock(sid, 'say')
    const afterTwo = snap()
    S().deleteScenes([sid])
    const afterThree = snap()
    undo()
    expect(snap()).toEqual(afterTwo)
    undo()
    expect(snap()).toEqual(afterOne)
    undo()
    expect(snap()).toEqual(start)
    redo()
    redo()
    redo()
    expect(snap()).toEqual(afterThree)
  })

  it('loadProject clears history', () => {
    S().addScene({ x: 0, y: 0 })
    S().loadProject('x', createProject('New'))
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(0)
    expect(S().dirty).toBe(false)
    undo()
    expect(P().meta.title).toBe('New')
  })

  it('undo marks the project dirty again after a save', () => {
    S().addScene({ x: 0, y: 0 })
    S().markSaved()
    expect(S().dirty).toBe(false)
    undo()
    expect(S().dirty).toBe(true)
  })

  it('a paused drag records exactly one undo step', () => {
    const a = S().addScene({ x: 0, y: 0 })
    const before = snap()
    pauseHistory()
    for (let i = 1; i <= 10; i++) S().moveScenes({ [a]: { x: i * 10, y: i * 10 } })
    resumeHistory()
    expect(P().scenes[a].position).toEqual({ x: 100, y: 100 })
    undo()
    expect(snap()).toEqual(before)
    redo()
    expect(P().scenes[a].position).toEqual({ x: 100, y: 100 })
  })

  it('history is limited to 100 steps', () => {
    for (let i = 0; i < 120; i++) S().addScene({ x: i, y: 0 })
    expect(useProjectStore.temporal.getState().pastStates.length).toBeLessThanOrEqual(100)
  })
})

describe('uiStore', () => {
  it('holds view state', () => {
    const u = useUiStore.getState()
    u.reset()
    expect(useUiStore.getState()).toMatchObject({ view: 'map', sceneId: null, playtest: null, problemsOpen: false })
    u.openScene('s1')
    expect(useUiStore.getState()).toMatchObject({ view: 'scene', sceneId: 's1' })
    u.selectBlock('b1')
    u.setSelectedNodes(['a', 'b'])
    u.setProblemsOpen(true)
    u.startPlaytest('s1')
    expect(useUiStore.getState()).toMatchObject({
      selectedBlockId: 'b1',
      selectedNodeIds: ['a', 'b'],
      problemsOpen: true,
      playtest: { fromSceneId: 's1' }
    })
    u.stopPlaytest()
    expect(useUiStore.getState().playtest).toBeNull()
    u.setView('characters')
    expect(useUiStore.getState().view).toBe('characters')
  })
})
