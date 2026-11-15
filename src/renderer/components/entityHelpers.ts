import type { Project } from '@shared/model'

/** `base`, or `base 2`, `base 3`… when a name in `taken` already uses it (case-insensitive). */
export function uniqueName(base: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.trim().toLowerCase()))
  if (!lower.has(base.toLowerCase())) return base
  let n = 2
  while (lower.has(`${base} ${n}`.toLowerCase())) n += 1
  return `${base} ${n}`
}

const SPACING_X = 320
const SPACING_Y = 220
const CLEAR_X = 280
const CLEAR_Y = 200

/** A free map position to the right of `from`, moving down until no other scene overlaps it. */
export function freeSpotNear(project: Project, from: { x: number; y: number }): { x: number; y: number } {
  const others = Object.values(project.scenes).map((s) => s.position)
  const taken = (x: number, y: number): boolean => others.some((o) => Math.abs(o.x - x) < CLEAR_X && Math.abs(o.y - y) < CLEAR_Y)
  for (let col = 1; col <= 10; col++) {
    for (let row = 0; row < 40; row++) {
      const x = from.x + col * SPACING_X
      const y = from.y + row * SPACING_Y
      if (!taken(x, y)) return { x: Math.round(x), y: Math.round(y) }
    }
  }
  return { x: from.x + SPACING_X, y: from.y }
}
