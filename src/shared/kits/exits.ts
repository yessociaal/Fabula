import type { ExtraEnding, NamedExit } from '../model'
import { exitItems, interpolate } from './fields'
import { findEndingDef, findKit, type KitContext, type LoadedKit } from './types'

type KitEnding = Extract<ExtraEnding, { type: 'kit' }>

/**
 * The exits a kit ending should have: one per list item the manifest's `exits` rule picks, in list order.
 * An item keeps its exit (same id, same target) for as long as it exists; a new item gets a new exit with no target;
 * an item that is gone or no longer counts takes its exit with it. Pure: the ending is not changed.
 * A kit or ending type that is not available leaves the exits as they are.
 */
export function syncKitExits(ending: KitEnding, kit: LoadedKit | undefined): NamedExit[] {
  const def = findEndingDef(kit, ending.endingType)
  const rule = def?.exits
  if (!def || !rule) return def ? [] : ending.exits
  const list = def.fields.find((f) => f.key === rule.list)
  if (!list || list.type !== 'list') return ending.exits
  return exitItems(def, ending.params).map((item) => {
    const id = item.id as string
    const old = ending.exits.find((x) => x.id === id)
    return { id, name: interpolate(rule.name, list.fields, item), target: old ? old.target : null }
  })
}

/** Convenience for callers that hold a kit context instead of one kit. */
export function syncKitExitsIn(ending: KitEnding, ctx: KitContext | undefined): NamedExit[] {
  return syncKitExits(ending, findKit(ctx, ending.kitId))
}
