import type { CreatableBlockType } from '@shared/model'

export interface PaletteEntry {
  /** Unique key. Narration and Dialogue share the block type `say`. */
  key: string
  type: CreatableBlockType
  label: string
  narration?: boolean
}

/** The ten core entries, in the order of the plan's figure. */
export const PALETTE: PaletteEntry[] = [
  { key: 'dialogue', type: 'say', label: 'Dialogue' },
  { key: 'narration', type: 'say', label: 'Narration', narration: true },
  { key: 'background', type: 'background', label: 'Background' },
  { key: 'show', type: 'show', label: 'Show' },
  { key: 'hide', type: 'hide', label: 'Hide' },
  { key: 'playMusic', type: 'playMusic', label: 'Music' },
  { key: 'stopMusic', type: 'stopMusic', label: 'Stop music' },
  { key: 'playSound', type: 'playSound', label: 'Sound' },
  { key: 'setVariable', type: 'setVariable', label: 'Variable' },
  { key: 'pause', type: 'pause', label: 'Pause' },
  { key: 'transition', type: 'transition', label: 'Transition' }
]

/** The "More" group of the palette. */
export const MORE_PALETTE: PaletteEntry[] = [
  { key: 'visit', type: 'visit', label: 'Visit scene' },
  { key: 'if', type: 'if', label: 'If' },
  { key: 'inlineChoice', type: 'inlineChoice', label: 'Choice (stay in scene)' },
  { key: 'ask', type: 'ask', label: 'Ask the player' },
  { key: 'movie', type: 'movie', label: 'Movie' },
  { key: 'window', type: 'window', label: 'Text box show/hide' },
  { key: 'clearPage', type: 'clearPage', label: 'Clear page' }
]

export const ALL_PALETTE: PaletteEntry[] = [...PALETTE, ...MORE_PALETTE]
