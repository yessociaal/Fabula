import { getBlockAt, resolveList, type BlockPath } from './blockTree'
import type { Effect, Id, Project, Scalar } from './model'
import { evaluateCondition, type VariableValues } from './conditions'
import { applyBlockToStage, type StageState } from './stage'
import { actionOf, leaveElements } from './screens'

/** The line currently on screen (dialogue, or the prompt of a choice). */
export interface PlayLine {
  characterId: Id | null
  text: string
}

export interface PlayMenuOption {
  id: Id
  text: string
}

/** An Ask the player block waiting for the typed answer. */
export interface PlayAsk {
  variableId: Id | null
  prompt: string
  defaultText: string
  maxLength: number
}

/** Where a Visit block returns to: the scene it was in and the position right after the Visit block. */
export interface ReturnPoint {
  sceneId: Id
  cursor: BlockPath
}

export interface PlayState {
  sceneId: Id | null
  /**
   * The next block to run, as a block path (see blockTree.ts): the last step's `i` is the index of the next block in its list,
   * the steps before it say which containers the story is inside (each with the branch it is in).
   */
  cursor: BlockPath
  /** Visit blocks that have not finished yet, innermost last. An End ending pops the last one and carries on after its Visit block. */
  callStack: ReturnPoint[]
  /** While an inline Choice block is showing its options: the path of that block. */
  inlineMenu: BlockPath | null
  stage: StageState
  /** Whether the current music track loops. */
  musicLoop: boolean
  /** Counts playSound blocks; `sound` holds the latest one. The view plays it when `soundSeq` changes. */
  soundSeq: number
  sound: Id | null
  /** Counts voiced lines; `voice` holds the latest voice file. The view plays it when `voiceSeq` changes. */
  voiceSeq: number
  voice: Id | null
  /** The ambient track (second audio channel) and whether it loops. */
  ambient: Id | null
  ambientLoop: boolean
  line: PlayLine | null
  /** Waiting for the player to type an answer (Ask the player). */
  ask: PlayAsk | null
  /** Waiting on a movie block: Quick play shows a placeholder and continues on click. */
  movie: { assetId: Id | null } | null
  /** Waiting on a pause block: null seconds = wait for a click. */
  pause: { seconds: number | null } | null
  /** Waiting for the player to pick one of these (already filtered by their conditions). */
  menu: PlayMenuOption[] | null
  /**
   * A code ending is showing: Quick play cannot run Ren'Py code, so the player picks which named exit to follow
   * (ids are the NamedExit ids).
   */
  codeExits: PlayMenuOption[] | null
  /** A Ren'Py code block was passed over without running (it cannot run in Quick play). */
  skippedCode: boolean
  /**
   * A kit ending is showing: Quick play cannot run kit code, so the player picks which exit to follow (ids are the NamedExit ids).
   * `kitId` lets the view say which kit it is.
   */
  kitEnding: { kitId: string; endingType: string; exits: PlayMenuOption[] } | null
  /** Designed screens that are on screen right now (shown by a Show screen block or a Show screen action), in the order they were shown. */
  shownScreens: Id[]
  /** A screen ending is showing: the story waits for the player to click one of the screen's leaving elements. */
  screenEnding: { screenId: Id } | null
  /** Ids of the kits whose blocks were passed over in this scene without running (kit code only runs in real Ren'Py). */
  skippedKits: string[]
  variables: VariableValues
  /** Names of the scenes visited, in order. */
  history: string[]
  status: 'running' | 'ended'
  /** Why the story stopped early (an exit with no target, for example). */
  notice: string | null
}

export type PlayInput =
  | { type: 'advance' }
  | { type: 'choose'; optionId: Id }
  | { type: 'answer'; text: string }
  /** Follow one exit of a code ending. */
  | { type: 'exit'; exitId: Id }
  /** The player clicked an element of a designed screen that is on screen. */
  | { type: 'screenAction'; screenId: Id; elementId: Id }

export const NOWHERE_NOTICE = 'This exit goes nowhere'
export const CODE_BLOCK_NOTICE = "This scene runs Ren'Py code that Quick play cannot run"
export const CODE_ENDING_TITLE = "Ren'Py code ending: pick which exit to take"
/** The side-panel line for a scene that passed over blocks of a kit. */
export const kitBlockNotice = (kitName: string): string => `This scene uses the ${kitName} kit, which Quick play cannot run`
export const kitEndingTitle = (kitName: string): string => `${kitName}: pick what happens`
export const KIT_ENDING_NOTICE = "Kit code only runs in real Ren'Py. Use Play in Ren'Py to see what it really does."
export const CODE_ENDING_NOTICE = "Quick play cannot run Ren'Py code. Use Play in Ren'Py to see what the code really does."
/** A story that loops forever without ever waiting for the player is stopped after this many actions in one step. */
const MAX_ACTIONS = 5000
/** Scenes that visit each other without end are stopped at this many open visits. */
const MAX_CALL_DEPTH = 64

/** Apply one variable change. Changes that do not fit the variable's type are ignored. */
export function applyEffect(values: VariableValues, effect: Effect): VariableValues {
  if (effect.variableId === null) return values
  const current = values[effect.variableId]
  if (current === undefined) return values
  let next: Scalar = current
  switch (effect.op) {
    case 'set':
      next = effect.value
      break
    case 'add':
      if (typeof current === 'number' && typeof effect.value === 'number') next = current + effect.value
      else if (typeof current === 'string' && typeof effect.value === 'string') next = current + effect.value
      break
    case 'subtract':
      if (typeof current === 'number' && typeof effect.value === 'number') next = current - effect.value
      break
    case 'toggle':
      if (typeof current === 'boolean') next = !current
      break
  }
  return next === current ? values : { ...values, [effect.variableId]: next }
}

export function defaultVariables(project: Project): VariableValues {
  const values: VariableValues = {}
  for (const id of project.variableOrder) {
    const v = project.variables[id]
    if (v) values[id] = v.defaultValue
  }
  return values
}

function cloneState(s: PlayState): PlayState {
  return {
    ...s,
    stage: { ...s.stage, sprites: s.stage.sprites.map((x) => ({ ...x })) },
    history: [...s.history],
    cursor: [...s.cursor],
    callStack: [...s.callStack],
    inlineMenu: s.inlineMenu ? [...s.inlineMenu] : null,
    shownScreens: [...s.shownScreens],
    screenEnding: s.screenEnding ? { ...s.screenEnding } : null
  }
}

function finish(s: PlayState, notice: string | null): void {
  s.status = 'ended'
  s.line = null
  s.pause = null
  s.menu = null
  s.codeExits = null
  s.kitEnding = null
  s.screenEnding = null
  s.ask = null
  s.movie = null
  s.notice = notice
}

function goTo(project: Project, s: PlayState, target: Id | null): void {
  const scene = target ? project.scenes[target] : undefined
  if (!scene) return finish(s, NOWHERE_NOTICE)
  s.sceneId = scene.id
  s.cursor = [{ i: 0 }]
  s.skippedCode = false
  s.skippedKits = []
  s.history.push(scene.name)
}

/** Run blocks and endings until something needs the player (a line, a pause, a menu) or the story ends. */
function run(project: Project, s: PlayState): void {
  for (let actions = 0; s.status === 'running'; actions++) {
    if (actions > MAX_ACTIONS) return finish(s, 'Stopped: the story loops without waiting for the player')
    const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
    if (!scene) return finish(s, NOWHERE_NOTICE)

    const prefix = s.cursor.slice(0, -1)
    const list = resolveList(scene.blocks, prefix)
    if (!list || s.cursor.length === 0) return finish(s, 'Quick play lost its place in this scene')
    const at = s.cursor[s.cursor.length - 1].i

    if (at < list.length) {
      const block = list[at]
      s.cursor = [...prefix, { i: at + 1 }]
      switch (block.type) {
        case 'visit': {
          const target = block.sceneId ? project.scenes[block.sceneId] : undefined
          if (!target) break
          if (s.callStack.length >= MAX_CALL_DEPTH) return finish(s, 'Stopped: scenes visit each other without ever finishing')
          s.callStack.push({ sceneId: scene.id, cursor: s.cursor })
          s.sceneId = target.id
          s.cursor = [{ i: 0 }]
          s.skippedCode = false
          s.skippedKits = []
          s.history.push(target.name)
          break
        }
        case 'if': {
          const key = evaluateCondition(block.condition, s.variables) ? 'then' : 'otherwise'
          if (block[key].length > 0) s.cursor = [...prefix, { i: at, in: key }, { i: 0 }]
          break
        }
        case 'inlineChoice': {
          const options = block.options.filter((o) => o.condition === null || evaluateCondition(o.condition, s.variables))
          if (options.length === 0) break
          s.line = block.prompt ? { characterId: block.prompt.characterId, text: block.prompt.text } : null
          s.menu = options.map((o) => ({ id: o.id, text: o.text }))
          s.inlineMenu = [...prefix, { i: at }]
          return
        }
        case 'screen': {
          if (block.screenId === null || !project.screens[block.screenId]) break
          const id = block.screenId
          if (block.action === 'show') {
            if (!s.shownScreens.includes(id)) s.shownScreens = [...s.shownScreens, id]
          } else s.shownScreens = s.shownScreens.filter((x) => x !== id)
          break
        }
        case 'code':
          if (block.code.trim() !== '') s.skippedCode = true
          break
        case 'kit':
          if (!s.skippedKits.includes(block.kitId)) s.skippedKits = [...s.skippedKits, block.kitId]
          break
        case 'say':
          s.line = { characterId: block.characterId, text: block.text }
          if (block.voiceAssetId) {
            s.voiceSeq++
            s.voice = block.voiceAssetId
          }
          return
        case 'ask':
          s.ask = {
            variableId: block.variableId,
            prompt: block.prompt,
            defaultText: block.defaultText,
            maxLength: block.maxLength
          }
          return
        case 'movie':
          s.movie = { assetId: block.assetId }
          return
        case 'pause':
          s.pause = { seconds: block.seconds }
          return
        case 'setVariable':
          s.variables = applyEffect(s.variables, block.effect)
          break
        case 'playSound':
          if (block.assetId) {
            s.soundSeq++
            s.sound = block.assetId
          }
          break
        case 'playMusic':
          applyBlockToStage(s.stage, block)
          if (block.channel === 'music') s.musicLoop = block.loop
          else {
            s.ambient = block.assetId
            s.ambientLoop = block.loop
          }
          break
        case 'stopMusic':
          applyBlockToStage(s.stage, block)
          if (block.channel === 'ambient') s.ambient = null
          break
        default:
          applyBlockToStage(s.stage, block)
          break
      }
      continue
    }

    if (s.cursor.length > 1) {
      // The end of a branch: carry on after the container.
      const up = s.cursor.slice(0, -1)
      s.cursor = [...up.slice(0, -1), { i: up[up.length - 1].i + 1 }]
      continue
    }

    const ending = scene.ending
    switch (ending.type) {
      case 'jump':
        goTo(project, s, ending.target)
        break
      case 'end': {
        const back = s.callStack.pop()
        if (!back) return finish(s, null)
        const caller = project.scenes[back.sceneId]
        if (!caller) return finish(s, NOWHERE_NOTICE)
        s.sceneId = caller.id
        s.cursor = back.cursor
        s.history.push(caller.name)
        break
      }
      case 'branch': {
        const hit = ending.cases.find((c) => evaluateCondition(c.condition, s.variables))
        goTo(project, s, hit ? hit.target : ending.elseTarget)
        break
      }
      case 'choice': {
        const options = ending.options.filter((o) => o.condition === null || evaluateCondition(o.condition, s.variables))
        if (options.length === 0) return finish(s, 'No choices are available')
        s.line = ending.prompt ? { characterId: ending.prompt.characterId, text: ending.prompt.text } : null
        s.menu = options.map((o) => ({ id: o.id, text: o.text }))
        return
      }
      case 'code': {
        if (ending.exits.length === 0) return finish(s, "This Ren'Py code ending has no exits to follow")
        s.codeExits = ending.exits.map((x) => ({ id: x.id, text: x.name.trim() === '' ? 'Untitled exit' : x.name }))
        if (ending.code.trim() !== '') s.skippedCode = true
        return
      }
      case 'screen': {
        const def = ending.screenId === null ? undefined : project.screens[ending.screenId]
        if (!def) return finish(s, NOWHERE_NOTICE)
        if (leaveElements(def).length === 0) return finish(s, 'This screen has no way to leave')
        s.screenEnding = { screenId: def.id }
        return
      }
      case 'kit': {
        if (ending.exits.length === 0) return finish(s, 'This kit ending has no exits to follow')
        s.kitEnding = {
          kitId: ending.kitId,
          endingType: ending.endingType,
          exits: ending.exits.map((x) => ({ id: x.id, text: x.name.trim() === '' ? 'Untitled exit' : x.name }))
        }
        return
      }
      default:
        return finish(s, 'Quick play cannot run this kind of ending')
    }
  }
}

/** The state at the very start of a story, beginning in `sceneId`, run until the first thing that needs the player. */
export function start(project: Project, sceneId: Id | null): PlayState {
  const scene = sceneId ? project.scenes[sceneId] : undefined
  const s: PlayState = {
    sceneId: scene ? scene.id : null,
    cursor: [{ i: 0 }],
    callStack: [],
    inlineMenu: null,
    stage: { background: null, sprites: [], music: null },
    musicLoop: true,
    soundSeq: 0,
    sound: null,
    voiceSeq: 0,
    voice: null,
    ambient: null,
    ambientLoop: true,
    line: null,
    ask: null,
    movie: null,
    pause: null,
    menu: null,
    codeExits: null,
    kitEnding: null,
    shownScreens: [],
    screenEnding: null,
    skippedKits: [],
    skippedCode: false,
    variables: defaultVariables(project),
    history: scene ? [scene.name] : [],
    status: 'running',
    notice: null
  }
  run(project, s)
  return s
}

/**
 * Pure step: the next state after the player clicks (`advance`) or picks an option (`choose`).
 * The input state is never modified. Inputs that do not fit the current state return it unchanged.
 */
export function step(project: Project, state: PlayState, input: PlayInput): PlayState {
  if (state.status !== 'running') return state
  const s = cloneState(state)
  if (input.type === 'answer') {
    const ask = s.ask
    if (!ask) return state
    s.ask = null
    const variable = ask.variableId === null ? undefined : project.variables[ask.variableId]
    if (variable && variable.type === 'text') {
      const limited = ask.maxLength > 0 ? input.text.slice(0, Math.floor(ask.maxLength)) : input.text
      s.variables = { ...s.variables, [variable.id]: limited.trim() }
    }
    run(project, s)
    return s
  }
  if (input.type === 'exit') {
    const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
    const ending = scene?.ending
    const isCode = s.codeExits !== null && ending?.type === 'code'
    const isKit = s.kitEnding !== null && ending?.type === 'kit'
    if (!ending || (!isCode && !isKit) || (ending.type !== 'code' && ending.type !== 'kit')) return state
    const exit = ending.exits.find((x) => x.id === input.exitId)
    if (!exit) return state
    s.codeExits = null
    s.kitEnding = null
    goTo(project, s, exit.target)
    run(project, s)
    return s
  }
  if (input.type === 'screenAction') {
    if (!s.shownScreens.includes(input.screenId) && s.screenEnding?.screenId !== input.screenId) return state
    const def = project.screens[input.screenId]
    const element = def?.elements.find((el) => el.id === input.elementId)
    const action = element ? actionOf(element) : null
    if (!def || !action) return state
    switch (action.type) {
      case 'setVariable':
        s.variables = applyEffect(s.variables, action.effect)
        return s
      case 'showScreen':
        if (action.screenId !== null && project.screens[action.screenId] && !s.shownScreens.includes(action.screenId)) {
          s.shownScreens = [...s.shownScreens, action.screenId]
        }
        return s
      case 'hideThis':
        // Like Hide() in Ren'Py: it closes a screen that was shown. A screen that is the ending of the scene stays up.
        s.shownScreens = s.shownScreens.filter((x) => x !== def.id)
        return s
      case 'leave': {
        const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
        const ending = scene?.ending
        if (!s.screenEnding || s.screenEnding.screenId !== def.id || !ending || ending.type !== 'screen') return state
        if (!leaveElements(def).some((el) => el.id === element?.id)) return state
        s.screenEnding = null
        goTo(project, s, ending.targets[input.elementId] ?? null)
        run(project, s)
        return s
      }
    }
  }
  if (input.type === 'advance') {
    if (s.menu || s.ask || s.codeExits || s.kitEnding || s.screenEnding) return state
    // A modal screen on screen blocks the dialogue behind it, as in Ren'Py.
    if (s.shownScreens.some((id) => project.screens[id]?.modal)) return state
    s.line = null
    s.pause = null
    s.movie = null
    run(project, s)
    return s
  }
  if (!s.menu || !s.menu.some((o) => o.id === input.optionId)) return state
  const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
  if (s.inlineMenu) {
    const block = scene ? getBlockAt(scene.blocks, s.inlineMenu) : undefined
    const picked = block && block.type === 'inlineChoice' ? block.options.find((o) => o.id === input.optionId) : undefined
    if (!block || !picked) return state
    const menuAt = s.inlineMenu
    s.line = null
    s.menu = null
    s.inlineMenu = null
    s.cursor = [...menuAt.slice(0, -1), { i: menuAt[menuAt.length - 1].i, in: `opt:${picked.id}` }, { i: 0 }]
    run(project, s)
    return s
  }
  const ending = scene?.ending
  const option = ending && ending.type === 'choice' ? ending.options.find((o) => o.id === input.optionId) : undefined
  if (!option) return state
  s.line = null
  s.menu = null
  for (const effect of option.effects) s.variables = applyEffect(s.variables, effect)
  goTo(project, s, option.target)
  run(project, s)
  return s
}
