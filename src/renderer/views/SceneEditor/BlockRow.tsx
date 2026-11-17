import { memo, useEffect, useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import type { Block, Id, Project } from '@shared/model'
import { DraftArea, type DraftAreaHandle } from '../../components/DraftArea'
import { useKitStore } from '../../store/kitStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { addDialogueBelow, useFocusRequest } from './blockActions'
import { blockIcon, kitBlockDef } from './blockMeta'
import { summarizeBlock } from './blockSummaries'

export interface RowProblem {
  severity: 'error' | 'warning'
  message: string
}

interface BlockRowProps {
  block: Block
  sceneId: Id
  project: Project
  selected: boolean
  problem: RowProblem | null
}

/**
 * One row of the block list. The row is both what you drag (by its handle) and a drop target (drop above or below it).
 * Containers (If, Choice) draw their areas below this row; see BlockTree.
 */
function BlockRowInner({ block, sceneId, project, selected, problem }: BlockRowProps) {
  const drag = useDraggable({ id: block.id, data: { kind: 'block' } })
  const drop = useDroppable({ id: block.id, data: { kind: 'row' } })
  const selectBlock = useUiStore((s) => s.selectBlock)
  const updateBlock = useProjectStore((s) => s.updateBlock)
  const focusRequested = useFocusRequest((s) => s.blockId === block.id)
  const area = useRef<DraftAreaHandle>(null)
  const kits = useKitStore((s) => s.kits)
  const summary = summarizeBlock(block, project, { kits })
  const kitMissing = block.type === 'kit' && !kitBlockDef(block)
  const speakerColor = block.type === 'say' && block.characterId ? project.characters[block.characterId]?.color : undefined

  useEffect(() => {
    if (focusRequested) {
      area.current?.focus()
      useFocusRequest.getState().request(null)
    }
  }, [focusRequested])

  const cls = [
    'block-row',
    block.type === 'if' || block.type === 'inlineChoice' ? 'block-container' : '',
    selected ? 'selected' : '',
    drag.isDragging ? 'dragging' : '',
    problem ? `problem-${problem.severity}` : kitMissing ? 'problem-warning' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      className={cls}
      data-block-id={block.id}
      data-block-type={block.type}
      title={problem?.message ?? (kitMissing ? summary.detail : undefined)}
      aria-selected={selected}
      onMouseDown={(e) => {
        e.stopPropagation()
        selectBlock(block.id)
      }}
    >
      <button
        type="button"
        ref={drag.setActivatorNodeRef}
        className="row-handle"
        aria-label="Drag to move"
        title="Drag to move"
        {...drag.attributes}
        {...drag.listeners}
      >
        <GripVertical size={16} />
      </button>
      <span className="row-icon">{blockIcon(block)}</span>
      <span className="row-title" style={speakerColor ? { color: speakerColor } : undefined}>
        {summary.title}
      </span>
      {block.type === 'say' ? (
        <DraftArea
          handle={area}
          className="row-text"
          aria-label="Dialogue text"
          placeholder="Type what is said…"
          value={block.text}
          onFocus={() => selectBlock(block.id)}
          onCommit={(text) => updateBlock(sceneId, block.id, { text })}
          onKeyDown={(e, current) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              addDialogueBelow(sceneId, block.id, current)
            }
          }}
        />
      ) : (
        <span className="row-detail">{summary.detail}</span>
      )}
    </div>
  )
}

export const BlockRow = memo(BlockRowInner)
