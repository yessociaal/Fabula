import { useState } from 'react'
import { ArrowLeft, ChevronRight, ClipboardCopy, MoreHorizontal, Play } from 'lucide-react'
import type { Scene } from '@shared/model'
import { compileProject } from '@shared/compiler'
import { deriveEdges } from '@shared/edges'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { IconButton } from '../../components/IconButton'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { plural } from '../../util'

/** Top bar of the Scene Editor: breadcrumb, scene name, Play from here and the ⋯ menu. */
export function SceneBar({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const S = useProjectStore.getState
  const setView = useUiStore((s) => s.setView)

  if (!project) return null

  const arrowsIn = deriveEdges(project).filter((e) => e.target === scene.id && e.source !== scene.id).length
  const isStart = project.startSceneId === scene.id

  const items: MenuItem[] = [
    { label: 'Rename', onSelect: () => document.querySelector<HTMLInputElement>('.scene-name-input')?.focus() },
    {
      label: 'Set as start',
      disabled: isStart,
      title: isStart ? 'This is already the start scene' : undefined,
      onSelect: () => S().setStartScene(scene.id)
    },
    {
      label: 'Duplicate',
      onSelect: () => {
        const id = S().duplicateScene(scene.id)
        if (id) {
          useUiStore.getState().openScene(id)
          toast('Duplicated. You are now in the copy.')
        }
      }
    },
    {
      label: 'Move to chapter',
      title: project.chapterOrder.length === 0 ? 'Use + Chapter on the Story Map to create chapters' : undefined,
      submenu: [
        { label: `${scene.chapterId === null ? '✓ ' : ''}None`, onSelect: () => S().setSceneChapter(scene.id, null) },
        ...project.chapterOrder
          .filter((id) => project.chapters[id])
          .map<MenuItem>((id) => ({
            label: `${scene.chapterId === id ? '✓ ' : ''}${project.chapters[id].name}`,
            onSelect: () => S().setSceneChapter(scene.id, id)
          }))
      ]
    },
    { separator: true },
    { label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) }
  ]

  const copyScript = async (): Promise<void> => {
    const result = compileProject(project)
    const loc = result.sceneLocations[scene.id]
    const file = result.files.find((f) => f.path === loc?.file)
    if (!file) {
      toast('This scene is not in the compiled output.', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(file.content)
      toast(`Copied ${file.path} (${file.content.split('\n').length} lines)`, 'ok')
    } catch {
      toast('Could not copy to the clipboard.', 'error')
    }
  }

  return (
    <header className="scene-bar">
      <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setView('map')} title="Back to the Story Map">
        Story Map
      </Button>
      <ChevronRight size={16} className="crumb-sep" />
      <CommitField className="scene-name-input" aria-label="Scene name" value={scene.name} required onCommit={(name) => S().renameScene(scene.id, name)} />
      {isStart && <span className="start-badge" title="The game begins with this scene">▶ Start</span>}
      <div className="topbar-spacer" />
      {import.meta.env.DEV && (
        <Button icon={<ClipboardCopy size={16} />} onClick={() => void copyScript()} title="Development only: copy the compiled script of this scene's file">
          Copy script
        </Button>
      )}
      <Button icon={<Play size={16} />} disabled title="Available in a later step">
        Play from here
      </Button>
      <IconButton
        label="More scene actions"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.right - 180, y: r.bottom + 4 })
        }}
      >
        <MoreHorizontal size={18} />
      </IconButton>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
      {confirmDelete && (
        <Modal
          title="Delete this scene?"
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmDelete(false)
                  S().deleteScenes([scene.id])
                  useUiStore.getState().setSelectedNodes([])
                  setView('map')
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="modal-text">
            “{scene.name}” will be removed.{' '}
            {arrowsIn === 0 ? 'No arrows from other scenes lead here.' : `${plural(arrowsIn, 'arrow')} from other scenes will be disconnected.`} You can undo this with Ctrl+Z.
          </p>
        </Modal>
      )}
    </header>
  )
}
