import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileCode,
  HelpCircle,
  Home as HomeIcon,
  LayoutPanelTop,
  Map as MapIcon,
  Palette,
  Puzzle,
  Play,
  Redo2,
  Settings as SettingsIcon,
  Sigma,
  Undo2,
  Users,
  Image as ImageIcon
} from 'lucide-react'
import { validateProject } from '@shared/validate'
import { Button } from '../../components/Button'
import { ContextMenu } from '../../components/ContextMenu'
import { toast } from '../../components/Toast'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { closeProject } from '../../openProject'
import { buildFlow, exportToRenpyFlow, lintFlow, openGameFolder, playInRenpy } from '../../renpyFlows'
import { flushAutosave, useSaveStatus } from '../../store/autosave'
import { redo, undo, useProjectStore } from '../../store/projectStore'
import { useUiStore, type View } from '../../store/uiStore'
import { useStore } from 'zustand'
import Assets from '../Assets/Assets'
import Characters from '../Characters/Characters'
import SceneEditor from '../SceneEditor/SceneEditor'
import StoryMap from '../StoryMap/StoryMap'
import Variables from '../Variables/Variables'
import ScriptFiles from '../ScriptFiles/ScriptFiles'
import Kits from '../Kits/Kits'
import ScreenDesigner from '../ScreenDesigner/ScreenDesigner'
import { useKitContext } from '../../store/kitStore'
import { ProblemsDrawer } from '../Problems/ProblemsDrawer'
import Look from '../Look/Look'
import Settings from '../Settings/Settings'
import { RenpyDialogs } from './RenpyDialogs'
import { ShortcutsModal } from './ShortcutsModal'

const RAIL: { view: View; label: string; icon: ReactNode; empty: string }[] = [
  { view: 'map', label: 'Story Map', icon: <MapIcon size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'characters', label: 'Characters', icon: <Users size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'assets', label: 'Assets', icon: <ImageIcon size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'variables', label: 'Variables', icon: <Sigma size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'scripts', label: 'Script files', icon: <FileCode size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'screens', label: 'Screens', icon: <LayoutPanelTop size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'look', label: 'Look', icon: <Palette size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'kits', label: 'Kits', icon: <Puzzle size={20} />, empty: 'Pick something from the list on the left.' },
  { view: 'settings', label: 'Settings', icon: <SettingsIcon size={20} />, empty: 'Pick something from the list on the left.' }
]

function TitleField() {
  const title = useProjectStore((s) => s.project?.meta.title ?? '')
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (draft !== null) inputRef.current?.select()
  }, [draft])

  const commit = () => {
    if (draft !== null) {
      const next = draft.trim()
      if (next && next !== title) updateMeta({ title: next })
    }
    setDraft(null)
  }

  if (draft === null) {
    return (
      <button type="button" className="title-btn" title="Click to rename the story" onClick={() => setDraft(title)}>
        {title}
      </button>
    )
  }
  return (
    <input
      ref={inputRef}
      className="input title-input"
      value={draft}
      aria-label="Story title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setDraft(null)
      }}
    />
  )
}

export default function Shell() {
  const project = useProjectStore((s) => s.project)
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  const status = useSaveStatus((s) => s.status)
  const canUndo = useStore(useProjectStore.temporal, (t) => t.pastStates.length > 0)
  const canRedo = useStore(useProjectStore.temporal, (t) => t.futureStates.length > 0)
  const busy = useUiStore((s) => s.busy)
  const problemsOpen = useUiStore((s) => s.problemsOpen)
  const kitContext = useKitContext()
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (document.querySelector('.modal-backdrop, .playtest')) return
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!project) return null

  const problems = validateProject(project, kitContext)
  const errors = problems.filter((p) => p.severity === 'error').length
  const count = problems.length
  const active = (v: View): boolean => view === v || (v === 'map' && view === 'scene')
  const current = RAIL.find((r) => r.view === view) ?? RAIL[0]

  const quickPlay = () => {
    if (!project.startSceneId || !project.scenes[project.startSceneId]) {
      toast('Set a start scene first: right-click a scene on the map and choose Set as start.', 'error')
      return
    }
    useUiStore.getState().startPlaytest(project.startSceneId)
  }

  const goHome = async () => {
    await flushAutosave()
    closeProject()
  }

  return (
    <div className="shell">
      <header className="topbar">
        <IconButton label="Back to the home screen" onClick={goHome}>
          <HomeIcon size={18} />
        </IconButton>
        <TitleField />
        <span className={`save-state save-${status}`} role="status">
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : 'Saved'}
        </span>
        <div className="topbar-group">
          <IconButton label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
            <Undo2 size={18} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
            <Redo2 size={18} />
          </IconButton>
        </div>
        <div className="topbar-spacer" />
        <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
          <HelpCircle size={18} />
        </IconButton>
        <Button
          variant="ghost"
          className={errors > 0 ? 'problems-error' : count > 0 ? 'problems-warn' : ''}
          icon={<AlertTriangle size={16} />}
          title={count === 0 ? 'No problems found' : 'Show the problems in your story'}
          aria-pressed={problemsOpen}
          onClick={() => useUiStore.getState().setProblemsOpen(!problemsOpen)}
        >
          {count === 1 ? '1 problem' : `${count} problems`}
        </Button>
        <Button icon={<Play size={16} />} onClick={quickPlay} title="Play the story in the editor, from the start scene">
          Quick play
        </Button>
        <Button
          icon={<Play size={16} />}
          disabled={busy !== null}
          onClick={() => playInRenpy()}
          title="Export the story, then start the real Ren'Py game"
        >
          {busy ?? "Play in Ren'Py"}
        </Button>
        <Button
          icon={<Download size={16} />}
          disabled={busy !== null}
          title="Export, check or build the Ren'Py game"
          aria-haspopup="menu"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setExportMenu({ x: r.right - 220, y: r.bottom + 4 })
          }}
        >
          Export <ChevronDown size={14} />
        </Button>
      </header>
      <div className="shell-body">
        <nav className="rail" aria-label="Views">
          {RAIL.map((r) => (
            <button
              key={r.view}
              type="button"
              className={`rail-item ${active(r.view) ? 'active' : ''}`}
              title={r.label}
              aria-current={active(r.view) ? 'page' : undefined}
              onClick={() => setView(r.view)}
            >
              {r.icon}
              <span>{r.label}</span>
            </button>
          ))}
        </nav>
        <section className="view">
          {view === 'characters' ? (
            <Characters />
          ) : view === 'assets' ? (
            <Assets />
          ) : view === 'variables' ? (
            <Variables />
          ) : view === 'map' ? (
            <StoryMap />
          ) : view === 'scene' ? (
            <SceneEditor />
          ) : view === 'scripts' ? (
            <ScriptFiles />
          ) : view === 'screens' ? (
            <ScreenDesigner />
          ) : view === 'look' ? (
            <Look />
          ) : view === 'kits' ? (
            <Kits />
          ) : view === 'settings' ? (
            <Settings />
          ) : (
            <EmptyState icon={current.icon} title={current.label}>
              {current.empty}
            </EmptyState>
          )}
        </section>
        <ProblemsDrawer />
      </div>
      {exportMenu && (
        <ContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          onClose={() => setExportMenu(null)}
          items={[
            { label: "Export to Ren'Py", title: "Write the story into the Ren'Py game folder", onSelect: exportToRenpyFlow },
            { label: "Check with Ren'Py lint", title: "Export, then let Ren'Py check the game for mistakes", onSelect: lintFlow },
            { label: 'Build game for sharing…', title: 'Make a Windows version of the game that you can give to other people', onSelect: buildFlow },
            { separator: true },
            { label: 'Open game folder', title: "Show the Ren'Py game folder in Explorer", onSelect: openGameFolder }
          ]}
        />
      )}
      <RenpyDialogs />
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}
