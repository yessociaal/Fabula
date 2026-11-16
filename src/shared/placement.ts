import type { Placement, StagePosition } from './model'

export type CustomPlacement = Extract<Placement, { mode: 'custom' }>

/** Where the three preset positions sit horizontally, as an xalign value. */
export const PRESET_XALIGN: Record<StagePosition, number> = { left: 0, center: 0.5, right: 1 }

/** A custom placement that starts where the preset position was: same side, feet on the bottom edge. */
export function customPlacementFor(show: { position: StagePosition }): CustomPlacement {
  return { mode: 'custom', xalign: PRESET_XALIGN[show.position], yalign: 1, zoom: 1, rotate: 0, alpha: 1 }
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100))
}
