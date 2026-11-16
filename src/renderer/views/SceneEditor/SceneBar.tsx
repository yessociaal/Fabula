import { useState } from 'react'
import { ArrowLeft, ChevronRight, MoreHorizontal, Play } from 'lucide-react'
import type { Scene } from '@shared/model'
import { labelLockProblem } from '@shared/naming'
import { deriveEdges } from '@shared/edges'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { TextField } from '../../components/TextField'
import { ContextMenu, type MenuItem } from '../../components/ContextMenu'
import { IconButton } from '../../components/IconButton'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { playInRenpy } from '../../renpyFlows'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { plural } from '../../util'

/** Top bar of the Scene Editor: breadcrumb, scene name, Play from here and the ⋯ menu. */
export function SceneBar({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [locking, setLocking] = useState(false)
  const S = useProjectStore.getState
  const setView = useUiStore((s) => s.setView)
  const busy = useUiStore((s) => s.busy)

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
    {
      label: 'Role',
      submenu: [
        { label: `${scene.role === 'normal' ? '✓ ' : ''}Normal`, onSelect: () => S().setSceneRole(scene.id, 'normal') },
        {
          label: `${scene.role === 'splashscreen' ? '✓ ' : ''}Splash screen`,
          title: 'Shown once when the game starts, before the main menu. It must finish with "End of story".',
          onSelect: () => {
            S().setSceneRole(scene.id, 'splashscreen')
            if (scene.ending.type !== 'end') toast('A splash screen must finish with "End of story". Change its ending.')
          }
        }
      ]
    },
    {
      label: scene.labelLock === null ? 'Lock label…' : `Lock label… (${scene.labelLock})`,
      title: 'Make the exported label of this scene a fixed name, for example one your own code jumps to',
      disabled: isStart,
      onSelect: () => setLocking(true)
    },
    { separator: true },
    { label: 'Delete', danger: true, onSelect: () => setConfirmDelete(true) }
  ]

  return (
    <header className="scene-bar">
      <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setView('map')} title="Back to the Story Map">
        Story Map
      </Button>
      <ChevronRight size={16} className="crumb-sep" />
      <CommitField className="scene-name-input" aria-label="Scene name" value={scene.name} required onCommit={(name) => S().renameScene(scene.id, name)} />
      {isStart && <span className="start-badge" title="The game begins with this scene">▶ Start</span>}
      <div className="topbar-spacer" />
      <Button icon={<Play size={16} />} onClick={() => useUiStore.getState().startPlaytest(scene.id)} title="Quick play this story starting at this scene">
        Play from here
      </Button>
      <Button
        icon={<Play size={16} />}
        disabled={busy !== null}
        onClick={() => playInRenpy(scene.id)}
        title="Export the story and start the real Ren'Py game at this scene"
      >
        Play from here in Ren'Py
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
      {locking && <LockLabelModal scene={scene} onClose={() => setLocking(false)} />}
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

/** Type the label to lock; the check runs as you type. Saving an empty text goes back to the automatic label. */
function LockLabelModal({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const [text, setText] = useState(scene.labelLock ?? '')
  if (!project) return null
  const trimmed = text.trim()
  const problem = trimmed === '' ? null : labelLockProblem(project, scene.id, trimmed)
  const save = (): void => {
    if (problem !== null) return
    useProjectStore.getState().setLabelLock(scene.id, trimmed === '' ? null : trimmed)
    onClose()
  }
  return (
    <Modal
      title="Lock label"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={problem !== null} onClick={save}>
            {trimmed === '' ? 'Use the automatic label' : 'Lock label'}
          </Button>
        </>
      }
    >
      <div onKeyDown={(e) => e.key === 'Enter' && save()}>
        <TextField label="Label" value={text} onChange={setText} autoFocus aria-label="Locked label" />
        <p className={`lock-status ${problem === null ? 'ok' : 'bad'}`} role="status">
          {trimmed === ''
            ? 'Leave it empty to let Fabula pick the label from the scene name.'
            : problem === null
              ? `OK: this scene will always be exported as "label ${trimmed}".`
              : problem}
        </p>
      </div>
    </Modal>
  )
}
