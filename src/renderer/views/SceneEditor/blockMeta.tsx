import type { ReactNode } from 'react'
import {
  Bell,
  CodeXml,
  CornerDownRight,
  GitBranch,
  ListTree,
  Eraser,
  Film,
  Hash,
  Keyboard,
  Image as ImageIcon,
  MessageSquare,
  Music,
  PanelBottom,
  Pause,
  ScrollText,
  Sparkles,
  User,
  UserX,
  VolumeX
} from 'lucide-react'
import { findBlockDef, findKit } from '@shared/kits/types'
import type { Block } from '@shared/model'
import { KitIcon } from '../../components/KitIcon'
import { useKitStore } from '../../store/kitStore'

export { ALL_PALETTE, MORE_PALETTE, PALETTE, kitPaletteGroups, type PaletteEntry } from './paletteEntries'

/** The manifest entry of a kit block, or undefined when the kit or the block type is not available. */
export function kitBlockDef(block: Block): ReturnType<typeof findBlockDef> {
  return block.type === 'kit' ? findBlockDef(findKit(useKitStore.getState(), block.kitId), block.blockType) : undefined
}

export function blockIcon(block: Block, size = 16): ReactNode {
  if (block.type === 'kit') return <KitIcon name={kitBlockDef(block)?.icon} size={size} />
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
    case 'ask':
      return <Keyboard size={size} />
    case 'movie':
      return <Film size={size} />
    case 'window':
      return <PanelBottom size={size} />
    case 'clearPage':
      return <Eraser size={size} />
    case 'code':
      return <CodeXml size={size} />
    case 'visit':
      return <CornerDownRight size={size} />
    case 'if':
      return <GitBranch size={size} />
    case 'inlineChoice':
      return <ListTree size={size} />
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
      return block.channel === 'ambient' ? 'Play ambient' : 'Play music'
    case 'stopMusic':
      return block.channel === 'ambient' ? 'Stop ambient' : 'Stop music'
    case 'playSound':
      return 'Play sound'
    case 'setVariable':
      return 'Variable'
    case 'pause':
      return 'Pause'
    case 'transition':
      return 'Transition'
    case 'ask':
      return 'Ask the player'
    case 'movie':
      return 'Movie'
    case 'window':
      return 'Text box show/hide'
    case 'clearPage':
      return 'Clear page'
    case 'kit':
      return kitBlockDef(block)?.name ?? 'Kit block'
    case 'code':
      return "Ren'Py code"
    case 'visit':
      return 'Visit scene'
    case 'if':
      return 'If'
    case 'inlineChoice':
      return 'Choice (stay in scene)'
    default:
      return 'Block'
  }
}
