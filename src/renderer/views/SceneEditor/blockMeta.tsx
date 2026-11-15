import type { ReactNode } from 'react'
import {
  Bell,
  Hash,
  Image as ImageIcon,
  MessageSquare,
  Music,
  Pause,
  ScrollText,
  Sparkles,
  User,
  UserX,
  VolumeX
} from 'lucide-react'
import type { Block, CoreBlockType } from '@shared/model'

export interface PaletteEntry {
  /** Unique key. Narration and Dialogue share the block type `say`. */
  key: string
  type: CoreBlockType
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

export function blockIcon(block: Pick<Block, 'type'> & { characterId?: string | null }, size = 16): ReactNode {
  return iconFor(block.type, block.type === 'say' && block.characterId === null, size)
}

export function iconFor(type: string, narration: boolean, size = 16): ReactNode {
  switch (type) {
    case 'say':
      return narration ? <ScrollText size={size} /> : <MessageSquare size={size} />
    case 'background':
      return <ImageIcon size={size} />
    case 'show':
      return <User size={size} />
    case 'hide':
      return <UserX size={size} />
    case 'playMusic':
      return <Music size={size} />
    case 'stopMusic':
      return <VolumeX size={size} />
    case 'playSound':
      return <Bell size={size} />
    case 'setVariable':
      return <Hash size={size} />
    case 'pause':
      return <Pause size={size} />
    case 'transition':
      return <Sparkles size={size} />
    default:
      return <Sparkles size={size} />
  }
}

/** Heading for the inspector, e.g. "Dialogue" or "Narration". */
export function blockKindLabel(block: Block): string {
  switch (block.type) {
    case 'say':
      return block.characterId === null ? 'Narration' : 'Dialogue'
    case 'background':
      return 'Background'
    case 'show':
      return 'Show character'
    case 'hide':
      return 'Hide character'
    case 'playMusic':
      return 'Play music'
    case 'stopMusic':
      return 'Stop music'
    case 'playSound':
      return 'Play sound'
    case 'setVariable':
      return 'Variable'
    case 'pause':
      return 'Pause'
    case 'transition':
      return 'Transition'
    default:
      return 'Block'
  }
}
