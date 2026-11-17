import type { Block, Condition, Effect, Id, Project, Transition } from '../model'
import { replaceCodeRefs } from '../codeRefs'
import { conditionToPython } from '../conditions'
import type { NameTable } from '../naming'
import { audioPath, backgroundPath, lookupAsset, moviePath, spritePath } from './assets'
import type { AssetCopy } from './assets'
import { escapeSayText, pythonDuration, pythonFloat, pythonNumber, pythonString, pythonValue } from './text'

export interface CompileContext {
  project: Project
  names: NameTable
  knownVariables: ReadonlySet<string>
  copies: Map<string, AssetCopy>
  /** Set while emitting when any block uses the ambient channel, so that the channel gets registered once. */
  usesAmbient: boolean
}

export function sayText(text: string, ctx: CompileContext): string {
  return `"${escapeSayText(text, ctx.knownVariables)}"`
}

export function variableName(ctx: CompileContext, id: Id | null): string | null {
  if (id === null) return null
  return ctx.names.variableRefs[id] ?? null
}

export function conditionPython(condition: Condition, ctx: CompileContext): string {
  const usable: Condition = {
    join: condition.join,
    clauses: condition.clauses.filter((c) => variableName(ctx, c.variableId) !== null)
  }
  return conditionToPython(usable, (id) => ctx.names.variableRefs[id])
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

/**
 * Code the author typed, with `@scene(Scene name)` replaced by that scene's label. Only a name that exactly one scene has
 * is replaced; anything else stays as typed (the validator blocks the export first). Nothing else is touched.
 */
export function substituteSceneRefs(code: string, ctx: CompileContext): string {
  const byName = new Map<string, Id[]>()
  for (const scene of Object.values(ctx.project.scenes)) byName.set(scene.name, [...(byName.get(scene.name) ?? []), scene.id])
  return replaceCodeRefs(code, 'scene', [...byName.keys()], (name) => {
    const ids = byName.get(name)
    return ids !== undefined && ids.length === 1 ? (ctx.names.sceneLabels[ids[0]] ?? null) : null
  })
}

export const INDENT = '    '

/** Indent every non-empty line of a statement by one level. */
export function indentLines(text: string, levels = 1): string {
  const pad = INDENT.repeat(levels)
  return text
    .split('\n')
    .map((l) => (l === '' ? l : pad + l))
    .join('\n')
}

export function promptLine(prompt: { characterId: Id | null; text: string }, ctx: CompileContext): string | null {
  if (prompt.characterId === null) return sayText(prompt.text, ctx)
  const tag = ctx.names.characters[prompt.characterId]
  return tag === undefined ? null : `${tag} ${sayText(prompt.text, ctx)}`
}

/** The statements of a list of blocks (blocks that compile to nothing are left out). */
export function emitBlocks(blocks: Block[], ctx: CompileContext): string[] {
  const out: string[] = []
  for (const block of blocks) {
    const text = emitBlock(block, ctx)
    if (text !== null) out.push(text)
  }
  return out
}

/** A nested body: statements separated by a blank line, indented one level. An empty body is `pass`. */
function emitBody(blocks: Block[], ctx: CompileContext): string {
  const statements = emitBlocks(blocks, ctx)
  return indentLines(statements.length === 0 ? 'pass' : statements.join('\n\n'))
}

/** One statement for a block (several lines are relative to the block's own indent), or null when the block is skipped. */
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
      const line = `${speaker}${sayText(block.text, ctx)}`
      const voice = lookupAsset(project, block.voiceAssetId)
      const voiceTo = voice && voice.kind === 'voice' ? audioPath(voice, names) : null
      if (!voice || voiceTo === null) return line
      useAsset(ctx, voice.id, voiceTo)
      return `voice ${pythonString(voiceTo)}\n${line}`
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
      const layer = block.zorder !== 0 ? ` zorder ${pythonNumber(block.zorder)}` : ''
      if (block.placement.mode === 'custom') {
        const p = block.placement
        const lines = [`show ${tag} ${attribute}${layer}:`, `    xalign ${pythonFloat(p.xalign)}`, `    yalign ${pythonFloat(p.yalign)}`]
        if (p.zoom !== 1) lines.push(`    zoom ${pythonNumber(p.zoom)}`)
        if (p.rotate !== 0) lines.push(`    rotate ${pythonNumber(p.rotate)}`)
        if (p.alpha !== 1) lines.push(`    alpha ${pythonNumber(p.alpha)}`)
        if (block.transition !== 'none') lines.push(`with ${block.transition}`)
        return lines.join('\n')
      }
      return withTransition(`show ${tag} ${attribute} at ${block.position}${layer}`, block.transition)
    }
    case 'hide': {
      if (block.characterId === null) return null
      const tag = names.characters[block.characterId]
      if (tag === undefined) return null
      return withTransition(`hide ${tag}`, block.transition)
    }
    case 'playMusic': {
      const kind = block.channel === 'ambient' ? 'ambient' : 'music'
      const asset = lookupAsset(project, block.assetId)
      const to = asset && asset.kind === kind ? audioPath(asset, names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      if (kind === 'ambient') ctx.usesAmbient = true
      let line = `play ${block.channel} ${pythonString(to)}`
      if (block.fadeIn > 0) line += ` fadein ${pythonDuration(block.fadeIn)}`
      if (!block.loop) line += ' noloop'
      return line
    }
    case 'stopMusic': {
      if (block.channel === 'ambient') ctx.usesAmbient = true
      const line = `stop ${block.channel}`
      return block.fadeOut > 0 ? `${line} fadeout ${pythonDuration(block.fadeOut)}` : line
    }
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
    case 'ask': {
      const variable = block.variableId === null ? undefined : project.variables[block.variableId]
      const name = variableName(ctx, block.variableId)
      if (!variable || variable.type !== 'text' || name === null) return null
      const length = block.maxLength > 0 ? `, length=${pythonNumber(Math.floor(block.maxLength))}` : ''
      return `$ ${name} = renpy.input(${sayText(block.prompt, ctx)}, default=${pythonString(block.defaultText)}${length}).strip()`
    }
    case 'movie': {
      const asset = lookupAsset(project, block.assetId)
      const to = asset ? moviePath(asset, names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      return `$ renpy.movie_cutscene(${pythonString(to)})`
    }
    case 'window':
      return `window ${block.action}`
    case 'clearPage':
      return 'nvl clear'
    case 'visit': {
      const label = block.sceneId === null ? undefined : names.sceneLabels[block.sceneId]
      return label === undefined || !project.scenes[block.sceneId as Id] ? null : `call ${label}`
    }
    case 'if': {
      const lines = [`if ${conditionPython(block.condition, ctx)}:`, emitBody(block.then, ctx)]
      if (block.otherwise.length > 0 && emitBlocks(block.otherwise, ctx).length > 0) {
        lines.push('else:', emitBody(block.otherwise, ctx))
      }
      return lines.join('\n')
    }
    case 'inlineChoice': {
      if (block.options.length === 0) return null
      const items: string[] = []
      if (block.prompt) {
        const line = promptLine(block.prompt, ctx)
        if (line !== null) items.push(indentLines(line))
      }
      for (const option of block.options) {
        const guard = option.condition ? ` if ${conditionPython(option.condition, ctx)}` : ''
        items.push(`${indentLines(`${sayText(option.text, ctx)}${guard}:`)}\n${indentLines(emitBody(option.blocks, ctx))}`)
      }
      return ['menu:', ...items].join('\n\n')
    }
    case 'code':
      return block.code.trim() === '' ? null : substituteSceneRefs(block.code, ctx)
    default:
      return null
  }
}
