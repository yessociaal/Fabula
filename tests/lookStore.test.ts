import { beforeEach, describe, expect, it } from 'vitest'
import { createAsset, createProject } from '../src/shared/factory'
import type { LookReadEntry } from '../src/shared/look'
import { LOOK_FIELDS } from '../src/shared/look'
import { MOCK_DEFAULTS, dialogueMock, mockColour, mockNumber } from '../src/shared/lookMock'
import { lookRequest, lookSummary, pendingLookKeys } from '../src/shared/lookRequest'
import { parseProject } from '../src/shared/schema'
import type { Project } from '../src/shared/model'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const P = (): Project => S().project!

beforeEach(() => {
  S().loadProject('C:/story', createProject('Test'))
})

describe('Look & Feel values in the store', () => {
  it('setLookValue and resetLookValue change project.look and mark the story dirty', () => {
    expect(P().look).toEqual({})
    S().setLookValue('gui.accent_color', '#aa3344')
    S().setLookValue('gui.text_size', '30')
    expect(P().look).toEqual({ 'gui.accent_color': '#aa3344', 'gui.text_size': '30' })
    expect(S().dirty).toBe(true)
    S().resetLookValue('gui.accent_color')
    expect(P().look).toEqual({ 'gui.text_size': '30' })
    S().resetLookValue('gui.nothing')
    expect(P().look).toEqual({ 'gui.text_size': '30' })
  })

  it('is undoable and redoable', () => {
    S().setLookValue('gui.text_size', '30')
    S().setLookValue('gui.text_size', '34')
    S().resetLookValue('gui.text_size')
    expect(P().look).toEqual({})
    undo()
    expect(P().look).toEqual({ 'gui.text_size': '34' })
    undo()
    expect(P().look).toEqual({ 'gui.text_size': '30' })
    undo()
    expect(P().look).toEqual({})
    redo()
    redo()
    expect(P().look).toEqual({ 'gui.text_size': '34' })
  })

  it('values survive saving and loading the story file', () => {
    S().setLookValue('gui.accent_color', '#aa3344')
    const parsed = parseProject(JSON.parse(JSON.stringify(P())))
    expect(parsed.ok && parsed.project.look).toEqual({ 'gui.accent_color': '#aa3344' })
  })
})

describe('lookRequest', () => {
  const withAssets = (): Project => {
    const p = createProject('Test')
    const font = createAsset('font', 'My Font', 'fonts/abc.ttf')
    const box = createAsset('ui', 'Box', 'ui/box.png')
    const photo = createAsset('ui', 'Photo', 'ui/photo.jpg')
    p.assets[font.id] = font
    p.assets[box.id] = box
    p.assets[photo.id] = photo
    p.look = {
      'gui.accent_color': '#aa3344',
      'gui.text_size': '30',
      'gui.text_font': font.id,
      'gui/textbox.png': box.id,
      'gui/namebox.png': photo.id,
      'gui/main_menu.png': 'gone',
      'config.name': 'Nope',
      'gui.unknown': 'x'
    }
    return p
  }

  it('turns saved values into values, uploads and skipped reasons', () => {
    const p = withAssets()
    const r = lookRequest(p)
    expect(r.values).toEqual({ 'gui.accent_color': '#aa3344', 'gui.text_size': '30' })
    expect(r.uploads['gui.text_font']).toEqual({ file: 'fonts/abc.ttf', to: 'fonts/my_font.ttf' })
    expect(r.uploads['gui/textbox.png']).toEqual({ file: 'ui/box.png' })
    expect(Object.keys(r.uploads).sort()).toEqual(['gui.text_font', 'gui/textbox.png'])
    expect(r.skipped.map((s) => s.key).sort()).toEqual(['gui/main_menu.png', 'gui/namebox.png'])
  })

  it('can be limited to some fields', () => {
    expect(lookRequest(withAssets(), ['gui.text_size']).values).toEqual({ 'gui.text_size': '30' })
    expect(lookRequest(withAssets(), []).uploads).toEqual({})
  })

  it('gives a font the same game path the screen compiler would (fonts/<name>.<ext>)', () => {
    const p = withAssets()
    const second = createAsset('font', 'My Font', 'fonts/def.otf')
    p.assets[second.id] = second
    p.look = { 'gui.name_text_font': second.id }
    expect(lookRequest(p).uploads['gui.name_text_font']?.to).toMatch(/^fonts\/my_font(_2)?\.otf$/)
  })
})

describe('pendingLookKeys', () => {
  const entries = (over: Partial<Record<string, Partial<LookReadEntry>>> = {}): LookReadEntry[] =>
    LOOK_FIELDS.map((f) => ({ key: f.key, found: true, value: f.type === 'colour' ? '#7c9cff' : f.type === 'number' ? '22' : 'x', editedByHand: false, ...over[f.key] }))

  it('is empty when nothing differs, and lists what differs', () => {
    const p = createProject('T')
    expect(pendingLookKeys(p, entries())).toEqual([])
    p.look = { 'gui.accent_color': '#7C9CFF', 'gui.text_size': '22.0', 'gui.idle_color': '#000000' }
    expect(pendingLookKeys(p, entries())).toEqual(['gui.idle_color'])
  })

  it('leaves out fields that were edited by hand or are missing, and the read-only name', () => {
    const p = createProject('T')
    p.look = { 'gui.accent_color': '#000000', 'gui.text_size': '40', 'gui.idle_color': '#111111', 'config.name': 'Other' }
    const list = pendingLookKeys(
      p,
      entries({ 'gui.accent_color': { found: false, value: null, editedByHand: true }, 'gui.text_size': { found: false, value: null } })
    )
    expect(list).toEqual(['gui.idle_color'])
  })

  it('a picture counts until it has been applied in this session; a font until the game points at it', () => {
    const p = createProject('T')
    const font = createAsset('font', 'F', 'fonts/f.ttf')
    const box = createAsset('ui', 'B', 'ui/b.png')
    p.assets[font.id] = font
    p.assets[box.id] = box
    p.look = { 'gui.text_font': font.id, 'gui/textbox.png': box.id }
    expect(pendingLookKeys(p, entries())).toEqual(['gui.text_font', 'gui/textbox.png'])
    expect(pendingLookKeys(p, entries({ 'gui.text_font': { value: 'fonts/f.ttf' } }), { 'gui/textbox.png': box.id })).toEqual([])
  })
})

describe('lookSummary', () => {
  it('says what happened in one sentence', () => {
    expect(lookSummary([{ status: 'unchanged' }])).toBe('Nothing needed changing.')
    expect(lookSummary([{ status: 'applied' }])).toBe('1 setting written to the game.')
    expect(lookSummary([{ status: 'applied' }, { status: 'applied' }, { status: 'edited-by-hand' }, { status: 'not-found' }, { status: 'invalid' }], 1)).toBe(
      '2 settings written to the game, 1 left alone because you edited it by hand, 1 not found in the game files, 2 could not be used.'
    )
  })
})

describe('dialogue mock mapping', () => {
  const game = { width: 1280, height: 720 }

  it('maps the template defaults to percentages of the stage', () => {
    const m = dialogueMock({}, game)
    expect(m.boxHeightPct).toBeCloseTo((185 / 720) * 100, 2)
    expect(m.textLeftPct).toBeCloseTo((268 / 1280) * 100, 2)
    expect(m.textWidthPct).toBeCloseTo((744 / 1280) * 100, 2)
    expect(m.textTopPct).toBeCloseTo((50 / 185) * 100, 2)
    expect(m.nameLeftPct).toBeCloseTo((240 / 1280) * 100, 2)
    expect(m.textSizePct).toBeCloseTo((22 / 1280) * 100, 2)
    expect(m.nameSizePct).toBeCloseTo((30 / 1280) * 100, 2)
    expect(m.accent).toBe('#7c9cff')
    expect(m.text).toBe('#ffffff')
  })

  it('follows the chosen values, at any game size', () => {
    const values = { 'gui.accent_color': '#AA3344', 'gui.text_size': '40', 'gui.textbox_height': '360', 'gui.dialogue_xpos': '640', 'gui.dialogue_ypos': '90' }
    const m = dialogueMock(values, { width: 1920, height: 1080 })
    expect(m.accent).toBe('#aa3344')
    expect(m.boxHeightPct).toBeCloseTo((360 / 1080) * 100, 2)
    expect(m.textSizePct).toBeCloseTo((40 / 1920) * 100, 2)
    expect(m.textLeftPct).toBeCloseTo((640 / 1920) * 100, 2)
    expect(m.textTopPct).toBeCloseTo((90 / 360) * 100, 2)
  })

  it('falls back to the template for a value that is missing or not usable, and keeps the box inside the stage', () => {
    expect(mockColour({ 'gui.hover_color': 'red' }, 'gui.hover_color')).toBe('#b0c3ff')
    expect(mockNumber({ 'gui.text_size': 'big' }, 'gui.text_size', 1)).toBe(22)
    expect(mockNumber({ 'gui.text_size': '0' }, 'gui.text_size', 1)).toBe(22)
    expect(mockNumber({ 'gui.dialogue_xpos': '-20' }, 'gui.dialogue_xpos', -1280)).toBe(-20)
    expect(dialogueMock({ 'gui.textbox_height': '9999' }, game).boxHeightPct).toBe(100)
    for (const k of Object.keys(MOCK_DEFAULTS)) expect(MOCK_DEFAULTS[k]).toBeTruthy()
  })
})
