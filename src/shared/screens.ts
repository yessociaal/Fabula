import { walkBlocks } from './blockTree'
import type { Id, Project, ScreenAction, ScreenDef, ScreenElement } from './model'
import { slugify } from './naming'

/** The action of an element that has one (every element except image, text and bar). */
export function actionOf(element: ScreenElement): ScreenAction | null {
  return 'action' in element ? element.action : null
}

/** The elements of a screen whose action is "Leave screen": each one is an exit when the screen is used as an ending, in layer order. */
export function leaveElements(def: ScreenDef): ScreenElement[] {
  return def.elements.filter((el) => actionOf(el)?.type === 'leave')
}

/**
 * The targets of a screen ending, brought in line with the screen: one entry per leaving element, an existing target is kept,
 * a new leaving element starts with none, and entries of elements that were deleted or no longer leave are dropped.
 * Pure; returns the same object when nothing changes.
 */
export function syncScreenTargets(def: ScreenDef | undefined, targets: Record<Id, Id | null>): Record<Id, Id | null> {
  const wanted = def ? leaveElements(def).map((el) => el.id) : []
  const keys = Object.keys(targets)
  if (keys.length === wanted.length && wanted.every((id) => id in targets)) return targets
  const next: Record<Id, Id | null> = {}
  for (const id of wanted) next[id] = targets[id] ?? null
  return next
}

/** One place that points at a screen. */
export interface ScreenUse {
  kind: 'block' | 'ending' | 'element'
  /** The scene for a block or an ending; null for an element of another screen. */
  sceneId: Id | null
  /** The scene's name, or the other screen's name for an element. */
  where: string
}

/** Every place that points at a screen: Show/Hide screen blocks, screen endings, and "Show screen" actions of other screens' elements. */
export function screenUses(project: Project, screenId: Id): ScreenUse[] {
  const out: ScreenUse[] = []
  for (const scene of Object.values(project.scenes)) {
    let inBlock = false
    walkBlocks(scene.blocks, (b) => {
      if (b.type === 'screen' && b.screenId === screenId) inBlock = true
    })
    if (inBlock) out.push({ kind: 'block', sceneId: scene.id, where: scene.name })
    if (scene.ending.type === 'screen' && scene.ending.screenId === screenId) out.push({ kind: 'ending', sceneId: scene.id, where: scene.name })
  }
  for (const def of Object.values(project.screens)) {
    for (const el of def.elements) {
      const a = actionOf(el)
      if (a && a.type === 'showScreen' && a.screenId === screenId) out.push({ kind: 'element', sceneId: null, where: def.name })
    }
  }
  return out
}

/** `base`, or `base 2`, `base 3`… when its slug is already taken by another element of the screen. */
export function freeElementName(def: ScreenDef, base: string, exceptId?: Id): string {
  const taken = new Set(def.elements.filter((e) => e.id !== exceptId).map((e) => slugify(e.name, 'element')))
  if (!taken.has(slugify(base, 'element'))) return base
  let n = 2
  while (taken.has(slugify(`${base} ${n}`, 'element'))) n++
  return `${base} ${n}`
}

/** Snap a position to the canvas edges and centre. Returns the (rounded) value and the guide line it hit, or null. */
export function snapAxis(start: number, size: number, canvas: number, threshold: number): { value: number; guide: number | null } {
  const candidates: { at: number; guide: number }[] = [
    { at: 0, guide: 0 },
    { at: canvas - size, guide: canvas },
    { at: (canvas - size) / 2, guide: canvas / 2 }
  ]
  let best: { value: number; guide: number; d: number } | null = null
  for (const c of candidates) {
    const d = Math.abs(start - c.at)
    if (d <= threshold && (best === null || d < best.d)) best = { value: Math.round(c.at), guide: c.guide, d }
  }
  return best ? { value: best.value, guide: best.guide } : { value: Math.round(start), guide: null }
}

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export const MIN_ELEMENT_SIZE = 8

/** Resize a box by dragging one handle by (dx, dy): the opposite side stays fixed and the box stays at least MIN_ELEMENT_SIZE wide and high. */
export function resizeBox(
  box: { x: number; y: number; w: number; h: number },
  handle: Handle,
  dx: number,
  dy: number
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = box
  if (handle.includes('e')) w = Math.max(MIN_ELEMENT_SIZE, box.w + dx)
  if (handle.includes('s')) h = Math.max(MIN_ELEMENT_SIZE, box.h + dy)
  if (handle.includes('w')) {
    w = Math.max(MIN_ELEMENT_SIZE, box.w - dx)
    x = box.x + box.w - w
  }
  if (handle.includes('n')) {
    h = Math.max(MIN_ELEMENT_SIZE, box.h - dy)
    y = box.y + box.h - h
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}
