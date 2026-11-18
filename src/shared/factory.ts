import { nanoid } from 'nanoid'
import type {
  Asset,
  AssetKind,
  BranchCase,
  Block,
  Chapter,
  Character,
  ChoiceOption,
  Clause,
  Condition,
  CreatableBlockType,
  Effect,
  Ending,
  Expression,
  Id,
  InlineChoiceOption,
  NamedExit,
  Project,
  Scalar,
  Scene,
  ScreenAction,
  ScreenDef,
  ScreenElement,
  ScreenElementType,
  Variable
} from './model'
import { slugify } from './naming'

export const newId = (): Id => nanoid(10)

export function createProject(title: string): Project {
  const start = createScene({ x: 0, y: 0 }, 'Start')
  return {
    formatVersion: 1,
    meta: { title, width: 1920, height: 1080, accentColor: '#7c9cff' },
    renpyProjectDir: null,
    startSceneId: start.id,
    scenes: { [start.id]: start },
    chapters: {},
    chapterOrder: [],
    characters: {},
    characterOrder: [],
    variables: {},
    variableOrder: [],
    assets: {},
    screens: {},
    screenOrder: [],
    scriptFiles: [],
    kits: [],
    look: {}
  }
}

export function createScene(position: { x: number; y: number }, name = 'New scene'): Scene {
  return {
    id: newId(),
    name,
    notes: '',
    position: { x: position.x, y: position.y },
    chapterId: null,
    blocks: [],
    ending: { type: 'jump', target: null },
    labelLock: null,
    role: 'normal'
  }
}

export function createBlock(type: CreatableBlockType): Block {
  const id = newId()
  switch (type) {
    case 'say':
      return { id, type, characterId: null, text: '', voiceAssetId: null }
    case 'background':
      return { id, type, assetId: null, transition: 'none' }
    case 'show':
      return {
        id,
        type,
        characterId: null,
        expressionId: null,
        position: 'center',
        transition: 'none',
        placement: { mode: 'preset' },
        zorder: 0
      }
    case 'hide':
      return { id, type, characterId: null, transition: 'none' }
    case 'playMusic':
      return { id, type, assetId: null, fadeIn: 0, loop: true, channel: 'music' }
    case 'stopMusic':
      return { id, type, fadeOut: 0, channel: 'music' }
    case 'playSound':
      return { id, type, assetId: null }
    case 'setVariable':
      return { id, type, effect: createEffect() }
    case 'pause':
      return { id, type, seconds: null }
    case 'transition':
      return { id, type, transition: 'dissolve' }
    case 'ask':
      return { id, type, variableId: null, prompt: '', defaultText: '', maxLength: 20 }
    case 'movie':
      return { id, type, assetId: null }
    case 'window':
      return { id, type, action: 'hide' }
    case 'clearPage':
      return { id, type }
    case 'visit':
      return { id, type, sceneId: null }
    case 'if':
      return { id, type, condition: createCondition(), then: [], otherwise: [] }
    case 'inlineChoice':
      return { id, type, prompt: null, options: [createInlineOption(), createInlineOption()] }
    case 'code':
      return { id, type, code: '' }
    case 'screen':
      return { id, type, action: 'show', screenId: null }
  }
}

export function createNamedExit(name: string, target: Id | null = null): NamedExit {
  return { id: newId(), name, target }
}

export function createInlineOption(text = ''): InlineChoiceOption {
  return { id: newId(), text, condition: null, blocks: [] }
}

export function createEffect(variableId: Id | null = null): Effect {
  return { variableId, op: 'set', value: true }
}

export function createClause(variableId: Id | null = null): Clause {
  return { id: newId(), variableId, op: 'eq', value: true }
}

export function createCondition(): Condition {
  return { join: 'and', clauses: [createClause()] }
}

export function createOption(text = ''): ChoiceOption {
  return { id: newId(), text, condition: null, effects: [], target: null }
}

export function createCase(): BranchCase {
  return { id: newId(), condition: createCondition(), target: null }
}

export function createExpression(name = 'default', assetId: Id | null = null): Expression {
  return { id: newId(), name, assetId }
}

export function createCharacter(name = 'Character', color = '#e86a92'): Character {
  return { id: newId(), name, color, expressions: [], mode: 'adv', sideAssetId: null }
}

export function defaultValueFor(type: Variable['type']): Scalar {
  return type === 'boolean' ? false : type === 'number' ? 0 : ''
}

export function createVariable(name = 'value', type: Variable['type'] = 'number'): Variable {
  return {
    id: newId(),
    name,
    type,
    defaultValue: defaultValueFor(type),
    description: '',
    persistent: false
  }
}

export function createChapter(name = 'Chapter', color = '#7c9cff'): Chapter {
  return { id: newId(), name, color }
}

export function createAsset(
  kind: AssetKind,
  name: string,
  file: string,
  extra: Partial<Pick<Asset, 'width' | 'height' | 'bytes'>> = {}
): Asset {
  return { id: newId(), kind, name, file, width: null, height: null, bytes: 0, ...extra }
}

/**
 * Deep copy with a fresh "id" on every nested object that has one. The same old id always becomes the same new id inside
 * one copy, so things that point at each other by id (a kit ending's exits and the list items they come from) stay linked.
 */
export function cloneWithNewIds<T>(value: T, map: Map<string, string> = new Map()): T {
  if (Array.isArray(value)) return value.map((v) => cloneWithNewIds(v, map)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id' && typeof v === 'string') {
        let fresh = map.get(v)
        if (fresh === undefined) map.set(v, (fresh = newId()))
        out[k] = fresh
      } else out[k] = cloneWithNewIds(v, map)
    }
    return out as T
  }
  return value
}

/** A kit block with the given form values (see defaultParams in kits/fields.ts for the starting ones). */
export function createKitBlock(kitId: string, blockType: string, params: Record<string, unknown>): Block {
  return { id: newId(), type: 'kit', kitId, blockType, params }
}

/** A kit ending; its exits come from syncKitExits. */
export function createKitEnding(kitId: string, endingType: string, params: Record<string, unknown>, exits: NamedExit[] = []): Ending {
  return { type: 'kit', kitId, endingType, params, exits }
}

export function createScreen(name = 'New screen'): ScreenDef {
  return { id: newId(), name, modal: false, elements: [] }
}

/** The names the Properties panel starts new elements with. */
export const ELEMENT_LABELS: Record<ScreenElementType, string> = {
  image: 'image',
  text: 'text',
  button: 'button',
  imageButton: 'image button',
  hotspot: 'hotspot',
  bar: 'bar'
}

/** The size a new element starts with, in game pixels. */
export const ELEMENT_DEFAULT_SIZE: Record<ScreenElementType, { w: number; h: number }> = {
  image: { w: 400, h: 300 },
  text: { w: 300, h: 50 },
  button: { w: 220, h: 60 },
  imageButton: { w: 200, h: 100 },
  hotspot: { w: 200, h: 150 },
  bar: { w: 300, h: 24 }
}

export function createScreenAction(type: ScreenAction['type'] = 'leave'): ScreenAction {
  switch (type) {
    case 'leave':
      return { type }
    case 'setVariable':
      return { type, effect: createEffect() }
    case 'showScreen':
      return { type, screenId: null }
    case 'hideThis':
      return { type }
  }
}

/** A new element of the given type with its top-left corner at (x, y). The name is unique among `takenNames` ("button 1", "button 2"…). */
export function createScreenElement(type: ScreenElementType, x: number, y: number, takenNames: readonly string[] = []): ScreenElement {
  const taken = new Set(takenNames.map((n) => slugify(n, 'element')))
  let n = 1
  while (taken.has(slugify(`${ELEMENT_LABELS[type]} ${n}`, 'element'))) n++
  const box = { id: newId(), name: `${ELEMENT_LABELS[type]} ${n}`, x: Math.round(x), y: Math.round(y), ...ELEMENT_DEFAULT_SIZE[type] }
  switch (type) {
    case 'image':
      return { ...box, type, assetId: null }
    case 'text':
      return { ...box, type, text: 'Text', size: 36, color: '#ffffff', fontAssetId: null }
    case 'button':
      return { ...box, type, text: 'Button', action: createScreenAction('leave') }
    case 'imageButton':
      return { ...box, type, idleAssetId: null, hoverAssetId: null, action: createScreenAction('leave') }
    case 'hotspot':
      return { ...box, type, action: createScreenAction('leave') }
    case 'bar':
      return { ...box, type, variableId: null, max: 10 }
  }
}
