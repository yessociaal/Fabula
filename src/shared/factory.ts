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
  Expression,
  Id,
  InlineChoiceOption,
  Project,
  Scalar,
  Scene,
  Variable
} from './model'

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
  }
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

/** Deep copy with a fresh `id` on every nested object that has one. */
export function cloneWithNewIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => cloneWithNewIds(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === 'id' && typeof v === 'string' ? newId() : cloneWithNewIds(v)
    }
    return out as T
  }
  return value
}
