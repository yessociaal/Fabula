import type { KitContext } from '@shared/kits/types'
import type { CreatableBlockType } from '@shared/model'

export interface PaletteEntry {
  /** Unique key. Narration and Dialogue share the block type `say`. */
  key: string
  type: CreatableBlockType | 'kit'
  label: string
  narration?: boolean
  /** Set for a block that comes from a kit. */
  kit?: { kitId: string; blockType: string }
  /** lucide icon name from the kit manifest. */
  icon?: string
}

export interface KitPaletteGroup {
  kitId: string
  kitName: string
  entries: PaletteEntry[]
}

/** One palette group per kit that is switched on for the story and loaded, with that kit's blocks. Kits without blocks are left out. */
export function kitPaletteGroups(context: KitContext, enabledIds: readonly string[]): KitPaletteGroup[] {
  const groups: KitPaletteGroup[] = []
  for (const id of enabledIds) {
    const kit = context.kits?.find((k) => k.id === id)
    if (!kit || kit.manifest === null || kit.manifest.blocks.length === 0) continue
    groups.push({
      kitId: id,
      kitName: kit.manifest.name,
      entries: kit.manifest.blocks.map((b) => ({ key: `kit:${id}:${b.type}`, type: 'kit' as const, label: b.name, kit: { kitId: id, blockType: b.type }, icon: b.icon }))
    })
  }
  return groups
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
  { key: 'clearPage', type: 'clearPage', label: 'Clear page' },
  { key: 'code', type: 'code', label: "Ren'Py code" }
]

export const ALL_PALETTE: PaletteEntry[] = [...PALETTE, ...MORE_PALETTE]
