import { Copy, Trash2 } from 'lucide-react'
import { findBlockPath, getBlockAt, splitPath, type BlockPath } from '@shared/blockTree'
import type { Block, Id } from '@shared/model'
import { Button } from '../../../components/Button'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import { deleteSelected, duplicateSelected } from '../blockActions'
import { blockKindLabel } from '../blockMeta'
import { AskInspector } from './AskInspector'
import { BackgroundInspector } from './BackgroundInspector'
import { ClearPageInspector } from './ClearPageInspector'
import { DialogueInspector } from './DialogueInspector'
import { HideInspector } from './HideInspector'
import { IfInspector } from './IfInspector'
import { InlineChoiceInspector } from './InlineChoiceInspector'
import { MovieInspector } from './MovieInspector'
import { PauseInspector } from './PauseInspector'
import { PlayMusicInspector } from './PlayMusicInspector'
import { PlaySoundInspector } from './PlaySoundInspector'
import { ShowInspector } from './ShowInspector'
import { StopMusicInspector } from './StopMusicInspector'
import { TransitionInspector } from './TransitionInspector'
import { VariableInspector } from './VariableInspector'
import { VisitInspector } from './VisitInspector'
import { WindowInspector } from './WindowInspector'

function Fields({ sceneId, block, path }: { sceneId: Id; block: Block; path: BlockPath }) {
  const p = { sceneId, index: splitPath(path).index, path }
  switch (block.type) {
    case 'say':
      return <DialogueInspector {...p} block={block} />
    case 'background':
      return <BackgroundInspector {...p} block={block} />
    case 'show':
      return <ShowInspector {...p} block={block} />
    case 'hide':
      return <HideInspector {...p} block={block} />
    case 'playMusic':
      return <PlayMusicInspector {...p} block={block} />
    case 'stopMusic':
      return <StopMusicInspector {...p} block={block} />
    case 'playSound':
      return <PlaySoundInspector {...p} block={block} />
    case 'setVariable':
      return <VariableInspector {...p} block={block} />
    case 'pause':
      return <PauseInspector {...p} block={block} />
    case 'transition':
      return <TransitionInspector {...p} block={block} />
    case 'ask':
      return <AskInspector {...p} block={block} />
    case 'movie':
      return <MovieInspector {...p} block={block} />
    case 'window':
      return <WindowInspector {...p} block={block} />
    case 'clearPage':
      return <ClearPageInspector {...p} block={block} />
    case 'visit':
      return <VisitInspector {...p} block={block} />
    case 'if':
      return <IfInspector {...p} block={block} />
    case 'inlineChoice':
      return <InlineChoiceInspector {...p} block={block} />
    default:
      return <p className="muted-note">This kind of block cannot be edited here yet.</p>
  }
}

export function Inspector({ sceneId }: { sceneId: Id }) {
  const scene = useProjectStore((s) => s.project?.scenes[sceneId])
  const selectedId = useUiStore((s) => s.selectedBlockId)
  const path = scene && selectedId ? findBlockPath(scene.blocks, selectedId) : null
  const block = scene && path ? getBlockAt(scene.blocks, path) : undefined

  if (!block || !path) {
    return (
      <div className="inspector">
        <h3 className="panel-heading">Inspector</h3>
        <p className="muted-note">Select a block in the list to edit it.</p>
      </div>
    )
  }
  return (
    <div className="inspector">
      <h3 className="panel-heading">Inspector — {blockKindLabel(block)}</h3>
      <div className="inspector-fields" key={block.id}>
        <Fields sceneId={sceneId} block={block} path={path} />
      </div>
      <div className="inspector-actions">
        <Button icon={<Copy size={15} />} onClick={() => duplicateSelected(sceneId)} title="Duplicate this block (Ctrl+D)">
          Duplicate
        </Button>
        <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => deleteSelected(sceneId)} title="Delete this block (Delete)">
          Delete
        </Button>
      </div>
    </div>
  )
}
