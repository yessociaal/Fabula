export type Id = string // nanoid(10)

export type Scalar = boolean | number | string

export interface Project {
  formatVersion: 1
  meta: { title: string; width: number; height: number; accentColor: string }
  renpyProjectDir: string | null
  startSceneId: Id | null
  scenes: Record<Id, Scene>
  chapters: Record<Id, Chapter>
  chapterOrder: Id[]
  characters: Record<Id, Character>
  characterOrder: Id[]
  variables: Record<Id, Variable>
  variableOrder: Id[]
  assets: Record<Id, Asset>
  screens: Record<Id, ScreenDef>
  screenOrder: Id[]
  scriptFiles: ScriptFile[]
  kits: string[]
  look: Record<string, string>
}

export interface Scene {
  id: Id
  name: string
  notes: string
  position: { x: number; y: number }
  chapterId: Id | null
  blocks: Block[]
  ending: Ending
  labelLock: string | null
  role: 'normal' | 'splashscreen'
}
export interface Chapter {
  id: Id
  name: string
  color: string
}

export type Transition =
  | 'none'
  | 'dissolve'
  | 'fade'
  | 'pixellate'
  | 'hpunch'
  | 'vpunch'
  | 'wipeleft'
  | 'wiperight'
  | 'slideleft'
  | 'slideright'
  | 'moveinleft'
  | 'moveinright'
  | 'moveoutleft'
  | 'moveoutright'
  | 'zoomin'
  | 'zoomout'
export type StagePosition = 'left' | 'center' | 'right'

export type Placement =
  | { mode: 'preset' }
  | { mode: 'custom'; xalign: number; yalign: number; zoom: number; rotate: number; alpha: number }

export type AudioChannel = 'music' | 'ambient'

export type CoreBlock =
  | { id: Id; type: 'say'; characterId: Id | null; text: string; voiceAssetId: Id | null }
  | { id: Id; type: 'background'; assetId: Id | null; transition: Transition }
  | {
      id: Id
      type: 'show'
      characterId: Id | null
      expressionId: Id | null
      position: StagePosition
      transition: Transition
      placement: Placement
      zorder: number
    }
  | { id: Id; type: 'hide'; characterId: Id | null; transition: Transition }
  | {
      id: Id
      type: 'playMusic'
      assetId: Id | null
      fadeIn: number
      loop: boolean
      channel: AudioChannel
    }
  | { id: Id; type: 'stopMusic'; fadeOut: number; channel: AudioChannel }
  | { id: Id; type: 'playSound'; assetId: Id | null }
  | { id: Id; type: 'setVariable'; effect: Effect }
  | { id: Id; type: 'pause'; seconds: number | null }
  | { id: Id; type: 'transition'; transition: Transition }

export interface Prompt {
  characterId: Id | null
  text: string
}

export interface InlineChoiceOption {
  id: Id
  text: string
  condition: Condition | null
  blocks: Block[]
}

export type ExtraBlock =
  | { id: Id; type: 'visit'; sceneId: Id | null }
  | { id: Id; type: 'if'; condition: Condition; then: Block[]; otherwise: Block[] }
  | { id: Id; type: 'inlineChoice'; prompt: Prompt | null; options: InlineChoiceOption[] }
  | { id: Id; type: 'ask'; variableId: Id | null; prompt: string; defaultText: string; maxLength: number }
  | { id: Id; type: 'movie'; assetId: Id | null }
  | { id: Id; type: 'window'; action: 'show' | 'hide' }
  | { id: Id; type: 'clearPage' }
  | { id: Id; type: 'screen'; action: 'show' | 'hide'; screenId: Id | null }
  | { id: Id; type: 'code'; code: string }
  | { id: Id; type: 'kit'; kitId: string; blockType: string; params: Record<string, unknown> }

export type Block = CoreBlock | ExtraBlock

export interface Effect {
  variableId: Id | null
  op: 'set' | 'add' | 'subtract' | 'toggle'
  value: Scalar
}

export interface NamedExit {
  id: Id
  name: string
  target: Id | null
}

export type CoreEnding =
  | { type: 'jump'; target: Id | null }
  | { type: 'choice'; prompt: Prompt | null; options: ChoiceOption[] }
  | { type: 'branch'; cases: BranchCase[]; elseTarget: Id | null }
  | { type: 'end' }

export type ExtraEnding =
  | { type: 'code'; code: string; exits: NamedExit[] }
  | { type: 'screen'; screenId: Id | null; targets: Record<Id, Id | null> }
  | { type: 'kit'; kitId: string; endingType: string; params: Record<string, unknown>; exits: NamedExit[] }

export type Ending = CoreEnding | ExtraEnding

export interface ChoiceOption {
  id: Id
  text: string
  condition: Condition | null
  effects: Effect[]
  target: Id | null
}
export interface BranchCase {
  id: Id
  condition: Condition
  target: Id | null
}

export interface Condition {
  join: 'and' | 'or'
  clauses: Clause[]
}
export type ClauseOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
export interface Clause {
  id: Id
  variableId: Id | null
  op: ClauseOp
  value: Scalar
}

export interface Variable {
  id: Id
  name: string
  type: 'boolean' | 'number' | 'text'
  defaultValue: Scalar
  description: string
  persistent: boolean
}
export interface Character {
  id: Id
  name: string
  color: string
  expressions: Expression[]
  mode: 'adv' | 'nvl'
  sideAssetId: Id | null
}
export interface Expression {
  id: Id
  name: string
  assetId: Id | null
}

export type AssetKind =
  | 'background'
  | 'sprite'
  | 'music'
  | 'sound'
  | 'ambient'
  | 'voice'
  | 'movie'
  | 'ui'
  | 'font'

export interface Asset {
  id: Id
  kind: AssetKind
  name: string
  file: string // relative to <editorProject>/assets, forward slashes
  width: number | null
  height: number | null
  bytes: number
}

export interface ScriptFile {
  id: Id
  name: string
  content: string
}

export interface ScreenDef {
  id: Id
  name: string
  modal: boolean
  elements: ScreenElement[]
}
export type ScreenAction =
  | { type: 'leave' }
  | { type: 'setVariable'; effect: Effect }
  | { type: 'showScreen'; screenId: Id | null }
  | { type: 'hideThis' }

export interface Box {
  id: Id
  name: string
  x: number
  y: number
  w: number
  h: number
}
export type ScreenElement =
  | (Box & { type: 'image'; assetId: Id | null })
  | (Box & { type: 'text'; text: string; size: number; color: string; fontAssetId: Id | null })
  | (Box & { type: 'button'; text: string; action: ScreenAction })
  | (Box & { type: 'imageButton'; idleAssetId: Id | null; hoverAssetId: Id | null; action: ScreenAction })
  | (Box & { type: 'hotspot'; action: ScreenAction })
  | (Box & { type: 'bar'; variableId: Id | null; max: number })

export type CoreBlockType = CoreBlock['type']
export type CoreEndingType = CoreEnding['type']

/** Extra block types the palette can create (the rest of ExtraBlock arrives in later phases). */
export type NewExtraBlockType = 'ask' | 'movie' | 'window' | 'clearPage'
export type CreatableBlockType = CoreBlockType | NewExtraBlockType
