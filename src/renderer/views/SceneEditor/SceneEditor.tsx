import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import { blockHeight, findBlockPath, getBlockAt } from '@shared/blockTree'
import { createBlock } from '@shared/factory'
import type { CreatableBlockType, Id, Scene } from '@shared/model'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import './sceneEditor.css'
import { addEntryAtPath, reportRefusal } from './blockActions'
import { useKitStore } from '../../store/kitStore'
import { blockIcon, type PaletteEntry } from './blockMeta'
import { summarizeBlock } from './blockSummaries'
import { BlockList } from './BlockList'
import { dragHeight, resolveDrop, type DropTarget } from './editorHelpers'
import { EditorStage } from './EditorStage'
import { EndingPanel } from './EndingPanel/EndingPanel'
import { Inspector } from './Inspector/Inspector'
import { Palette, PaletteGhost } from './Palette'
import { SceneBar } from './SceneBar'
import { useEditorKeys } from './useEditorKeys'

type Dragging = { kind: 'palette'; entry: PaletteEntry } | { kind: 'block'; id: Id }

/**
 * Collision: the droppable under the pointer wins. Between two rows (or over a label) the nearest droppable by
 * distance to its rectangle is used, so a drag never ends up with nothing to land on while the pointer is inside the list.
 */
const collide: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  if (within.length > 0) return within
  const point = args.pointerCoordinates
  if (!point) return closestCenter(args)
  const scored: { id: string | number; value: number; data: { droppableContainer: (typeof args.droppableContainers)[number]; value: number } }[] = []
  for (const container of args.droppableContainers) {
    const rect = args.droppableRects.get(container.id)
    if (!rect) continue
    const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width))
    const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height))
    const value = Math.hypot(dx, dy)
    scored.push({ id: container.id, value, data: { droppableContainer: container, value } })
  }
  return scored.sort((x, y) => x.value - y.value).slice(0, 1)
}

function BlockGhost({ sceneId, id }: { sceneId: Id; id: Id }) {
  const project = useProjectStore((s) => s.project)
  const scene = project?.scenes[sceneId]
  const path = scene ? findBlockPath(scene.blocks, id) : null
  const block = scene && path ? getBlockAt(scene.blocks, path) : undefined
  if (!project || !block) return null
  const summary = summarizeBlock(block, project, { kits: useKitStore.getState().kits })
  return (
    <div className="block-row block-ghost">
      <span className="row-icon">{blockIcon(block)}</span>
      <span className="row-title">{summary.title}</span>
      <span className="row-detail">{summary.detail}</span>
    </div>
  )
}

function Editor({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)!
  const moveBlock = useProjectStore((s) => s.moveBlock)
  const [dragging, setDragging] = useState<Dragging | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  useEditorKeys(scene.id)

  const onDragStart = (e: DragStartEvent): void => {
    const entry = (e.active.data.current as { entry?: PaletteEntry } | undefined)?.entry
    if (entry) setDragging({ kind: 'palette', entry })
    else {
      setDragging({ kind: 'block', id: String(e.active.id) })
      useUiStore.getState().selectBlock(String(e.active.id))
    }
  }

  /** While dragging: which gap of which list is the pointer over? */
  const onDragMove = (e: DragMoveEvent): void => {
    if (!dragging) return
    const over = e.over
    if (!over) return setDrop(null)
    const start = e.activatorEvent as PointerEvent | undefined
    const pointerY = start && typeof start.clientY === 'number' ? start.clientY + e.delta.y : null
    const dragged = e.active.rect.current.translated
    const y = pointerY ?? (dragged ? dragged.top + dragged.height / 2 : over.rect.top)
    const lowerHalf = y > over.rect.top + over.rect.height / 2
    const height = dragging.kind === 'palette' ? (dragging.entry.kit ? 1 : blockHeight(createBlock(dragging.entry.type as CreatableBlockType))) : dragHeight(scene.blocks, dragging.id)
    const next = resolveDrop(scene.blocks, String(over.id), lowerHalf, height, dragging.kind === 'block' ? dragging.id : null)
    setDrop((prev) =>
      prev && next && prev.listKey === next.listKey && prev.index === next.index && prev.fits === next.fits ? prev : next
    )
  }

  const finish = (): void => {
    setDragging(null)
    setDrop(null)
  }

  const onDragEnd = (_e: DragEndEvent): void => {
    const target = drop
    const what = dragging
    finish()
    if (!target || !what) return
    if (what.kind === 'palette') {
      addEntryAtPath(scene.id, what.entry, target.path)
      return
    }
    const from = findBlockPath(scene.blocks, what.id)
    if (from) reportRefusal(moveBlock(scene.id, from, target.path))
  }

  return (
    <div className="scene-editor">
      <SceneBar scene={scene} />
      <div className="scene-body">
        <DndContext sensors={sensors} collisionDetection={collide} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish}>
          <Palette sceneId={scene.id} />
          <main className="scene-centre">
            <BlockList scene={scene} project={project} drop={drop} />
            <EndingPanel scene={scene} />
          </main>
          <DragOverlay dropAnimation={null}>
            {dragging?.kind === 'palette' ? <PaletteGhost entry={dragging.entry} /> : dragging?.kind === 'block' ? <BlockGhost sceneId={scene.id} id={dragging.id} /> : null}
          </DragOverlay>
        </DndContext>
        <aside className="scene-side">
          <EditorStage scene={scene} />
          <Inspector sceneId={scene.id} />
        </aside>
      </div>
    </div>
  )
}

export default function SceneEditor() {
  const sceneId = useUiStore((s) => s.sceneId)
  const setView = useUiStore((s) => s.setView)
  const scene = useProjectStore((s) => (sceneId ? s.project?.scenes[sceneId] : undefined))
  if (!scene) {
    return (
      <EmptyState icon={<MapIcon size={20} />} title="Scene not found">
        This scene no longer exists. It may have been deleted.
        <br />
        <Button onClick={() => setView('map')} icon={<ArrowLeft size={16} />}>
          Back to Story Map
        </Button>
      </EmptyState>
    )
  }
  return <Editor scene={scene} key={scene.id} />
}
