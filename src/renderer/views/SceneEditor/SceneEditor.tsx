import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { ArrowLeft, Map as MapIcon } from 'lucide-react'
import type { Scene } from '@shared/model'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import './sceneEditor.css'
import { addEntryAt } from './blockActions'
import { BlockList, LIST_END_ID } from './BlockList'
import type { PaletteEntry } from './blockMeta'
import { dropInsertIndex } from './editorHelpers'
import { EditorStage } from './EditorStage'
import { EndingPanel } from './EndingPanel/EndingPanel'
import { Inspector } from './Inspector/Inspector'
import { Palette, PaletteGhost } from './Palette'
import { SceneBar } from './SceneBar'
import { useEditorKeys } from './useEditorKeys'

function Editor({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)!
  const moveBlock = useProjectStore((s) => s.moveBlock)
  const [activeEntry, setActiveEntry] = useState<PaletteEntry | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  useEditorKeys(scene.id)

  const onDragStart = (e: DragStartEvent): void => {
    const entry = (e.active.data.current as { entry?: PaletteEntry } | undefined)?.entry
    if (entry) setActiveEntry(entry)
    else useUiStore.getState().selectBlock(String(e.active.id))
  }

  /** While a palette entry is dragged: which gap of the list is it over? */
  const onDragMove = (e: DragMoveEvent): void => {
    if (!activeEntry) return
    const over = e.over
    if (!over) return setDropAt(null)
    if (over.id === LIST_END_ID) return setDropAt(scene.blocks.length)
    const index = scene.blocks.findIndex((b) => b.id === over.id)
    if (index < 0) return setDropAt(null)
    const dragged = e.active.rect.current.translated
    const centre = dragged ? dragged.top + dragged.height / 2 : over.rect.top
    setDropAt(dropInsertIndex(index, centre > over.rect.top + over.rect.height / 2))
  }

  const finish = (): void => {
    setActiveEntry(null)
    setDropAt(null)
  }

  const onDragEnd = (e: DragEndEvent): void => {
    if (activeEntry) {
      if (dropAt !== null) addEntryAt(scene.id, activeEntry, dropAt)
      return finish()
    }
    finish()
    if (!e.over || e.active.id === e.over.id) return
    const from = scene.blocks.findIndex((b) => b.id === e.active.id)
    const to = e.over.id === LIST_END_ID ? scene.blocks.length - 1 : scene.blocks.findIndex((b) => b.id === e.over!.id)
    if (from >= 0 && to >= 0) moveBlock(scene.id, from, to)
  }

  return (
    <div className="scene-editor">
      <SceneBar scene={scene} />
      <div className="scene-body">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={finish}>
          <Palette sceneId={scene.id} />
          <main className="scene-centre">
            <BlockList scene={scene} project={project} dropAt={dropAt} />
            <EndingPanel scene={scene} />
          </main>
          <DragOverlay dropAnimation={null}>{activeEntry ? <PaletteGhost entry={activeEntry} /> : null}</DragOverlay>
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
