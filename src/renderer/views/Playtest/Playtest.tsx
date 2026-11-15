import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, PanelRightClose, PanelRightOpen, Pencil, RotateCcw } from 'lucide-react'
import type { Id, Project } from '@shared/model'
import { start, step, type PlayInput, type PlayState } from '@shared/interpreter'
import { dialogueFor, variableResolver } from '@shared/stageView'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { Stage } from '../../components/Stage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import './playtest.css'

export const BANNER_TEXT = "Quick preview. Use Play in Ren'Py to see the real game."

function showValue(v: boolean | number | string): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  return typeof v === 'string' ? `"${v}"` : String(v)
}

/** Music and one-shot sounds through <audio>. Missing or unplayable files are ignored. */
function useQuickPlayAudio(project: Project, dir: string | null, state: PlayState): void {
  const music = useRef<HTMLAudioElement | null>(null)
  const trackUrl = useRef<string | null>(null)
  const musicId = state.stage.music
  const loop = state.musicLoop
  const ended = state.status === 'ended'

  useEffect(() => {
    const asset = musicId ? project.assets[musicId] : undefined
    const url = asset && dir ? api.assetUrl(dir, asset.file) : null
    if (!url) {
      music.current?.pause()
      trackUrl.current = null
      return
    }
    if (!music.current) music.current = new Audio()
    const el = music.current
    el.loop = loop
    if (trackUrl.current !== url) {
      trackUrl.current = url
      el.src = url
      el.play().catch(() => undefined)
    }
  }, [musicId, loop, project, dir])

  useEffect(() => {
    if (ended) {
      music.current?.pause()
      trackUrl.current = null
    }
  }, [ended])

  useEffect(
    () => () => {
      music.current?.pause()
      music.current = null
    },
    []
  )

  useEffect(() => {
    if (state.soundSeq === 0 || !state.sound || !dir) return
    const asset = project.assets[state.sound]
    if (!asset) return
    const el = new Audio(api.assetUrl(dir, asset.file))
    el.play().catch(() => undefined)
    // only the counter should retrigger this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.soundSeq])
}

function Run({ project, dir, fromSceneId, onRestart }: { project: Project; dir: string | null; fromSceneId: Id | null; onRestart: () => void }) {
  const [state, setState] = useState<PlayState>(() => start(project, fromSceneId))
  const [panelOpen, setPanelOpen] = useState(true)
  const stateRef = useRef(state)
  stateRef.current = state

  const send = useCallback(
    (input: PlayInput) => {
      setState((s) => step(project, s, input))
    },
    [project]
  )

  useQuickPlayAudio(project, dir, state)

  const close = useCallback(() => useUiStore.getState().stopPlaytest(), [])

  const openInEditor = (): void => {
    const id = state.sceneId
    close()
    if (id && project.scenes[id]) useUiStore.getState().openScene(id)
  }

  // pause block with seconds: wait that long, then carry on
  const pauseSeconds = state.pause ? state.pause.seconds : undefined
  useEffect(() => {
    if (pauseSeconds === undefined || pauseSeconds === null) return
    const t = setTimeout(() => send({ type: 'advance' }), Math.max(0, pauseSeconds) * 1000)
    return () => clearTimeout(t)
  }, [state, pauseSeconds, send])

  // keyboard: Esc closes; Space / Enter advance; 1-9 pick choices. Nothing leaks to the editor underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey) return
      e.stopPropagation()
      const s = stateRef.current
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === ' ' || e.key === 'Enter') {
        if (s.menu) return
        e.preventDefault()
        send({ type: 'advance' })
      } else if (/^[1-9]$/.test(e.key) && s.menu) {
        const option = s.menu[Number(e.key) - 1]
        if (option) {
          e.preventDefault()
          send({ type: 'choose', optionId: option.id })
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close, send])

  const resolveVariable = useMemo(() => variableResolver(project, state.variables), [project, state.variables])
  const sceneName = state.sceneId ? (project.scenes[state.sceneId]?.name ?? '') : ''
  const dialogue = state.line ? dialogueFor(project, state.line.characterId, state.line.text) : null
  const waitingForClick = state.status === 'running' && !state.menu && (state.line !== null || (state.pause !== null && state.pause.seconds === null))

  return (
    <div className="playtest" role="dialog" aria-modal="true" aria-label="Quick play">
      <div className="playtest-banner">{BANNER_TEXT}</div>
      <div className="playtest-toolbar">
        <Button icon={<RotateCcw size={16} />} onClick={onRestart} title="Start again from the beginning">
          Restart
        </Button>
        <Button icon={<ArrowLeft size={16} />} onClick={close} title="Close Quick play (Esc)">
          Back to editor
        </Button>
        <Button icon={<Pencil size={16} />} onClick={openInEditor} disabled={!state.sceneId || !project.scenes[state.sceneId]} title="Close Quick play and open the current scene in the Scene Editor">
          Open this scene in editor
        </Button>
        <div className="topbar-spacer" />
        <Button
          variant="ghost"
          icon={panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          title="Show or hide the variables panel"
        >
          Variables
        </Button>
      </div>
      <div className="playtest-body">
        <div
          className={`playtest-stage-wrap ${waitingForClick ? 'clickable' : ''}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.stage-choice')) return
            send({ type: 'advance' })
          }}
        >
          <Stage
            stage={state.stage}
            assets={project.assets}
            characters={project.characters}
            dir={dir}
            dialogue={dialogue}
            resolveVariable={resolveVariable}
            menu={state.menu}
            onChoose={(optionId) => send({ type: 'choose', optionId })}
            fade
          />
          {waitingForClick && <div className="playtest-hint">Click, Space or Enter to continue</div>}
          {state.status === 'ended' && (
            <div className="playtest-end" role="status">
              <h2>End of story</h2>
              {state.notice && <p className="playtest-notice">{state.notice}</p>}
              <p className="playtest-trail">{state.history.join(' › ')}</p>
              <div className="playtest-end-actions">
                <Button icon={<RotateCcw size={16} />} onClick={onRestart}>
                  Restart
                </Button>
                <Button icon={<ArrowLeft size={16} />} onClick={close}>
                  Back to editor
                </Button>
              </div>
            </div>
          )}
        </div>
        {panelOpen && (
          <aside className="playtest-panel" aria-label="Quick play details">
            <section>
              <h3>Current scene</h3>
              <p className="playtest-scene" data-testid="current-scene">
                {sceneName || 'None'}
              </p>
              <p className="playtest-history">
                {state.history.map((h, i) => (
                  <span key={i}>
                    {i > 0 && <ChevronRight size={12} aria-hidden />}
                    {h}
                  </span>
                ))}
              </p>
            </section>
            <section>
              <h3>Variables</h3>
              {project.variableOrder.length === 0 ? (
                <p className="playtest-none">This story has no variables.</p>
              ) : (
                <ul className="playtest-vars" data-testid="variables">
                  {project.variableOrder
                    .filter((id) => project.variables[id])
                    .map((id) => (
                      <li key={id}>
                        <span className="playtest-var-name">{project.variables[id].name}</span>
                        <span className="playtest-var-value">{state.variables[id] === undefined ? '' : showValue(state.variables[id])}</span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </aside>
        )}
      </div>
    </div>
  )
}

/** Full-window Quick play over the Shell. Plays a snapshot of the story taken when it opened. */
export default function Playtest() {
  const playtest = useUiStore((s) => s.playtest)
  const dir = useProjectStore((s) => s.dir)
  const [run, setRun] = useState(0)
  const [snapshot, setSnapshot] = useState<Project | null>(null)

  useEffect(() => {
    setSnapshot(playtest ? useProjectStore.getState().project : null)
    setRun(0)
  }, [playtest])

  if (!playtest || !snapshot) return null
  const from = playtest.fromSceneId ?? snapshot.startSceneId
  return <Run key={run} project={snapshot} dir={dir} fromSceneId={from} onRestart={() => setRun((r) => r + 1)} />
}
