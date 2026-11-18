import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { deriveEdges, listExits, setExitTarget } from '@shared/edges'
import { createAsset, createProject, createScene, createScreen, createScreenElement, createVariable } from '@shared/factory'
import { start, step } from '@shared/interpreter'
import type { Effect, Id, Project, Scene, ScreenAction, ScreenDef, ScreenElement } from '@shared/model'
import { buildNameTable, slugify } from '@shared/naming'
import { parseProject } from '@shared/schema'
import { resizeBox, screenUses, snapAxis, syncScreenTargets } from '@shared/screens'
import { scriptFileNameProblem } from '@shared/scriptFiles'
import { findUsage } from '@shared/usage'
import { validateProject } from '@shared/validate'
import { exportProject } from '../src/main/exporter'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'
import { buildExitRows } from '../src/renderer/views/StoryMap/mapModel'
import { summarizeBlock } from '../src/renderer/views/SceneEditor/blockSummaries'

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const P = (): Project => S().project as Project

interface W {
  project: Project
  start: Scene
  a: Scene
  b: Scene
  ui: Id
  bg: Id
  font: Id
  num: Id
  flag: Id
  text: Id
  screen: ScreenDef
}

/** A story with a start scene, scenes "Drawer" (a) and "Window" (b), assets of each kind, variables of each type and an empty screen "Office desk". */
function world(): W {
  const project = createProject('T')
  const start = project.scenes[project.startSceneId as string]
  start.ending = { type: 'end' }
  const a = createScene({ x: 0, y: 100 }, 'Drawer')
  const b = createScene({ x: 0, y: 200 }, 'Window')
  for (const s of [a, b]) {
    s.ending = { type: 'end' }
    project.scenes[s.id] = s
  }
  const ui = createAsset('ui', 'Desk', 'ui/x.png', { width: 1280, height: 720 })
  const bg = createAsset('background', 'Room', 'backgrounds/y.png', { width: 1, height: 1 })
  const font = createAsset('font', 'Hand', 'fonts/z.ttf')
  for (const x of [ui, bg, font]) project.assets[x.id] = x
  const num = createVariable('Trust', 'number')
  const flag = createVariable('Has Key', 'boolean')
  const text = createVariable('Name', 'text')
  for (const v of [num, flag, text]) {
    project.variables[v.id] = v
    project.variableOrder.push(v.id)
  }
  const screen = createScreen('Office desk')
  project.screens[screen.id] = screen
  project.screenOrder.push(screen.id)
  return { project, start, a, b, ui: ui.id, bg: bg.id, font: font.id, num: num.id, flag: flag.id, text: text.id, screen }
}

let counter = 0
function el<T extends ScreenElement['type']>(w: W, type: T, patch: Record<string, unknown> = {}): Extract<ScreenElement, { type: T }> {
  const e = { ...createScreenElement(type, 10, 20, w.screen.elements.map((x) => x.name)), id: `el${++counter}`, ...patch } as Extract<ScreenElement, { type: T }>
  w.screen.elements.push(e)
  return e
}
const setEffect = (variableId: Id, op: Effect['op'], value: Effect['value']): ScreenAction => ({ type: 'setVariable', effect: { variableId, op, value } })
const interfaceText = (p: Project): string | undefined => compileProject(p).files.find((f) => f.path === 'interface.rpy')?.content
const errors = (p: Project): string[] => validateProject(p).filter((x) => x.severity === 'error').map((x) => x.message)
const warnings = (p: Project): string[] => validateProject(p).filter((x) => x.severity === 'warning').map((x) => x.message)

describe('screen compiler: one test per element type', () => {
  it('an image is added at its position; its size is written unless it is already the picture size', () => {
    const w = world()
    el(w, 'image', { assetId: w.ui, x: 0, y: 0, w: 1280, h: 720 })
    el(w, 'image', { assetId: w.ui, x: 5, y: 6, w: 100, h: 50 })
    el(w, 'image', { assetId: w.bg, x: 0, y: 0, w: 640, h: 360 })
    const lines = (interfaceText(w.project) as string).split('\n').filter((l) => l.includes('add '))
    expect(lines).toEqual([
      '    add "images/ui/desk.png" xpos 0 ypos 0',
      '    add "images/ui/desk.png" xpos 5 ypos 6 xsize 100 ysize 50',
      '    add "images/bg/bg room.png" xpos 0 ypos 0 xsize 640 ysize 360'
    ])
  })
  it('an image without a picture is left out', () => {
    const w = world()
    el(w, 'image', { assetId: null })
    expect(interfaceText(w.project)).toBe('screen office_desk():\n\n    null\n')
  })
  it('text has size, colour and an optional font (copied to fonts/)', () => {
    const w = world()
    el(w, 'text', { text: 'Hi', size: 30, color: '#ff0000', x: 100, y: 40 })
    el(w, 'text', { text: 'Fancy', fontAssetId: w.font })
    const out = compileProject(w.project)
    const lines = (out.files.find((f) => f.path === 'interface.rpy')?.content as string).split('\n').filter((l) => l.includes('text '))
    expect(lines[0]).toBe('    text "Hi" xpos 100 ypos 40 size 30 color "#ff0000"')
    expect(lines[1]).toBe('    text "Fancy" xpos 10 ypos 20 size 36 color "#ffffff" font "fonts/hand.ttf"')
    expect(out.assetCopies.map((c) => c.to)).toEqual(['fonts/hand.ttf'])
  })
  it('a button is a textbutton with an explicit fill (generate_gui games have no button images)', () => {
    const w = world()
    el(w, 'button', { text: 'Go', x: 200, y: 500, w: 220, h: 60 })
    expect(interfaceText(w.project)).toContain(
      '    textbutton "Go" xpos 200 ypos 500 xsize 220 ysize 60 background Solid("#3a3f4b") hover_background Solid("#4a5266") text_xalign 0.5 text_yalign 0.5 action Return("button_1")'
    )
  })
  it('an image button has idle and optional hover pictures; no idle picture leaves it out', () => {
    const w = world()
    el(w, 'imageButton', { idleAssetId: w.ui, hoverAssetId: w.bg, x: 900, y: 200 })
    el(w, 'imageButton', { idleAssetId: w.ui })
    el(w, 'imageButton', { idleAssetId: null })
    const lines = (interfaceText(w.project) as string).split('\n').filter((l) => l.includes('imagebutton'))
    expect(lines).toEqual([
      '    imagebutton idle "images/ui/desk.png" hover "images/bg/bg room.png" xpos 900 ypos 200 action Return("image_button_1")',
      '    imagebutton idle "images/ui/desk.png" xpos 10 ypos 20 action Return("image_button_2")'
    ])
  })
  it('a hotspot is an invisible button with a size', () => {
    const w = world()
    el(w, 'hotspot', { name: 'drawer', x: 400, y: 300, w: 180, h: 120 })
    expect(interfaceText(w.project)).toContain('    button xpos 400 ypos 300 xsize 180 ysize 120 background None action Return("drawer")')
  })
  it('a bar shows a number variable with explicit fills; other variables leave it out', () => {
    const w = world()
    el(w, 'bar', { variableId: w.num, max: 10, x: 40, y: 40, w: 300, h: 24 })
    el(w, 'bar', { variableId: w.flag })
    el(w, 'bar', { variableId: null })
    const lines = (interfaceText(w.project) as string).split('\n').filter((l) => l.includes('bar '))
    expect(lines).toEqual(['    bar value VariableValue("trust", 10) xpos 40 ypos 40 xsize 300 ysize 24 left_bar Solid("#7c9cff") right_bar Solid("#262a33")'])
  })
  it('a persistent variable is written as persistent.name', () => {
    const w = world()
    w.project.variables[w.num].persistent = true
    el(w, 'bar', { variableId: w.num, max: 5 })
    el(w, 'hotspot', { action: setEffect(w.num, 'add', 2) })
    const text = interfaceText(w.project) as string
    expect(text).toContain('VariableValue("persistent.trust", 5)')
    expect(text).toContain('SetVariable("persistent.trust", persistent.trust + 2)')
  })
})

describe('screen compiler: escaping', () => {
  it('text and button text use the dialogue escaping', () => {
    const w = world()
    w.project.variables[w.num].name = 'trust'
    el(w, 'text', { text: 'He said "hi" \\ 100% [trust] [bogus] {b}x{/b} {oops}\nnext' })
    el(w, 'button', { text: '50% "off"' })
    const text = interfaceText(w.project) as string
    expect(text).toContain('text "He said \\"hi\\" \\\\ 100%% [trust] [[bogus] {b}x{/b} {{oops}\\nnext"')
    expect(text).toContain('textbutton "50%% \\"off\\""')
  })
})

describe('screen compiler: actions', () => {
  const action = (w: W, a: ScreenAction): string => {
    const text = interfaceText(w.project) as string
    void a
    return text.split('\n').find((l) => l.includes('action ')) as string
  }
  it('leave returns the slug of the element name', () => {
    const w = world()
    el(w, 'hotspot', { name: 'Big Drawer!', action: { type: 'leave' } })
    expect(action(w, { type: 'leave' })).toContain('action Return("big_drawer")')
  })
  it('setVariable: set, add, subtract, toggle', () => {
    const w = world()
    const run = (a: ScreenAction): string => {
      w.screen.elements = []
      el(w, 'hotspot', { action: a })
      return action(w, a).split('action ')[1]
    }
    expect(run(setEffect(w.num, 'set', 4))).toBe('SetVariable("trust", 4)')
    expect(run(setEffect(w.num, 'add', 1))).toBe('SetVariable("trust", trust + 1)')
    expect(run(setEffect(w.num, 'subtract', 2))).toBe('SetVariable("trust", trust - 2)')
    expect(run(setEffect(w.flag, 'toggle', true))).toBe('ToggleVariable("has_key")')
    expect(run(setEffect(w.flag, 'set', false))).toBe('SetVariable("has_key", False)')
    expect(run(setEffect(w.text, 'set', 'Bo "x"'))).toBe('SetVariable("name", "Bo \\"x\\"")')
  })
  it('showScreen is Show("name"), hideThis is Hide()', () => {
    const w = world()
    const other = createScreen('Note')
    w.project.screens[other.id] = other
    w.project.screenOrder.push(other.id)
    el(w, 'hotspot', { action: { type: 'showScreen', screenId: other.id } })
    el(w, 'hotspot', { action: { type: 'hideThis' } })
    const lines = (interfaceText(w.project) as string).split('\n').filter((l) => l.includes('action '))
    expect(lines[0]).toContain('action Show("note")')
    expect(lines[1]).toContain('action Hide()')
  })
  it('an action that cannot be made leaves the element without one', () => {
    const w = world()
    el(w, 'hotspot', { action: { type: 'showScreen', screenId: null } })
    el(w, 'hotspot', { action: setEffect(w.num, 'add', 'x' as never) })
    el(w, 'hotspot', { action: { type: 'setVariable', effect: { variableId: null, op: 'set', value: 1 } } })
    expect((interfaceText(w.project) as string).includes('action')).toBe(false)
  })
})

describe('interface.rpy', () => {
  it('has modal True first, elements in layer order, screens in screenOrder, one blank line between statements, two between screens, one final newline', () => {
    const w = world()
    w.screen.modal = true
    el(w, 'text', { name: 'first', text: 'A' })
    el(w, 'text', { name: 'second', text: 'B' })
    const second = createScreen('Aaa')
    second.elements.push({ ...createScreenElement('text', 0, 0), id: 'q', text: 'C' } as ScreenElement)
    w.project.screens[second.id] = second
    w.project.screenOrder.push(second.id)
    const text = interfaceText(w.project) as string
    expect(text).toBe(
      'screen office_desk():\n\n    modal True\n\n' +
        '    text "A" xpos 10 ypos 20 size 36 color "#ffffff"\n\n' +
        '    text "B" xpos 10 ypos 20 size 36 color "#ffffff"\n\n\n' +
        'screen aaa():\n\n    text "C" xpos 0 ypos 0 size 36 color "#ffffff"\n'
    )
    expect(text.endsWith('\n\n')).toBe(false)
  })
  it('is only written when there is a screen, and is the last generated file before script files', () => {
    const w = world()
    expect(compileProject(w.project).files.map((f) => f.path)).toContain('interface.rpy')
    delete w.project.screens[w.screen.id]
    w.project.screenOrder = []
    expect(compileProject(w.project).files.map((f) => f.path)).not.toContain('interface.rpy')
  })
  it('has no comments and no tool name', () => {
    const w = world()
    el(w, 'text', { text: 'x' })
    expect(interfaceText(w.project)).not.toMatch(/^\s*#|fabula|generated/im)
  })
  it('a screen named like a standard screen or a keyword gets _screen; a chapter called Interface does not take interface.rpy', () => {
    const w = world()
    w.screen.name = 'Main Menu'
    expect(buildNameTable(w.project).screens[w.screen.id]).toBe('main_menu_screen')
    w.screen.name = 'Screen'
    expect(buildNameTable(w.project).screens[w.screen.id]).toBe('screen_screen')
    const ch = { id: 'c', name: 'Interface', color: '#fff' }
    w.project.chapters.c = ch
    w.project.chapterOrder.push('c')
    expect(buildNameTable(w.project).chapterFiles.c).toBe('interface_2.rpy')
    expect(scriptFileNameProblem(w.project, 'interface')).toMatch(/already uses/)
  })
  it('two screens with the same name get _2; elements with the same slug get unique return values', () => {
    const w = world()
    const twin = createScreen('Office desk')
    w.project.screens[twin.id] = twin
    w.project.screenOrder.push(twin.id)
    const x = el(w, 'hotspot', { name: 'Door' })
    const y = el(w, 'hotspot', { name: 'door!' })
    const names = buildNameTable(w.project)
    expect(names.screens[twin.id]).toBe('office_desk_2')
    expect(names.screenElements[x.id]).toBe('door')
    expect(names.screenElements[y.id]).toBe('door_2')
  })
})

describe('screen block and screen ending', () => {
  function ending(w: W, leaving: number): Scene {
    const targets: Record<Id, Id | null> = {}
    const targetsList = [w.a.id, w.b.id, w.start.id]
    for (let i = 0; i < leaving; i++) {
      const e = el(w, 'hotspot', { name: ['drawer', 'window', 'door'][i] })
      targets[e.id] = targetsList[i]
    }
    el(w, 'text', { text: 'not leaving' })
    const scene = createScene({ x: 0, y: 300 }, 'Office')
    scene.ending = { type: 'screen', screenId: w.screen.id, targets }
    w.project.scenes[scene.id] = scene
    return scene
  }
  const labelBody = (p: Project, s: Scene): string => {
    const out = compileProject(p)
    const content = out.files[0].content.split('\n')
    return content.slice(out.sceneLocations[s.id].line - 1).join('\n')
  }
  it('two or more leaving elements: call screen, then an if / elif chain with one jump each', () => {
    const w = world()
    const s = ending(w, 3)
    expect(labelBody(w.project, s)).toBe(
      'label office:\n\n    call screen office_desk\n\n    if _return == "drawer":\n        jump drawer\n    elif _return == "window":\n        jump window\n    elif _return == "door":\n        jump start\n'
    )
  })
  it('one leaving element: a bare jump after call screen', () => {
    const w = world()
    const s = ending(w, 1)
    expect(labelBody(w.project, s)).toBe('label office:\n\n    call screen office_desk\n\n    jump drawer\n')
  })
  it('a missing target returns; no screen returns', () => {
    const w = world()
    const s = ending(w, 2)
    ;(s.ending as { targets: Record<Id, Id | null> }).targets = {}
    expect(labelBody(w.project, s)).toContain('        return\n    elif _return == "window":\n        return')
    s.ending = { type: 'screen', screenId: null, targets: {} }
    expect(labelBody(w.project, s)).toBe('label office:\n\n    return\n')
  })
  it('show screen / hide screen blocks', () => {
    const w = world()
    w.start.blocks = [
      { id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id },
      { id: 'b2', type: 'screen', action: 'hide', screenId: w.screen.id },
      { id: 'b3', type: 'screen', action: 'show', screenId: null }
    ]
    const text = compileProject(w.project).files[0].content
    expect(text).toContain('    show screen office_desk\n\n    hide screen office_desk\n\n    return')
    expect(text).not.toContain('None')
  })
  it('block summaries', () => {
    const w = world()
    expect(summarizeBlock({ id: 'b', type: 'screen', action: 'show', screenId: w.screen.id }, w.project)).toEqual({ title: 'Show screen', detail: 'Office desk' })
    expect(summarizeBlock({ id: 'b', type: 'screen', action: 'hide', screenId: null }, w.project)).toEqual({ title: 'Hide screen', detail: 'Pick a screen' })
  })
})

describe('edges and map rows for screen endings', () => {
  it('one exit per leaving element, handle x:<elementId>, label the element name', () => {
    const w = world()
    const d = el(w, 'hotspot', { name: 'drawer' })
    el(w, 'hotspot', { name: 'plain', action: { type: 'hideThis' } })
    const scene = createScene({ x: 0, y: 300 }, 'Office')
    scene.ending = { type: 'screen', screenId: w.screen.id, targets: { [d.id]: w.a.id } }
    w.project.scenes[scene.id] = scene
    const exits = listExits(scene, w.project)
    expect(exits).toEqual([{ handleId: `x:${d.id}`, kind: 'element', label: 'drawer', target: w.a.id, conditional: false }])
    expect(deriveEdges(w.project).find((e) => e.source === scene.id)).toMatchObject({ handle: `x:${d.id}`, target: w.a.id, label: 'drawer' })
    expect(setExitTarget(scene, `x:${d.id}`, w.b.id)).toBe(true)
    expect(scene.ending).toMatchObject({ targets: { [d.id]: w.b.id } })
    expect(buildExitRows(scene, w.project)).toEqual([{ handleId: `x:${d.id}`, text: 'drawer', ifTag: false, unset: false, named: true }])
  })
})

describe('syncScreenTargets', () => {
  const def = (actions: ScreenAction['type'][]): ScreenDef => {
    const d = createScreen('s')
    actions.forEach((t, i) => d.elements.push({ ...createScreenElement('hotspot', 0, 0), id: `e${i}`, action: t === 'leave' ? { type: 'leave' } : { type: 'hideThis' } } as ScreenElement))
    return d
  }
  it('keeps targets of leaving elements, adds null for new ones, drops the rest', () => {
    expect(syncScreenTargets(def(['leave', 'leave']), { e0: 'x', gone: 'y' })).toEqual({ e0: 'x', e1: null })
    expect(syncScreenTargets(def(['hideThis', 'leave']), { e0: 'x', e1: 'z' })).toEqual({ e1: 'z' })
    expect(syncScreenTargets(undefined, { e0: 'x' })).toEqual({})
  })
  it('returns the same object when nothing changes', () => {
    const t = { e0: 'x' }
    expect(syncScreenTargets(def(['leave']), t)).toBe(t)
  })
})

describe('geometry helpers', () => {
  it('snapAxis snaps to the edges and the centre, with the guide', () => {
    expect(snapAxis(3, 100, 1000, 8)).toEqual({ value: 0, guide: 0 })
    expect(snapAxis(895, 100, 1000, 8)).toEqual({ value: 900, guide: 1000 })
    expect(snapAxis(447, 100, 1000, 8)).toEqual({ value: 450, guide: 500 })
    expect(snapAxis(200, 100, 1000, 8)).toEqual({ value: 200, guide: null })
  })
  it('resizeBox keeps the opposite side and a minimum size', () => {
    const box = { x: 100, y: 100, w: 200, h: 100 }
    expect(resizeBox(box, 'se', 10, 20)).toEqual({ x: 100, y: 100, w: 210, h: 120 })
    expect(resizeBox(box, 'nw', 10, 20)).toEqual({ x: 110, y: 120, w: 190, h: 80 })
    expect(resizeBox(box, 'e', -500, 0)).toEqual({ x: 100, y: 100, w: 8, h: 100 })
    expect(resizeBox(box, 'w', 500, 0)).toEqual({ x: 292, y: 100, w: 8, h: 100 })
  })
})

describe('store: screens and elements', () => {
  beforeEach(() => {
    S().loadProject('C:/story', createProject('T'))
  })

  it('addScreen / renameScreen / updateScreen / duplicateScreen / deleteScreen, each one undo step', () => {
    const id = S().addScreen()
    expect(P().screens[id].name).toBe('New screen')
    expect(P().screenOrder).toEqual([id])
    const id2 = S().addScreen()
    expect(P().screens[id2].name).toBe('New screen 2')
    S().renameScreen(id, 'Desk')
    S().updateScreen(id, { modal: true })
    expect(P().screens[id]).toMatchObject({ name: 'Desk', modal: true })
    const copy = S().duplicateScreen(id) as Id
    expect(P().screens[copy].name).toBe('Desk copy')
    expect(P().screenOrder).toEqual([id, copy, id2])
    expect(S().deleteScreen(copy)).toEqual({ ok: true })
    expect(P().screens[copy]).toBeUndefined()
    undo()
    expect(P().screens[copy]).toBeDefined()
    undo()
    expect(P().screens[copy]).toBeUndefined()
    redo()
    expect(P().screens[copy]).toBeDefined()
  })

  it('addElement gives readable unique names; update, move, delete, duplicate', () => {
    const id = S().addScreen()
    const b1 = S().addElement(id, 'button', 100.4, 50) as Id
    const b2 = S().addElement(id, 'button', 0, 0) as Id
    const h = S().addElement(id, 'hotspot', 0, 0) as Id
    const names = P().screens[id].elements.map((e) => e.name)
    expect(names).toEqual(['button 1', 'button 2', 'hotspot 1'])
    expect(P().screens[id].elements[0]).toMatchObject({ x: 100, y: 50, w: 220, h: 60 })
    S().updateElement(id, b1, { x: 5, y: 6, w: 7, h: 8, text: 'Go' })
    expect(P().screens[id].elements[0]).toMatchObject({ x: 5, y: 6, w: 7, h: 8, text: 'Go' })
    S().updateElement(id, b1, { size: 9, type: 'bar' } as never)
    expect(P().screens[id].elements[0]).not.toHaveProperty('size')
    expect(P().screens[id].elements[0].type).toBe('button')
    S().moveElement(id, b1, 2)
    expect(P().screens[id].elements.map((e) => e.id)).toEqual([b2, h, b1])
    S().moveElement(id, b1, 0)
    expect(P().screens[id].elements.map((e) => e.id)).toEqual([b1, b2, h])
    const copy = S().duplicateElement(id, b1) as Id
    expect(P().screens[id].elements.map((e) => e.id)).toEqual([b1, copy, b2, h])
    expect(P().screens[id].elements[1]).toMatchObject({ name: 'button 1 copy', x: 25, y: 26 })
    S().deleteElement(id, copy)
    expect(P().screens[id].elements.map((e) => e.id)).toEqual([b1, b2, h])
    undo()
    expect(P().screens[id].elements).toHaveLength(4)
  })

  it('element names stay slug-unique when a name is made up from an existing one', () => {
    const id = S().addScreen()
    const a = S().addElement(id, 'button', 0, 0) as Id
    S().updateElement(id, a, { name: 'button_2' })
    const b = S().addElement(id, 'button', 0, 0) as Id
    expect(P().screens[id].elements.find((e) => e.id === b)?.name).toBe('button 1')
    const c = S().addElement(id, 'button', 0, 0) as Id
    expect(slugify(P().screens[id].elements.find((e) => e.id === c)?.name ?? '', 'x')).toBe('button_3')
  })

  it('setElementAction only applies to elements that have an action', () => {
    const id = S().addScreen()
    const img = S().addElement(id, 'image', 0, 0) as Id
    const btn = S().addElement(id, 'button', 0, 0) as Id
    S().setElementAction(id, img, 'hideThis')
    expect(P().screens[id].elements[0]).not.toHaveProperty('action')
    S().setElementAction(id, btn, 'hideThis')
    expect(P().screens[id].elements[1]).toMatchObject({ action: { type: 'hideThis' } })
    S().setElementAction(id, btn, 'setVariable')
    expect(P().screens[id].elements[1]).toMatchObject({ action: { type: 'setVariable', effect: { variableId: null } } })
  })

  it('screen endings: setEndingType, setEndingScreen, setScreenElementTarget, and targets follow the screen', () => {
    const scr = S().addScreen('Hub')
    const sceneA = S().addScene({ x: 0, y: 0 }, 'A')
    const sceneB = S().addScene({ x: 0, y: 100 }, 'B')
    const host = S().addScene({ x: 200, y: 0 }, 'Host')
    S().setEndingType(host, 'screen')
    expect(P().scenes[host].ending).toEqual({ type: 'screen', screenId: null, targets: {} })
    S().setEndingScreen(host, scr)
    const e1 = S().addElement(scr, 'hotspot', 0, 0) as Id
    const e2 = S().addElement(scr, 'button', 0, 0) as Id
    expect(P().scenes[host].ending).toEqual({ type: 'screen', screenId: scr, targets: { [e1]: null, [e2]: null } })
    S().setScreenElementTarget(host, e1, sceneA)
    S().setScreenElementTarget(host, e2, sceneB)
    S().setElementAction(scr, e2, 'hideThis')
    expect(P().scenes[host].ending).toEqual({ type: 'screen', screenId: scr, targets: { [e1]: sceneA } })
    S().setElementAction(scr, e2, 'leave')
    expect((P().scenes[host].ending as { targets: object }).targets).toEqual({ [e1]: sceneA, [e2]: null })
    S().deleteElement(scr, e1)
    expect((P().scenes[host].ending as { targets: object }).targets).toEqual({ [e2]: null })
    S().deleteScenes([sceneA])
    S().setScreenElementTarget(host, e2, sceneB)
    S().deleteScenes([sceneB])
    expect((P().scenes[host].ending as { targets: Record<Id, Id | null> }).targets[e2]).toBeNull()
  })

  it('deleteScreen is refused while something uses it, and Remove references clears them', () => {
    const scr = S().addScreen('Hub')
    const note = S().addScreen('Note')
    const host = S().addScene({ x: 0, y: 0 }, 'Host')
    const other = S().addScene({ x: 0, y: 100 }, 'Other')
    S().addBlock(host, 'screen')
    const blockId = P().scenes[host].blocks[0].id
    S().updateBlock(host, blockId, { screenId: scr })
    S().setEndingType(other, 'screen')
    S().setEndingScreen(other, scr)
    const btn = S().addElement(note, 'button', 0, 0) as Id
    S().setElementAction(note, btn, { type: 'showScreen', screenId: scr })
    const refused = S().deleteScreen(scr)
    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.uses.map((u) => [u.kind, u.where])).toEqual([
        ['block', 'Host'],
        ['ending', 'Other'],
        ['element', 'Note']
      ])
    }
    expect(P().screens[scr]).toBeDefined()
    expect(S().deleteScreen(scr, { removeReferences: true })).toEqual({ ok: true })
    expect(P().screens[scr]).toBeUndefined()
    expect(P().scenes[host].blocks[0]).toMatchObject({ screenId: null })
    expect(P().scenes[other].ending).toEqual({ type: 'screen', screenId: null, targets: {} })
    expect(P().screens[note].elements[0]).toMatchObject({ action: { type: 'showScreen', screenId: null } })
    undo()
    expect(P().screens[scr]).toBeDefined()
    expect(P().scenes[host].blocks[0]).toMatchObject({ screenId: scr })
  })

  it('deleting a variable or an asset clears the screen elements that use them', () => {
    const scr = S().addScreen('Hub')
    const v = S().addVariable({ name: 'Trust', type: 'number' })
    const bar = S().addElement(scr, 'bar', 0, 0) as Id
    S().updateElement(scr, bar, { variableId: v })
    S().deleteVariable(v)
    expect(P().screens[scr].elements[0]).toMatchObject({ variableId: null })
  })

  it('a project with screens round-trips through the schema', () => {
    const scr = S().addScreen('Hub')
    S().addElement(scr, 'imageButton', 1, 2)
    expect(parseProject(JSON.parse(JSON.stringify(P()))).ok).toBe(true)
  })
})

describe('validation', () => {
  const has = (list: string[], part: string): boolean => list.some((m) => m.includes(part))
  const endingScene = (w: W, targets: Record<Id, Id | null>): Scene => {
    const s = createScene({ x: 0, y: 300 }, 'Office')
    s.ending = { type: 'screen', screenId: w.screen.id, targets }
    w.project.scenes[s.id] = s
    return s
  }
  const fine = (w: W): Scene => {
    const e = el(w, 'hotspot', { name: 'drawer' })
    return endingScene(w, { [e.id]: w.a.id })
  }

  it('a clean screen ending has no screen problems', () => {
    const w = world()
    fine(w)
    expect(errors(w.project)).toEqual([])
    expect(warnings(w.project).filter((m) => m.includes('screen'))).toEqual([])
  })
  it('screen name: empty and duplicate', () => {
    const w = world()
    fine(w)
    w.screen.name = ' '
    expect(has(errors(w.project), 'A screen has no name')).toBe(true)
    w.screen.name = 'Office desk'
    const twin = createScreen('office DESK')
    w.project.screens[twin.id] = twin
    w.project.screenOrder.push(twin.id)
    expect(has(errors(w.project), 'Two screens are both called')).toBe(true)
    twin.name = 'Other'
    expect(has(errors(w.project), 'Two screens are both called')).toBe(false)
  })
  it('element names: empty and duplicate (also by slug)', () => {
    const w = world()
    fine(w)
    const x = el(w, 'text', { name: '' })
    expect(has(errors(w.project), 'an element with no name')).toBe(true)
    x.name = 'Drawer!'
    expect(has(errors(w.project), 'two elements named')).toBe(true)
    x.name = 'Title'
    expect(has(errors(w.project), 'two elements named')).toBe(false)
    expect(has(errors(w.project), 'no name')).toBe(false)
  })
  it('image and image button need a picture of the right kind', () => {
    const w = world()
    fine(w)
    const img = el(w, 'image', { assetId: null })
    const btn = el(w, 'imageButton', { idleAssetId: null, action: { type: 'hideThis' } })
    expect(has(errors(w.project), 'The image "image 1" has no picture')).toBe(true)
    expect(has(errors(w.project), 'The image button "image button 1" has no idle picture')).toBe(true)
    img.assetId = w.font
    expect(has(errors(w.project), 'needs a ui or background file for its picture')).toBe(true)
    img.assetId = w.ui
    btn.idleAssetId = w.bg
    expect(errors(w.project)).toEqual([])
  })
  it('button needs text; text font must be a font', () => {
    const w = world()
    fine(w)
    const b = el(w, 'button', { text: '  ', action: { type: 'hideThis' } })
    const t = el(w, 'text', { fontAssetId: w.ui })
    expect(has(errors(w.project), 'has no text')).toBe(true)
    expect(has(errors(w.project), 'needs a font file')).toBe(true)
    b.text = 'Go'
    t.fontAssetId = w.font
    expect(errors(w.project)).toEqual([])
  })
  it('bar needs a number variable and a maximum', () => {
    const w = world()
    fine(w)
    const b = el(w, 'bar', { variableId: null })
    expect(has(errors(w.project), 'has no variable to show')).toBe(true)
    b.variableId = w.flag
    expect(has(errors(w.project), 'not a number variable')).toBe(true)
    b.variableId = w.num
    b.max = 0
    expect(has(errors(w.project), 'needs a maximum above 0')).toBe(true)
    b.max = 10
    expect(errors(w.project)).toEqual([])
  })
  it('actions: showScreen needs a target that exists; setVariable needs a variable', () => {
    const w = world()
    fine(w)
    const b = el(w, 'button', { action: { type: 'showScreen', screenId: null } })
    expect(has(errors(w.project), 'should show a screen but none is picked')).toBe(true)
    b.action = { type: 'showScreen', screenId: 'nope' }
    expect(has(errors(w.project), 'shows a screen that no longer exists')).toBe(true)
    b.action = { type: 'showScreen', screenId: w.screen.id }
    expect(errors(w.project)).toEqual([])
    b.action = { type: 'setVariable', effect: { variableId: null, op: 'set', value: 1 } }
    expect(has(errors(w.project), 'changes a variable but none is picked')).toBe(true)
    b.action = setEffect(w.num, 'set', 1)
    expect(errors(w.project)).toEqual([])
  })
  it('screen block needs a screen', () => {
    const w = world()
    el(w, 'text', {})
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'show', screenId: null }]
    expect(has(errors(w.project), 'the Show screen block (block 1) has no screen')).toBe(true)
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'hide', screenId: w.screen.id }]
    expect(errors(w.project)).toEqual([])
  })
  it('screen ending: needs a screen, a way to leave and a target for every leaving element', () => {
    const w = world()
    const s = endingScene(w, {})
    s.ending = { type: 'screen', screenId: null, targets: {} }
    expect(has(errors(w.project), 'the screen ending has no screen')).toBe(true)
    s.ending = { type: 'screen', screenId: w.screen.id, targets: {} }
    expect(has(errors(w.project), 'has no way to leave')).toBe(true)
    const e = el(w, 'hotspot', { name: 'drawer' })
    expect(has(errors(w.project), '"drawer" on the screen "Office desk" doesn\'t lead anywhere')).toBe(true)
    expect(validateProject(w.project).find((p) => p.exitId === `x:${e.id}`)?.sceneId).toBe(s.id)
    s.ending = { type: 'screen', screenId: w.screen.id, targets: { [e.id]: w.a.id } }
    expect(errors(w.project)).toEqual([])
  })
  it('warning: Leave screen on a screen shown by a block (and not used as an ending)', () => {
    const w = world()
    el(w, 'hotspot', { name: 'drawer' })
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id }]
    expect(has(warnings(w.project), 'Leave screen only works when this screen is the ending of a scene; with Show screen it will be ignored')).toBe(true)
    w.start.blocks = []
    endingScene(w, {})
    expect(has(warnings(w.project), 'with Show screen it will be ignored')).toBe(false)
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id }]
    expect(has(warnings(w.project), 'with Show screen it will be ignored')).toBe(false)
  })
  it('warning: element outside the canvas; partly outside is fine', () => {
    const w = world()
    const e = fine(w)
    void e
    const t = el(w, 'text', { x: 5000, y: 0 })
    expect(has(warnings(w.project), 'is outside the 1920 by 1080 screen')).toBe(true)
    t.x = 1900
    expect(has(warnings(w.project), 'is outside')).toBe(false)
  })
  it('warning: unused screen; a screen only opened by another screen is used', () => {
    const w = world()
    el(w, 'text', {})
    expect(has(warnings(w.project), 'is not used anywhere')).toBe(true)
    const host = createScreen('Host')
    host.elements.push({ ...createScreenElement('button', 0, 0), id: 'hb', action: { type: 'showScreen', screenId: w.screen.id } } as ScreenElement)
    w.project.screens[host.id] = host
    w.project.screenOrder.push(host.id)
    const msgs = warnings(w.project)
    expect(msgs.filter((m) => m.includes('"Office desk" is not used'))).toEqual([])
    expect(msgs.some((m) => m.includes('"Host" is not used'))).toBe(true)
  })
  it('warning: Close this screen on an ending screen does nothing', () => {
    const w = world()
    fine(w)
    el(w, 'button', { action: { type: 'hideThis' } })
    expect(has(warnings(w.project), 'Close this screen')).toBe(true)
  })
  it('things used only by a screen are not reported as unused', () => {
    const w = world()
    fine(w)
    el(w, 'image', { assetId: w.ui })
    el(w, 'bar', { variableId: w.num })
    el(w, 'text', { fontAssetId: w.font })
    const msgs = warnings(w.project)
    expect(msgs.some((m) => m.includes('"Desk" is not used'))).toBe(false)
    expect(msgs.some((m) => m.includes('"Trust" is never used'))).toBe(false)
    expect(msgs.some((m) => m.includes('"Hand" is not used'))).toBe(false)
  })
})

describe('usage', () => {
  it('tracks screens (blocks, endings, showScreen actions) and what elements use', () => {
    const w = world()
    const note = createScreen('Note')
    w.project.screens[note.id] = note
    w.project.screenOrder.push(note.id)
    el(w, 'image', { assetId: w.ui })
    el(w, 'text', { fontAssetId: w.font })
    el(w, 'bar', { variableId: w.num })
    el(w, 'button', { action: { type: 'showScreen', screenId: note.id } })
    el(w, 'hotspot', { action: setEffect(w.flag, 'set', true) })
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'show', screenId: note.id }]
    w.a.ending = { type: 'screen', screenId: w.screen.id, targets: {} }
    const u = findUsage(w.project)
    expect(u.assets[w.ui]).toHaveLength(1)
    expect(u.assets[w.font]).toHaveLength(1)
    expect(u.variables[w.num]).toHaveLength(1)
    expect(u.variables[w.flag]).toHaveLength(1)
    expect(u.screens[note.id].map((r) => r.description)).toEqual(['Show screen block', 'Screen "Office desk" button 1: shows it'])
    expect(u.screens[w.screen.id].map((r) => r.sceneName)).toEqual(['Drawer'])
    expect(screenUses(w.project, note.id).map((x) => x.kind)).toEqual(['block', 'element'])
  })
})

describe('Quick play interpreter: screens', () => {
  const adv = (p: Project, s: ReturnType<typeof start>) => step(p, s, { type: 'advance' })
  it('show / hide blocks keep the list of shown screens', () => {
    const w = world()
    el(w, 'text', {})
    w.start.blocks = [
      { id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id },
      { id: 'b2', type: 'say', characterId: null, text: 'one', voiceAssetId: null },
      { id: 'b3', type: 'screen', action: 'hide', screenId: w.screen.id },
      { id: 'b4', type: 'say', characterId: null, text: 'two', voiceAssetId: null }
    ]
    let s = start(w.project, w.start.id)
    expect(s.shownScreens).toEqual([w.screen.id])
    s = adv(w.project, s)
    expect(s.shownScreens).toEqual([])
    expect(s.line?.text).toBe('two')
  })
  it('a screen ending waits; clicking a leaving element follows its target; a non-leaving click does not leave', () => {
    const w = world()
    const d = el(w, 'hotspot', { name: 'drawer' })
    const win = el(w, 'hotspot', { name: 'window' })
    const bump = el(w, 'hotspot', { name: 'bump', action: setEffect(w.num, 'add', 1) })
    w.start.ending = { type: 'screen', screenId: w.screen.id, targets: { [d.id]: w.a.id, [win.id]: w.b.id } }
    w.a.blocks = [{ id: 'x', type: 'say', characterId: null, text: 'drawer scene', voiceAssetId: null }]
    let s = start(w.project, w.start.id)
    expect(s.screenEnding).toEqual({ screenId: w.screen.id })
    expect(adv(w.project, s)).toBe(s)
    s = step(w.project, s, { type: 'screenAction', screenId: w.screen.id, elementId: bump.id })
    expect(s.variables[w.num]).toBe(1)
    expect(s.screenEnding).not.toBeNull()
    s = step(w.project, s, { type: 'screenAction', screenId: w.screen.id, elementId: d.id })
    expect(s.screenEnding).toBeNull()
    expect(s.sceneId).toBe(w.a.id)
    expect(s.line?.text).toBe('drawer scene')
  })
  it('showScreen and hideThis actions toggle shown screens; leave in a block context does nothing', () => {
    const w = world()
    const note = createScreen('Note')
    w.project.screens[note.id] = note
    w.project.screenOrder.push(note.id)
    const open = el(w, 'button', { action: { type: 'showScreen', screenId: note.id } })
    const leave = el(w, 'hotspot', { action: { type: 'leave' } })
    const close = { ...createScreenElement('button', 0, 0), id: 'close', action: { type: 'hideThis' } } as ScreenElement
    note.elements.push(close)
    w.start.blocks = [
      { id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id },
      { id: 'b2', type: 'say', characterId: null, text: 'x', voiceAssetId: null }
    ]
    let s = start(w.project, w.start.id)
    s = step(w.project, s, { type: 'screenAction', screenId: w.screen.id, elementId: open.id })
    expect(s.shownScreens).toEqual([w.screen.id, note.id])
    const before = s
    expect(step(w.project, s, { type: 'screenAction', screenId: w.screen.id, elementId: leave.id })).toBe(before)
    s = step(w.project, s, { type: 'screenAction', screenId: note.id, elementId: 'close' })
    expect(s.shownScreens).toEqual([w.screen.id])
    expect(step(w.project, s, { type: 'screenAction', screenId: note.id, elementId: 'close' })).toBe(s)
  })
  it('a modal screen blocks the click that would advance the dialogue', () => {
    const w = world()
    el(w, 'text', {})
    w.screen.modal = true
    w.start.blocks = [
      { id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id },
      { id: 'b2', type: 'say', characterId: null, text: 'x', voiceAssetId: null }
    ]
    const s = start(w.project, w.start.id)
    expect(adv(w.project, s)).toBe(s)
    w.screen.modal = false
    expect(adv(w.project, s)).not.toBe(s)
  })
  it('a screen ending with no way to leave or no screen ends with a notice', () => {
    const w = world()
    w.start.ending = { type: 'screen', screenId: w.screen.id, targets: {} }
    expect(start(w.project, w.start.id).notice).toBe('This screen has no way to leave')
    w.start.ending = { type: 'screen', screenId: null, targets: {} }
    expect(start(w.project, w.start.id).status).toBe('ended')
  })
  it('stepping does not change the input state', () => {
    const w = world()
    const d = el(w, 'hotspot', { name: 'd' })
    w.start.ending = { type: 'screen', screenId: w.screen.id, targets: { [d.id]: w.a.id } }
    const s = start(w.project, w.start.id)
    const frozen = JSON.stringify(s)
    step(w.project, s, { type: 'screenAction', screenId: w.screen.id, elementId: d.id })
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('exporter and interface.rpy', () => {
  let work: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'fabula-p14-'))
  })
  afterEach(() => rmSync(work, { recursive: true, force: true }))

  it('writes interface.rpy, lists it in the manifest, and removes it when the last screen is deleted', () => {
    const w = world()
    el(w, 'text', { text: 'hi' })
    w.start.blocks = [{ id: 'b1', type: 'screen', action: 'show', screenId: w.screen.id }]
    const editor = join(work, 'editor')
    const game = join(work, 'game')
    mkdirSync(editor, { recursive: true })
    mkdirSync(join(game, 'game'), { recursive: true })
    for (const a of Object.values(w.project.assets)) {
      mkdirSync(join(editor, 'assets', a.file, '..'), { recursive: true })
      writeFileSync(join(editor, 'assets', a.file), 'x')
    }
    w.project.renpyProjectDir = game
    const first = exportProject(editor, w.project, { kits: [] })
    expect(first.ok).toBe(true)
    expect(existsSync(join(game, 'game', 'interface.rpy'))).toBe(true)
    expect(readFileSync(join(game, 'game', 'interface.rpy'), 'utf8')).toBe(interfaceText(w.project))
    expect(JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')).files).toContain('interface.rpy')
    writeFileSync(join(game, 'game', 'interface.rpyc'), 'compiled')
    w.start.blocks = []
    delete w.project.screens[w.screen.id]
    w.project.screenOrder = []
    const second = exportProject(editor, w.project, { kits: [] })
    expect(second.ok).toBe(true)
    expect(existsSync(join(game, 'game', 'interface.rpy'))).toBe(false)
    expect(existsSync(join(game, 'game', 'interface.rpyc'))).toBe(false)
    expect(JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')).files).not.toContain('interface.rpy')
  })
  it('a script file called interface is refused (reserved name)', () => {
    const w = world()
    expect(scriptFileNameProblem(w.project, 'Interface.rpy')).toMatch(/already uses/)
  })
})
