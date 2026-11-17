import type { Block, ExtraEnding, Id, Project } from '../model'
import { findBlockDef, findEndingDef, findKit, type KitField, type LoadedKit } from '../kits/types'
import { TemplateError, renderTemplate, type TemplateHost } from '../kits/template'
import { kitsInUse } from '../kits/usage'
import { audioPath, backgroundPath, lookupAsset, moviePath } from './assets'
import { conditionPython, emitEffect, indentLines, sayText, useAsset, variableName } from './blocks'
import type { CompileContext } from './blocks'

type KitBlock = Extract<Block, { type: 'kit' }>
type KitEnding = Extract<ExtraEnding, { type: 'kit' }>

function assetTarget(ctx: CompileContext, id: Id): string | null {
  const asset = lookupAsset(ctx.project, id)
  if (!asset) return null
  const to = asset.kind === 'background' ? backgroundPath(asset, ctx.names) : asset.kind === 'movie' ? moviePath(asset, ctx.names) : audioPath(asset, ctx.names)
  if (to === null) return null
  useAsset(ctx, asset.id, to)
  return to
}

function hostFor(ctx: CompileContext, exits: KitEnding['exits'] = []): TemplateHost {
  return {
    label: ctx.sceneLabel,
    text: (value) => sayText(value, ctx),
    name: (kind, id) => (kind === 'variable' ? variableName(ctx, id) : (ctx.names.characters[id] ?? null)),
    path: (id) => assetTarget(ctx, id),
    effects: (effects) => effects.map((e) => emitEffect(e, ctx)).filter((l): l is string => l !== null),
    condition: (c) => conditionPython(c, ctx),
    exitLabel: (itemId) => {
      const target = exits.find((x) => x.id === itemId)?.target ?? null
      return target !== null && ctx.project.scenes[target] ? (ctx.names.sceneLabels[target] ?? null) : null
    }
  }
}

/** The kit, when the story has it switched on and it loaded. */
function activeKit(ctx: CompileContext, kitId: string): LoadedKit | undefined {
  const kit = findKit(ctx, kitId)
  return kit && kit.manifest !== null && ctx.project.kits.includes(kitId) ? kit : undefined
}

/**
 * Render the template of one block or ending. Returns the text (starting at column 0) or the reason it cannot be made.
 * Used by the compiler (which skips what fails) and by the validator (which reports it on the block).
 */
export function renderKitPart(
  kit: LoadedKit,
  templatePath: string,
  fields: readonly KitField[],
  params: Record<string, unknown>,
  ctx: CompileContext,
  exits: KitEnding['exits'] = []
): { ok: true; text: string } | { ok: false; error: string } {
  const source = kit.templates[templatePath]
  if (source === undefined) return { ok: false, error: `The kit "${kit.manifest?.name ?? kit.id}" has no template file "${templatePath}".` }
  try {
    return { ok: true, text: renderTemplate(source, fields, params, hostFor(ctx, exits)) }
  } catch (e) {
    if (e instanceof TemplateError) return { ok: false, error: `${templatePath}, ${e.message}` }
    throw e
  }
}

/** The statements of a kit block (relative to the block's own indent), or null when the block is skipped. */
export function emitKitBlock(block: KitBlock, ctx: CompileContext): string | null {
  const kit = activeKit(ctx, block.kitId)
  const def = findBlockDef(kit, block.blockType)
  if (!kit || !def) return null
  const result = renderKitPart(kit, def.template, def.fields, block.params, ctx)
  return result.ok && result.text !== '' ? result.text : null
}

/** The statements of a kit ending, indented one level (like every ending), or null. */
export function emitKitEnding(ending: KitEnding, ctx: CompileContext): string | null {
  const kit = activeKit(ctx, ending.kitId)
  const def = findEndingDef(kit, ending.endingType)
  if (!kit || !def) return null
  const result = renderKitPart(kit, def.template, def.fields, ending.params, ctx, ending.exits)
  return result.ok && result.text !== '' ? indentLines(result.text) : null
}

/**
 * The files the enabled kits copy into the game. A file whose kit sets `onlyWhenUsed` is left out when no block or
 * ending of that kit is in the story. A file that would land on a path the story already writes is left out too
 * (the validator reports it). Sorted by path so the output never depends on loading order.
 */
export function kitFiles(project: Project, kits: readonly LoadedKit[], taken: ReadonlySet<string>): { path: string; content: string }[] {
  const used = kitsInUse(project)
  const out = new Map<string, string>()
  const seen = new Set(taken)
  for (const id of project.kits) {
    const kit = kits.find((k) => k.id === id)
    if (!kit || kit.manifest === null) continue
    if (kit.manifest.onlyWhenUsed === true && !used.has(id)) continue
    for (const file of kit.files) {
      const key = file.to.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.set(file.to, file.content)
    }
  }
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([path, content]) => ({ path, content }))
}
