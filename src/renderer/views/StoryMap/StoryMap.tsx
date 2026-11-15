import { useMemo, useRef } from 'react'
import { Background, BackgroundVariant, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './storyMap.css'
import type { Id } from '@shared/model'
import { Button } from '../../components/Button'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { Modal } from '../../components/Modal'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { plural } from '../../util'
import { MapToolbar } from './MapToolbar'
import { SceneNode, type SceneFlowNode } from './SceneNode'
import { useMapInteractions } from './useMapInteractions'
import { useMapUi } from './mapUi'

const nodeTypes = { scene: SceneNode }

function MapCanvas() {
  const rf = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const m = useMapInteractions(wrapperRef, searchRef)
  const project = useProjectStore((s) => s.project)
  const hasClipboard = useMapUi((s) => s.clipboard !== null)

  const menuItems = useMemo<MenuItem[]>(() => {
    const menu = m.menu
    if (!menu || !project) return []
    const store = useProjectStore.getState
    if (menu.kind === 'pane') {
      return [
        {
          label: 'New scene here',
          onSelect: () => m.addSceneAt({ x: Math.round(menu.flow.x), y: Math.round(menu.flow.y) })
        },
        { label: 'Paste', disabled: !hasClipboard, title: hasClipboard ? undefined : 'Copy some scenes first (Ctrl+C)', onSelect: m.paste }
      ]
    }
    const scene = project.scenes[menu.sceneId]
    if (!scene) return []
    const selected = useUiStore.getState().selectedNodeIds
    const doomed: Id[] = selected.includes(scene.id) ? selected : [scene.id]
    const chapters: MenuItem[] = [
      {
        label: `${scene.chapterId === null ? '✓ ' : ''}None`,
        onSelect: () => store().setSceneChapter(scene.id, null)
      },
      ...project.chapterOrder
        .filter((id) => project.chapters[id])
        .map<MenuItem>((id) => ({
          label: `${scene.chapterId === id ? '✓ ' : ''}${project.chapters[id].name}`,
          onSelect: () => store().setSceneChapter(scene.id, id)
        }))
    ]
    const later = 'Available in a later step'
    return [
      { label: 'Open', onSelect: () => m.openScene(scene.id) },
      { label: 'Rename', onSelect: () => useMapUi.getState().setRenaming(scene.id) },
      {
        label: 'Set as start',
        disabled: project.startSceneId === scene.id,
        title: project.startSceneId === scene.id ? 'This is already the start scene' : undefined,
        onSelect: () => store().setStartScene(scene.id)
      },
      {
        label: 'Duplicate',
        onSelect: () => {
          const id = store().duplicateScene(scene.id)
          if (id) m.select([id])
        }
      },
      {
        label: 'Move to chapter',
        submenu: chapters,
        title: project.chapterOrder.length === 0 ? 'Use + Chapter on the toolbar to create chapters' : undefined
      },
      { separator: true },
      { label: 'Play from here (Quick play)', disabled: true, title: later },
      { label: "Play from here in Ren'Py", disabled: true, title: later },
      { separator: true },
      {
        label: doomed.length > 1 ? `Delete ${doomed.length} scenes` : 'Delete',
        danger: true,
        onSelect: () => m.requestDelete(doomed)
      }
    ]
  }, [m, project, hasClipboard])

  return (
    <div className="story-map">
      <MapToolbar
        searchRef={searchRef}
        matchCount={m.matchCount}
        onAddScene={m.addSceneInView}
        onAddChapter={m.addChapter}
        onTidy={m.tidy}
        onZoomIn={() => rf.zoomIn({ duration: 150 })}
        onZoomOut={() => rf.zoomOut({ duration: 150 })}
        onFit={() => rf.fitView({ padding: 0.2, duration: 300 })}
        onNextMatch={m.focusMatch}
      />
      <div className="map-canvas" ref={wrapperRef} onDoubleClick={m.onDoubleClick}>
        <ReactFlow<SceneFlowNode>
          nodes={m.nodes}
          edges={m.edges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          onNodesChange={m.onNodesChange}
          onEdgesChange={m.onEdgesChange}
          onConnect={m.onConnect}
          onConnectEnd={m.onConnectEnd}
          onReconnect={m.onReconnect}
          onReconnectEnd={m.onReconnectEnd}
          onBeforeDelete={m.onBeforeDelete}
          onNodeDragStart={m.onNodeDragStart}
          onNodeDragStop={m.onNodeDragStop}
          onSelectionDragStart={m.onNodeDragStart}
          onSelectionDragStop={m.onNodeDragStop}
          onNodeDoubleClick={(_, node) => m.openScene(node.id)}
          onNodeContextMenu={m.onNodeContextMenu}
          onPaneContextMenu={m.onPaneContextMenu}
          deleteKeyCode={['Delete', 'Backspace']}
          multiSelectionKeyCode="Shift"
          selectionKeyCode="Shift"
          zoomOnDoubleClick={false}
          edgesReconnectable
          connectionRadius={24}
          minZoom={0.1}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          nodeOrigin={[0, 0]}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeStrokeWidth={2}
            nodeColor={(n) => {
              const sc = project?.scenes[n.id]
              return (sc?.chapterId && project?.chapters[sc.chapterId]?.color) || '#4a5063'
            }}
          />
        </ReactFlow>
        {m.menu && <ContextMenu x={m.menu.x} y={m.menu.y} items={menuItems} onClose={m.closeMenu} />}
      </div>
      {m.pendingDelete && (
        <Modal
          title={m.pendingDelete.count === 1 ? 'Delete this scene?' : `Delete ${m.pendingDelete.count} scenes?`}
          onClose={m.cancelDelete}
          footer={
            <>
              <Button onClick={m.cancelDelete}>Cancel</Button>
              <Button variant="danger" onClick={m.confirmDelete}>
                Delete
              </Button>
            </>
          }
        >
          <p className="modal-text">
            {m.pendingDelete.arrows === 0
              ? 'No arrows from other scenes lead here.'
              : `${plural(m.pendingDelete.arrows, 'arrow')} from other scenes will be disconnected.`}{' '}
            You can undo this with Ctrl+Z.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default function StoryMap() {
  return (
    <ReactFlowProvider>
      <MapCanvas />
    </ReactFlowProvider>
  )
}
