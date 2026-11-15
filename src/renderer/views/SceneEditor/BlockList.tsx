import { useEffect, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { MessageSquare } from 'lucide-react'
import type { Id, Project, Scene } from '@shared/model'
import { validateProject } from '@shared/validate'
import { Button } from '../../components/Button'
import { useUiStore } from '../../store/uiStore'
import { addEntryAt } from './blockActions'
import { PALETTE } from './blockMeta'
import { BlockRow, type RowProblem } from './BlockRow'

export const LIST_END_ID = 'list-end'

interface BlockListProps {
  scene: Scene
  project: Project
  /** Index where a dragged palette entry would be inserted, or null when none is being dragged over the list. */
  dropAt: number | null
}

/** Problems of this scene grouped by block (the worst one wins). */
function useBlockProblems(project: Project, sceneId: Id): Map<Id, RowProblem> {
  return useMemo(() => {
    const map = new Map<Id, RowProblem>()
    for (const p of validateProject(project)) {
      if (p.sceneId !== sceneId || !p.blockId) continue
      const have = map.get(p.blockId)
      if (!have || (have.severity === 'warning' && p.severity === 'error')) {
        map.set(p.blockId, { severity: p.severity, message: p.message })
      }
    }
    return map
  }, [project, sceneId])
}

export function BlockList({ scene, project, dropAt }: BlockListProps) {
  const selectedBlockId = useUiStore((s) => s.selectedBlockId)
  const selectBlock = useUiStore((s) => s.selectBlock)
  const problems = useBlockProblems(project, scene.id)
  const { setNodeRef, isOver } = useDroppable({ id: LIST_END_ID })
  const ids = useMemo(() => scene.blocks.map((b) => b.id), [scene.blocks])
  const scroller = useRef<HTMLDivElement>(null)

  // Keep the selected row visible (after Up/Down, or after adding a block).
  useEffect(() => {
    if (!selectedBlockId) return
    scroller.current?.querySelector(`[data-block-id="${selectedBlockId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedBlockId, scene.blocks.length])

  return (
    <div className="block-list" ref={scroller} onMouseDown={(e) => e.target === e.currentTarget && selectBlock(null)}>
      {scene.blocks.length === 0 ? (
        <div className="block-empty" ref={setNodeRef}>
          <p>No blocks yet</p>
          <Button
            variant="primary"
            icon={<MessageSquare size={16} />}
            onClick={() => addEntryAt(scene.id, PALETTE[0], 0)}
          >
            Add a dialogue line
          </Button>
          {dropAt !== null && <div className="insert-line" aria-hidden />}
        </div>
      ) : (
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {scene.blocks.map((b, i) => (
            <BlockRow
              key={b.id}
              block={b}
              sceneId={scene.id}
              project={project}
              selected={b.id === selectedBlockId}
              problem={problems.get(b.id) ?? null}
              lineBefore={dropAt === i}
            />
          ))}
          <div ref={setNodeRef} className={`list-end ${isOver ? 'over' : ''}`}>
            {dropAt === scene.blocks.length && <div className="insert-line" aria-hidden />}
            <span>+ add block</span>
          </div>
        </SortableContext>
      )}
    </div>
  )
}
