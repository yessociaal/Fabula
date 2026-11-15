import type { Block, Condition, Effect, Id, Project, Transition } from '../model'
import { conditionToPython } from '../conditions'
import type { NameTable } from '../naming'
import { audioPath, backgroundPath, lookupAsset, spritePath } from './assets'
import type { AssetCopy } from './assets'
import { escapeSayText, pythonDuration, pythonString, pythonValue } from './text'

export interface CompileContext {
  project: Project
  names: NameTable
  knownVariables: ReadonlySet<string>
  copies: Map<string, AssetCopy>
}

export function sayText(text: string, ctx: CompileContext): string {
  return `"${escapeSayText(text, ctx.knownVariables)}"`
}

export function variableName(ctx: CompileContext, id: Id | null): string | null {
  if (id === null) return null
  return ctx.names.variables[id] ?? null
}

export function conditionPython(condition: Condition, ctx: CompileContext): string {
  const usable: Condition = {
    join: condition.join,
    clauses: condition.clauses.filter((c) => variableName(ctx, c.variableId) !== null)
  }
  return conditionToPython(usable, (id) => ctx.names.variables[id])
}

function withTransition(line: string, transition: Transition): string {
  return transition === 'none' ? line : `${line} with ${transition}`
}

function useAsset(ctx: CompileContext, assetId: Id, to: string): void {
  const asset = ctx.project.assets[assetId]
  if (!asset) return
  ctx.copies.set(to, { assetId, from: asset.file, to })
}

export function emitEffect(effect: Effect, ctx: CompileContext): string | null {
  const name = variableName(ctx, effect.variableId)
  if (name === null) return null
  switch (effect.op) {
    case 'set':
      return `$ ${name} = ${pythonValue(effect.value)}`
    case 'toggle':
      return `$ ${name} = not ${name}`
    case 'add':
    case 'subtract':
      if (typeof effect.value !== 'number') return null
      return `$ ${name} ${effect.op === 'add' ? '+=' : '-='} ${pythonValue(effect.value)}`
  }
}

/** One statement for a block, or null when the block is skipped. Extended blocks are skipped for now. */
export function emitBlock(block: Block, ctx: CompileContext): string | null {
  const { project, names } = ctx
  switch (block.type) {
    case 'say': {
      let speaker = ''
      if (block.characterId !== null) {
        const tag = names.characters[block.characterId]
        if (tag === undefined) return null
        speaker = `${tag} `
      }
      return `${speaker}${sayText(block.text, ctx)}`
    }
    case 'background': {
      if (block.assetId === null) return withTransition('scene black', block.transition)
      const asset = lookupAsset(project, block.assetId)
      const to = asset ? backgroundPath(asset, names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      return withTransition(`scene ${names.backgrounds[asset.id]}`, block.transition)
    }
    case 'show': {
      if (block.characterId === null || block.expressionId === null) return null
      const character = project.characters[block.characterId]
      const tag = names.characters[block.characterId]
      const expression = character?.expressions.find((e) => e.id === block.expressionId)
      const attribute = names.expressions[block.expressionId]
      if (!character || tag === undefined || !expression || attribute === undefined) return null
      const asset = lookupAsset(project, expression.assetId)
      const to = asset ? spritePath(asset, tag, attribute) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      return withTransition(`show ${tag} ${attribute} at ${block.position}`, block.transition)
    }
    case 'hide': {
      if (block.characterId === null) return null
      const tag = names.characters[block.characterId]
      if (tag === undefined) return null
      return withTransition(`hide ${tag}`, block.transition)
    }
    case 'playMusic': {
      if (block.channel !== 'music') return null
      const asset = lookupAsset(project, block.assetId)
      const to = asset && asset.kind === 'music' ? audioPath(asset, names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      let line = `play music ${pythonString(to)}`
      if (block.fadeIn > 0) line += ` fadein ${pythonDuration(block.fadeIn)}`
      if (!block.loop) line += ' noloop'
      return line
    }
    case 'stopMusic':
      if (block.channel !== 'music') return null
      return block.fadeOut > 0 ? `stop music fadeout ${pythonDuration(block.fadeOut)}` : 'stop music'
    case 'playSound': {
      const asset = lookupAsset(project, block.assetId)
      const to = asset && asset.kind === 'sound' ? audioPath(asset, names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      return `play sound ${pythonString(to)}`
    }
    case 'setVariable':
      return emitEffect(block.effect, ctx)
    case 'pause':
      return block.seconds === null ? 'pause' : `pause ${pythonDuration(block.seconds)}`
    case 'transition':
      return block.transition === 'none' ? null : `with ${block.transition}`
    default:
      return null
  }
}
