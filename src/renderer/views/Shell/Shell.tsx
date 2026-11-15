import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Home as HomeIcon,
  Map as MapIcon,
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
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { closeProject } from '../../openProject'
import { flushAutosave, useSaveStatus } from '../../store/autosave'
import { redo, undo, useProjectStore } from '../../store/projectStore'
import { useUiStore, type View } from '../../store/uiStore'
import { useStore } from 'zustand'
import Assets from '../Assets/Assets'
import Characters from '../Characters/Characters'
import StoryMap from '../StoryMap/StoryMap'
import Variables from '../Variables/Variables'

const RAIL: { view: View; label: string; icon: ReactNode; empty: string }[] = [
  { view: 'map', label: 'Story Map', icon: <MapIcon size={20} />, empty: 'The story map arrives in a later step.' },
  { view: 'characters', label: 'Characters', icon: <Users size={20} />, empty: 'The characters view arrives in a later step.' },
  { view: 'assets', label: 'Assets', icon: <ImageIcon size={20} />, empty: 'The assets view arrives in a later step.' },
  { view: 'variables', label: 'Variables', icon: <Sigma size={20} />, empty: 'The variables view arrives in a later step.' },
  { view: 'settings', label: 'Settings', icon: <SettingsIcon size={20} />, empty: 'The settings view arrives in a later step.' }
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
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

  const problems = validateProject(project)
  const errors = problems.filter((p) => p.severity === 'error').length
  const count = problems.length
  const current = RAIL.find((r) => r.view === view) ?? RAIL[0]

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
        <Button
          variant="ghost"
          className={errors > 0 ? 'problems-error' : count > 0 ? 'problems-warn' : ''}
          icon={<AlertTriangle size={16} />}
          title={count === 0 ? 'No problems found' : 'Problems in your story'}
        >
          {count === 1 ? '1 problem' : `${count} problems`}
        </Button>
        <Button icon={<Play size={16} />} disabled title="Available in a later step">
          Play
        </Button>
        <Button icon={<Download size={16} />} disabled title="Available in a later step">
          Export
        </Button>
      </header>
      <div className="shell-body">
        <nav className="rail" aria-label="Views">
          {RAIL.map((r) => (
            <button
              key={r.view}
              type="button"
              className={`rail-item ${view === r.view ? 'active' : ''}`}
              title={r.label}
              aria-current={view === r.view ? 'page' : undefined}
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
            <EmptyState icon={<MapIcon size={20} />} title="Scene Editor">
              The Scene Editor arrives in a later step.
              <br />
              <Button onClick={() => setView('map')} icon={<ArrowLeft size={16} />}>
                Back to Story Map
              </Button>
            </EmptyState>
          ) : (
            <EmptyState icon={current.icon} title={current.label}>
              {current.empty}
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  )
}
