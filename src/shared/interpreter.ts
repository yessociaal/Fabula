import type { Effect, Id, Project, Scalar } from './model'
import { evaluateCondition, type VariableValues } from './conditions'
import { applyBlockToStage, type StageState } from './stage'

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

export interface PlayState {
  sceneId: Id | null
  blockIndex: number
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
  variables: VariableValues
  /** Names of the scenes visited, in order. */
  history: string[]
  status: 'running' | 'ended'
  /** Why the story stopped early (an exit with no target, for example). */
  notice: string | null
}

export type PlayInput = { type: 'advance' } | { type: 'choose'; optionId: Id } | { type: 'answer'; text: string }

export const NOWHERE_NOTICE = 'This exit goes nowhere'
/** A story that loops forever without ever waiting for the player is stopped after this many actions in one step. */
const MAX_ACTIONS = 5000

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
  return { ...s, stage: { ...s.stage, sprites: s.stage.sprites.map((x) => ({ ...x })) }, history: [...s.history] }
}

function finish(s: PlayState, notice: string | null): void {
  s.status = 'ended'
  s.line = null
  s.pause = null
  s.menu = null
  s.ask = null
  s.movie = null
  s.notice = notice
}

function goTo(project: Project, s: PlayState, target: Id | null): void {
  const scene = target ? project.scenes[target] : undefined
  if (!scene) return finish(s, NOWHERE_NOTICE)
  s.sceneId = scene.id
  s.blockIndex = 0
  s.history.push(scene.name)
}

/** Run blocks and endings until something needs the player (a line, a pause, a menu) or the story ends. */
function run(project: Project, s: PlayState): void {
  for (let actions = 0; s.status === 'running'; actions++) {
    if (actions > MAX_ACTIONS) return finish(s, 'Stopped: the story loops without waiting for the player')
    const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
    if (!scene) return finish(s, NOWHERE_NOTICE)

    if (s.blockIndex < scene.blocks.length) {
      const block = scene.blocks[s.blockIndex]
      s.blockIndex++
      switch (block.type) {
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

    const ending = scene.ending
    switch (ending.type) {
      case 'jump':
        goTo(project, s, ending.target)
        break
      case 'end':
        return finish(s, null)
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
    blockIndex: 0,
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
  if (input.type === 'advance') {
    if (s.menu || s.ask) return state
    s.line = null
    s.pause = null
    s.movie = null
    run(project, s)
    return s
  }
  if (!s.menu || !s.menu.some((o) => o.id === input.optionId)) return state
  const scene = s.sceneId ? project.scenes[s.sceneId] : undefined
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
