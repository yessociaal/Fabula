import type { Block, Effect, Id, Project, Scalar } from '@shared/model'
import { summaryLine } from '@shared/kits/fields'
import { findBlockDef, findKit, type KitContext } from '@shared/kits/types'
import { conditionToWords } from '@shared/conditions'
import { firstCodeLine } from '@shared/codeRefs'
import { transitionLabel } from './editorHelpers'

export interface BlockSummary {
  /** Short bold part: "Anna", "Narration", "Background", "Show"… */
  title: string
  /** The rest of the one-liner: `"You made it!"`, `Forest · fade`… */
  detail: string
}

export const MAX_SUMMARY_TEXT = 60

/** One line of text: line breaks become spaces, long text is cut with an ellipsis. */
export function oneLine(text: string, max: number = MAX_SUMMARY_TEXT): string {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function seconds(n: number): string {
  return `${Number.isInteger(n) ? n : String(n)}s`
}

const POSITION_WORD = { left: 'left', center: 'centre', right: 'right' } as const

function valueWord(value: Scalar): string {
  return typeof value === 'string' ? `"${oneLine(value, 24)}"` : typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
}

/** Plain-English sentence for one variable change, e.g. `Add 2 to Courage`. */
export function describeEffect(effect: Effect, project: Project): string {
  const variable = effect.variableId === null ? undefined : project.variables[effect.variableId]
  if (!variable) return effect.variableId === null ? 'Pick a variable' : 'Missing variable'
  switch (effect.op) {
    case 'set':
      return `Set ${variable.name} to ${valueWord(effect.value)}`
    case 'add':
      return `Add ${valueWord(effect.value)} to ${variable.name}`
    case 'subtract':
      return `Subtract ${valueWord(effect.value)} from ${variable.name}`
    case 'toggle':
      return `Flip ${variable.name}`
  }
}

function assetName(project: Project, id: Id | null, missing: string): string {
  if (id === null) return missing
  return project.assets[id]?.name ?? 'Missing file'
}

function withTransition(parts: string[], transition: Parameters<typeof transitionLabel>[0]): string {
  return (transition === 'none' ? parts : [...parts, transitionLabel(transition).toLowerCase()]).join(' · ')
}

export function summarizeBlock(block: Block, project: Project, context: KitContext = {}): BlockSummary {
  switch (block.type) {
    case 'kit': {
      const kit = findKit(context, block.kitId)
      const def = findBlockDef(kit, block.blockType)
      if (!kit || !def) return { title: 'Kit', detail: `Kit "${block.kitId}" is not available` }
      return { title: def.name, detail: oneLine(summaryLine(def.summary, def.name, def.fields, block.params)) }
    }
    case 'say': {
      const text = block.text.trim() === '' ? '(empty)' : `"${oneLine(block.text)}"`
      if (block.characterId === null) return { title: 'Narration', detail: text }
      const c = project.characters[block.characterId]
      return { title: c ? c.name || 'Unnamed character' : 'Missing character', detail: text }
    }
    case 'background':
      return {
        title: 'Background',
        detail: withTransition(
          [block.assetId === null ? 'Black' : assetName(project, block.assetId, 'Black')],
          block.transition
        )
      }
    case 'show': {
      const c = block.characterId === null ? undefined : project.characters[block.characterId]
      if (!c) return { title: 'Show', detail: block.characterId === null ? 'Pick a character' : 'Missing character' }
      const expr = block.expressionId === null ? undefined : c.expressions.find((e) => e.id === block.expressionId)
      const where = block.placement.mode === 'custom' ? 'custom position' : POSITION_WORD[block.position]
      const parts = [c.name, expr ? expr.name : 'no expression picked', where]
      return { title: 'Show', detail: withTransition(parts, block.transition) }
    }
    case 'hide': {
      const c = block.characterId === null ? undefined : project.characters[block.characterId]
      if (!c) return { title: 'Hide', detail: block.characterId === null ? 'Pick a character' : 'Missing character' }
      return { title: 'Hide', detail: withTransition([c.name], block.transition) }
    }
    case 'playMusic': {
      const parts = [assetName(project, block.assetId, block.channel === 'ambient' ? 'Pick an ambient sound' : 'Pick a track')]
      if (block.fadeIn > 0) parts.push(`fade in ${seconds(block.fadeIn)}`)
      if (!block.loop) parts.push('plays once')
      return { title: block.channel === 'ambient' ? 'Play ambient' : 'Play music', detail: parts.join(' · ') }
    }
    case 'stopMusic':
      return { title: block.channel === 'ambient' ? 'Stop ambient' : 'Stop music', detail: block.fadeOut > 0 ? `fade out ${seconds(block.fadeOut)}` : 'right away' }
    case 'playSound':
      return { title: 'Play sound', detail: assetName(project, block.assetId, 'Pick a sound') }
    case 'setVariable':
      return { title: 'Variable', detail: describeEffect(block.effect, project) }
    case 'pause':
      return {
        title: 'Pause',
        detail: block.seconds === null ? 'Until click' : block.seconds === 1 ? 'For 1 second' : `For ${block.seconds} seconds`
      }
    case 'transition':
      return { title: 'Transition', detail: transitionLabel(block.transition) }
    case 'ask': {
      const variable = block.variableId === null ? undefined : project.variables[block.variableId]
      const prompt = block.prompt.trim() === '' ? 'no question yet' : `"${oneLine(block.prompt, 40)}"`
      return { title: 'Ask the player', detail: `${prompt} → ${variable ? variable.name : 'pick a variable'}` }
    }
    case 'movie':
      return { title: 'Movie', detail: assetName(project, block.assetId, 'Pick a movie') }
    case 'window':
      return { title: 'Text box', detail: block.action === 'show' ? 'Show' : 'Hide' }
    case 'clearPage':
      return { title: 'Clear page', detail: 'Start a fresh NVL page' }
    case 'code': {
      const first = firstCodeLine(block.code)
      return { title: "Ren'Py code", detail: first === '' ? '(empty)' : oneLine(first, 50) }
    }
    case 'visit': {
      const scene = block.sceneId === null ? undefined : project.scenes[block.sceneId]
      return { title: 'Visit scene', detail: scene ? `${scene.name || 'Untitled scene'} · then comes back here` : block.sceneId === null ? 'Pick a scene' : 'Missing scene' }
    }
    case 'if': {
      const words = conditionToWords(block.condition, (id) => project.variables[id]?.name || 'a variable')
      const usable = block.condition.clauses.some((c) => c.variableId !== null)
      return { title: 'If', detail: usable ? oneLine(words, 50) : 'Pick a condition' }
    }
    case 'inlineChoice': {
      const n = block.options.length
      const options = n === 1 ? '1 option' : `${n} options`
      const prompt = block.prompt && block.prompt.text.trim() !== '' ? `"${oneLine(block.prompt.text, 36)}" · ` : ''
      return { title: 'Choice', detail: `${prompt}${options} · stays in this scene` }
    }
    default:
      return { title: 'Block', detail: (block as { type: string }).type }
  }
}

/** The whole one-liner as a single string, e.g. `Show: Anna · Happy · left`. */
export function summaryText(block: Block, project: Project, context: KitContext = {}): string {
  const s = summarizeBlock(block, project, context)
  if (block.type === 'say') return `${s.title} ${s.detail}`
  return `${s.title}: ${s.detail}`
}
