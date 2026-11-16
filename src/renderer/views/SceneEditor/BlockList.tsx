import { useEffect, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { MessageSquare } from 'lucide-react'
import { countBlocks } from '@shared/blockTree'
import type { Id, Project, Scene } from '@shared/model'
import { validateProject } from '@shared/validate'
import { Button } from '../../components/Button'
import { useUiStore } from '../../store/uiStore'
import { addEntryAt } from './blockActions'
import { PALETTE } from './blockMeta'
import type { RowProblem } from './BlockRow'
import { BlockItems, TreeContext } from './BlockTree'
import { LIST_END, type DropTarget } from './editorHelpers'

interface BlockListProps {
  scene: Scene
  project: Project
  /** Where a dragged block or palette entry would land (drives the insertion lines), or null. */
  drop: DropTarget | null
}

/** Problems of this scene grouped by block (the worst one wins). Blocks at any depth are covered. */
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

/** The scene's blocks as a tree: rows, with If and Choice blocks showing indented drop areas beneath them. */
export function BlockList({ scene, project, drop }: BlockListProps) {
  const selectedBlockId = useUiStore((s) => s.selectedBlockId)
  const selectBlock = useUiStore((s) => s.selectBlock)
  const problems = useBlockProblems(project, scene.id)
  const { setNodeRef, isOver } = useDroppable({ id: LIST_END })
  const scroller = useRef<HTMLDivElement>(null)
  const total = countBlocks(scene.blocks)

  // Keep the selected row visible (after Up/Down, or after adding a block).
  useEffect(() => {
    if (!selectedBlockId) return
    scroller.current?.querySelector(`[data-block-id="${selectedBlockId}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedBlockId, total])

  const ctx = useMemo(
    () => ({ sceneId: scene.id, project, problems, selectedBlockId, drop }),
    [scene.id, project, problems, selectedBlockId, drop]
  )

  return (
    <div className="block-list" ref={scroller} onMouseDown={(e) => e.target === e.currentTarget && selectBlock(null)}>
      <TreeContext.Provider value={ctx}>
        {scene.blocks.length === 0 ? (
          <div className="block-empty" ref={setNodeRef}>
            <p>No blocks yet</p>
            <Button variant="primary" icon={<MessageSquare size={16} />} onClick={() => addEntryAt(scene.id, PALETTE[0], 0)}>
              Add a dialogue line
            </Button>
            {drop && drop.listKey === 'root' && <div className="insert-line" aria-hidden />}
          </div>
        ) : (
          <>
            <BlockItems blocks={scene.blocks} parentId={null} branch={null} />
            <div ref={setNodeRef} className={`list-end ${isOver ? 'over' : ''}`}>
              {drop && drop.listKey === 'root' && drop.index === scene.blocks.length && (
                <div className={`insert-line ${drop.fits ? '' : 'refused'}`} aria-hidden />
              )}
              <span>+ add block</span>
            </div>
          </>
        )}
      </TreeContext.Provider>
    </div>
  )
}
