import type { Block, Effect, Id, Project, Scalar } from '@shared/model'
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

export function summarizeBlock(block: Block, project: Project): BlockSummary {
  switch (block.type) {
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
      const parts = [c.name, expr ? expr.name : 'no expression picked', POSITION_WORD[block.position]]
      return { title: 'Show', detail: withTransition(parts, block.transition) }
    }
    case 'hide': {
      const c = block.characterId === null ? undefined : project.characters[block.characterId]
      if (!c) return { title: 'Hide', detail: block.characterId === null ? 'Pick a character' : 'Missing character' }
      return { title: 'Hide', detail: withTransition([c.name], block.transition) }
    }
    case 'playMusic': {
      const parts = [assetName(project, block.assetId, 'Pick a track')]
      if (block.fadeIn > 0) parts.push(`fade in ${seconds(block.fadeIn)}`)
      if (!block.loop) parts.push('plays once')
      return { title: 'Play music', detail: parts.join(' · ') }
    }
    case 'stopMusic':
      return { title: 'Stop music', detail: block.fadeOut > 0 ? `fade out ${seconds(block.fadeOut)}` : 'right away' }
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
    default:
      return { title: 'Block', detail: (block as { type: string }).type }
  }
}

/** The whole one-liner as a single string, e.g. `Show: Anna · Happy · left`. */
export function summaryText(block: Block, project: Project): string {
  const s = summarizeBlock(block, project)
  if (block.type === 'say') return `${s.title} ${s.detail}`
  return `${s.title}: ${s.detail}`
}
