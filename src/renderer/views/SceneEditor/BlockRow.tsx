import { memo, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import type { Block, Id, Project } from '@shared/model'
import { DraftArea, type DraftAreaHandle } from '../../components/DraftArea'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { addDialogueBelow, useFocusRequest } from './blockActions'
import { blockIcon } from './blockMeta'
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
  /** Draw the insertion line above this row (a palette entry is being dragged over it). */
  lineBefore: boolean
}

function BlockRowInner({ block, sceneId, project, selected, problem, lineBefore }: BlockRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const selectBlock = useUiStore((s) => s.selectBlock)
  const updateBlock = useProjectStore((s) => s.updateBlock)
  const focusRequested = useFocusRequest((s) => s.blockId === block.id)
  const area = useRef<DraftAreaHandle>(null)
  const summary = summarizeBlock(block, project)
  const speakerColor = block.type === 'say' && block.characterId ? project.characters[block.characterId]?.color : undefined

  useEffect(() => {
    if (focusRequested) {
      area.current?.focus()
      useFocusRequest.getState().request(null)
    }
  }, [focusRequested])

  const cls = ['block-row', selected ? 'selected' : '', isDragging ? 'dragging' : '', problem ? `problem-${problem.severity}` : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      ref={setNodeRef}
      className={cls}
      data-block-id={block.id}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined, transition }}
      title={problem?.message}
      aria-selected={selected}
      onMouseDown={() => selectBlock(block.id)}
    >
      {lineBefore && <div className="insert-line" aria-hidden />}
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="row-handle"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
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
