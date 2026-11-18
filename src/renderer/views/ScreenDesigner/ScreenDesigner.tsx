import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Copy,
  Image as ImageIcon,
  ImagePlay,
  LayoutPanelTop,
  MousePointerClick,
  Plus,
  RectangleHorizontal,
  Square,
  Trash2,
  Type
} from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Id, ScreenDef, ScreenElement, ScreenElementType } from '@shared/model'
import { resizeBox, snapAxis, type Handle } from '@shared/screens'
import { screenUses } from '@shared/screens'
import { findUsage } from '@shared/usage'
import { Button } from '../../components/Button'
import { Dropdown, type DropdownItem } from '../../components/Dropdown'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { ElementBody, boxStyle } from '../../components/ScreenView'
import { InUseModal } from '../../components/InUseModal'
import { CommitField } from '../../components/CommitField'
import { api } from '../../api'
import { pauseHistory, resumeHistory, useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { plural } from '../../util'
import { ElementProperties } from './ElementProperties'
import './screenDesigner.css'

export const TOOLS: { type: ScreenElementType; label: string; icon: ReactNode }[] = [
  { type: 'image', label: 'Image', icon: <ImageIcon size={15} /> },
  { type: 'text', label: 'Text', icon: <Type size={15} /> },
  { type: 'button', label: 'Button', icon: <RectangleHorizontal size={15} /> },
  { type: 'imageButton', label: 'Image button', icon: <ImagePlay size={15} /> },
  { type: 'hotspot', label: 'Hotspot', icon: <Square size={15} strokeDasharray="3 2" /> },
  { type: 'bar', label: 'Bar', icon: <BarChart3 size={15} /> }
]

const ZOOMS: { value: string; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: '0.25', label: '25%' },
  { value: '0.5', label: '50%' },
  { value: '0.75', label: '75%' },
  { value: '1', label: '100%' }
]

const SNAP_PX = 8

function backdropKey(screenId: Id): string {
  return `fabula.screenBackdrop.${screenId}`
}
function readBackdrop(screenId: Id): Id | null {
  try {
    return localStorage.getItem(backdropKey(screenId))
  } catch {
    return null
  }
}
function writeBackdrop(screenId: Id, assetId: Id | null): void {
  try {
    if (assetId) localStorage.setItem(backdropKey(screenId), assetId)
    else localStorage.removeItem(backdropKey(screenId))
  } catch {
    // the backdrop is only an editing aid; losing it is fine
  }
}

function LayerRow({ el, selected, onSelect }: { el: ScreenElement; selected: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: el.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}
      className={`sd-layer ${selected ? 'active' : ''}`}
      data-layer-id={el.id}
    >
      <span className="sd-layer-grip" {...attributes} {...listeners} title="Drag to change the layer order" aria-label={`Drag ${el.name}`}>
        ⋮⋮
      </span>
      <button type="button" className="sd-layer-name" onClick={onSelect} aria-current={selected}>
        <span className="sd-layer-type">{el.type === 'imageButton' ? 'image button' : el.type}</span> {el.name}
      </button>
    </li>
  )
}

type Gesture =
  | { kind: 'move'; id: Id; px: number; py: number; x0: number; y0: number; w: number; h: number }
  | { kind: 'resize'; id: Id; handle: Handle; px: number; py: number; box: { x: number; y: number; w: number; h: number } }

export default function ScreenDesigner() {
  const project = useProjectStore((s) => s.project)
  const dir = useProjectStore((s) => s.dir)
  const store = useProjectStore.getState
  const screenId = useUiStore((s) => s.screenId)
  const selectedId = useUiStore((s) => s.selectedElementId)
  const [tool, setTool] = useState<ScreenElementType | null>(null)
  const [zoom, setZoom] = useState('fit')
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [backdrop, setBackdrop] = useState<Id | null>(null)
  const [deleting, setDeleting] = useState<Id | null>(null)
  const [renaming, setRenaming] = useState<Id | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [areaSize, setAreaSize] = useState({ w: 800, h: 450 })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const screens = project?.screenOrder.map((id) => project.screens[id]).filter((d): d is ScreenDef => Boolean(d)) ?? []
  const def = project && screenId ? project.screens[screenId] : undefined
  const active = def ?? screens[0]
  const activeId = active?.id ?? null
  const selected = active?.elements.find((e) => e.id === selectedId) ?? null

  // Keep the open screen valid: open the first one when nothing (or a deleted screen) is open.
  useEffect(() => {
    if (!project) return
    if (!screenId || !project.screens[screenId]) {
      const first = project.screenOrder.find((id) => project.screens[id]) ?? null
      if (first !== screenId) useUiStore.getState().openScreen(first)
    }
  }, [project, screenId])

  useEffect(() => {
    setBackdrop(activeId ? readBackdrop(activeId) : null)
  }, [activeId])

  useEffect(() => {
    const el = area.current
    if (!el) return
    const measure = (): void => setAreaSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeId])

  const W = project?.meta.width ?? 1920
  const H = project?.meta.height ?? 1080
  const fitScale = Math.max(0.05, Math.min((areaSize.w - 32) / W, (areaSize.h - 32) / H))
  const scale = zoom === 'fit' ? fitScale : Number(zoom)

  const select = (id: Id | null): void => useUiStore.getState().selectElement(id)

  const place = useCallback(
    (clientX: number, clientY: number) => {
      if (!tool || !activeId || !canvas.current) return
      const rect = canvas.current.getBoundingClientRect()
      const id = store().addElement(activeId, tool, (clientX - rect.left) / scale, (clientY - rect.top) / scale)
      if (id) select(id)
      setTool(null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool, activeId, scale]
  )

  // keyboard: arrows nudge, Delete removes, Ctrl+D duplicates, Esc drops the tool
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (useUiStore.getState().view !== 'screens') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'Escape') return setTool(null)
      const sid = useUiStore.getState().screenId
      const eid = useUiStore.getState().selectedElementId
      const proj = useProjectStore.getState().project
      const el = sid && eid ? proj?.screens[sid]?.elements.find((x) => x.id === eid) : undefined
      if (!sid || !eid || !el) return
      const step = e.shiftKey ? 10 : 1
      const move = (dx: number, dy: number): void => {
        e.preventDefault()
        useProjectStore.getState().updateElement(sid, eid, { x: el.x + dx, y: el.y + dy })
      }
      if (e.key === 'ArrowLeft') move(-step, 0)
      else if (e.key === 'ArrowRight') move(step, 0)
      else if (e.key === 'ArrowUp') move(0, -step)
      else if (e.key === 'ArrowDown') move(0, step)
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        useProjectStore.getState().deleteElement(sid, eid)
        useUiStore.getState().selectElement(null)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const copy = useProjectStore.getState().duplicateElement(sid, eid)
        if (copy) useUiStore.getState().selectElement(copy)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toCanvas = (e: ReactPointerEvent): { dx: number; dy: number } | null => {
    const g = gesture.current
    return g ? { dx: (e.clientX - g.px) / scale, dy: (e.clientY - g.py) / scale } : null
  }

  const onElementDown = (e: ReactPointerEvent<HTMLDivElement>, el: ScreenElement): void => {
    if (tool) return // let the canvas place the new element
    e.stopPropagation()
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // a scripted pointer: moving still works while the pointer stays over the element
    }
    select(el.id)
    gesture.current = { kind: 'move', id: el.id, px: e.clientX, py: e.clientY, x0: el.x, y0: el.y, w: el.w, h: el.h }
    pauseHistory()
  }
  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>, el: ScreenElement, handle: Handle): void => {
    e.stopPropagation()
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // see above
    }
    gesture.current = { kind: 'resize', id: el.id, handle, px: e.clientX, py: e.clientY, box: { x: el.x, y: el.y, w: el.w, h: el.h } }
    pauseHistory()
  }
  const onGestureMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const g = gesture.current
    const d = toCanvas(e)
    if (!g || !d || !activeId) return
    if (g.kind === 'move') {
      const sx = snapAxis(g.x0 + d.dx, g.w, W, SNAP_PX / scale)
      const sy = snapAxis(g.y0 + d.dy, g.h, H, SNAP_PX / scale)
      setGuides({ x: sx.guide, y: sy.guide })
      store().updateElement(activeId, g.id, { x: sx.value, y: sy.value })
    } else {
      const box = resizeBox(g.box, g.handle, d.dx, d.dy)
      store().updateElement(activeId, g.id, box)
    }
  }
  const onGestureEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!gesture.current) return
    gesture.current = null
    setGuides({ x: null, y: null })
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // nothing to release
    }
    resumeHistory()
  }

  const onDragEnd = (e: DragEndEvent): void => {
    if (!active || !e.over || e.active.id === e.over.id) return
    // The list shows the front element first, so its order is the reverse of the stored one.
    const shown = [...active.elements].reverse().map((x) => x.id)
    const from = shown.indexOf(String(e.active.id))
    const to = shown.indexOf(String(e.over.id))
    if (from === -1 || to === -1) return
    const next = arrayMove(shown, from, to)
    const storedIndex = active.elements.length - 1 - next.indexOf(String(e.active.id))
    store().moveElement(active.id, String(e.active.id), storedIndex)
  }

  const uses = useMemo(() => (project && deleting ? screenUses(project, deleting) : []), [project, deleting])
  const usage = useMemo(() => (project ? findUsage(project) : null), [project])

  const backdropItems = useMemo<DropdownItem<string>[]>(() => {
    const list: DropdownItem<string>[] = [{ kind: 'item', value: '', label: 'No backdrop' }]
    for (const a of Object.values(project?.assets ?? {})) if (a.kind === 'background') list.push({ kind: 'item', value: a.id, label: a.name })
    return list
  }, [project?.assets])

  if (!project) return null

  const startRename = (id: Id): void => setRenaming(id)
  const del = (id: Id): void => {
    if (screenUses(project, id).length === 0) {
      store().deleteScreen(id)
      return
    }
    setDeleting(id)
  }

  const layers = active ? [...active.elements].reverse() : []
  const handles: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const handleSize = Math.max(6, 10 / scale)
  const backdropAsset = backdrop ? project.assets[backdrop] : undefined

  return (
    <div className="screen-designer">
      <aside className="sd-list" aria-label="Screens">
        <div className="sd-list-head">
          <h2 className="pane-title">Screens</h2>
          <Button
            icon={<Plus size={14} />}
            onClick={() => {
              const id = store().addScreen()
              useUiStore.getState().openScreen(id)
            }}
          >
            Screen
          </Button>
        </div>
        {screens.length === 0 && <p className="muted-note">No screens yet. Add one, then place images, text, buttons and hotspots on it.</p>}
        <ul className="sd-items">
          {screens.map((s) => (
            <li key={s.id} className={`sd-item ${s.id === activeId ? 'active' : ''}`}>
              {renaming === s.id ? (
                <CommitField
                  value={s.name}
                  aria-label="Screen name"
                  onCommit={(name) => {
                    store().renameScreen(s.id, name)
                    setRenaming(null)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="sd-item-name"
                  onClick={() => useUiStore.getState().openScreen(s.id)}
                  onDoubleClick={() => startRename(s.id)}
                  title="Click to open, double-click to rename"
                >
                  <LayoutPanelTop size={14} /> {s.name || 'Untitled screen'}
                  <span className="sd-item-count">{usage ? plural(usage.screens[s.id]?.length ?? 0, 'use') : ''}</span>
                </button>
              )}
              <IconButton label={`Rename ${s.name}`} onClick={() => startRename(s.id)}>
                <MousePointerClick size={14} />
              </IconButton>
              <IconButton
                label={`Duplicate ${s.name}`}
                onClick={() => {
                  const id = store().duplicateScreen(s.id)
                  if (id) useUiStore.getState().openScreen(id)
                }}
              >
                <Copy size={14} />
              </IconButton>
              <IconButton label={`Delete ${s.name}`} onClick={() => del(s.id)}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        {active && (
          <label className="sd-modal-check" title="While this screen is shown, clicks do not reach the story or the screens behind it">
            <input type="checkbox" checked={active.modal} onChange={(e) => store().updateScreen(active.id, { modal: e.target.checked })} />
            Blocks clicks behind
          </label>
        )}
      </aside>

      <section className="sd-center" aria-label="Canvas">
        {!active ? (
          <EmptyState icon={<LayoutPanelTop size={28} />} title="Screen Designer">
            Add a screen to start. Use it as the ending of a scene (every button or hotspot that leaves is an arrow on the map) or show it over the story with a Show screen block.
          </EmptyState>
        ) : (
          <>
            <div className="sd-toolbar" role="toolbar" aria-label="Elements">
              {TOOLS.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  className={`sd-tool ${tool === t.type ? 'active' : ''}`}
                  aria-pressed={tool === t.type}
                  title={`${t.label}: click here, then click the canvas to place it`}
                  onClick={() => setTool(tool === t.type ? null : t.type)}
                >
                  {t.icon} {t.label}
                </button>
              ))}
              <span className="sd-spacer" />
              <div className="sd-backdrop" title="A background you can line things up with. It is not part of the game.">
                <Dropdown
                  value={backdrop ?? ''}
                  items={backdropItems}
                  aria-label="Backdrop (editor only)"
                  placeholder="Backdrop"
                  onChange={(v) => {
                    const next = v === '' ? null : v
                    setBackdrop(next)
                    writeBackdrop(active.id, next)
                  }}
                />
              </div>
              <div className="sd-zoom">
                <Dropdown value={zoom} items={ZOOMS.map((z) => ({ kind: 'item' as const, value: z.value, label: z.label }))} aria-label="Zoom" onChange={setZoom} />
              </div>
            </div>
            <div className="sd-area" ref={area}>
              <div
                ref={canvas}
                className={`sd-canvas ${tool ? 'placing' : ''}`}
                data-testid="sd-canvas"
                style={{ width: W * scale, height: H * scale }}
                onPointerDown={(e) => {
                  if (tool) place(e.clientX, e.clientY)
                  else select(null)
                }}
              >
                <div className="sd-surface" style={{ width: W, height: H, transform: `scale(${scale})` }}>
                  {backdropAsset && dir && <img className="sd-backdrop-img" src={api.assetUrl(dir, backdropAsset.file)} alt="" draggable={false} />}
                  {active.elements.map((el) => (
                    <div
                      key={el.id}
                      className={`sd-el sd-el-${el.type} ${el.id === selectedId ? 'selected' : ''}`}
                      style={boxStyle(el)}
                      data-element-id={el.id}
                      data-element-name={el.name}
                      title={el.name}
                      onPointerDown={(e) => onElementDown(e, el)}
                      onPointerMove={onGestureMove}
                      onPointerUp={onGestureEnd}
                      onPointerCancel={onGestureEnd}
                    >
                      <ElementBody el={el} ctx={{ assets: project.assets, dir }} mode="editor" />
                    </div>
                  ))}
                  {selected &&
                    handles.map((h) => {
                      const cx = h.includes('w') ? selected.x : h.includes('e') ? selected.x + selected.w : selected.x + selected.w / 2
                      const cy = h.includes('n') ? selected.y : h.includes('s') ? selected.y + selected.h : selected.y + selected.h / 2
                      return (
                        <div
                          key={h}
                          className={`sd-handle sd-handle-${h}`}
                          data-handle={h}
                          style={{ left: cx - handleSize / 2, top: cy - handleSize / 2, width: handleSize, height: handleSize }}
                          onPointerDown={(e) => onHandleDown(e, selected, h)}
                          onPointerMove={onGestureMove}
                          onPointerUp={onGestureEnd}
                          onPointerCancel={onGestureEnd}
                        />
                      )
                    })}
                  {guides.x !== null && <div className="sd-guide sd-guide-v" data-testid="guide-x" style={{ left: guides.x }} />}
                  {guides.y !== null && <div className="sd-guide sd-guide-h" data-testid="guide-y" style={{ top: guides.y }} />}
                </div>
              </div>
            </div>
            <div className="sd-layers" aria-label="Layers">
              <h3 className="panel-heading">Layers</h3>
              <p className="muted-note">Drag to reorder (top = in front).</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={layers.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                  <ul className="sd-layer-list">
                    {layers.map((l) => (
                      <LayerRow key={l.id} el={l} selected={l.id === selectedId} onSelect={() => select(l.id)} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
              {selected && (
                <div className="sd-layer-actions">
                  <IconButton
                    label="Bring forward"
                    onClick={() => store().moveElement(active.id, selected.id, active.elements.findIndex((x) => x.id === selected.id) + 1)}
                  >
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton
                    label="Send backward"
                    onClick={() => store().moveElement(active.id, selected.id, active.elements.findIndex((x) => x.id === selected.id) - 1)}
                  >
                    <ArrowDown size={14} />
                  </IconButton>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <aside className="sd-props" aria-label="Properties">
        <h2 className="pane-title">Properties</h2>
        {active && selected ? (
          <ElementProperties screen={active} element={selected} />
        ) : (
          <p className="muted-note">
            {active
              ? `Select an element on the canvas, or pick a tool and click the canvas to place one. The canvas is ${W} by ${H} pixels, the size of your game. Arrow keys move the selected element by 1 pixel (Shift: 10), Delete removes it, Ctrl+D copies it.`
              : 'No screen is open.'}
          </p>
        )}
      </aside>

      {deleting && project.screens[deleting] && (
        <InUseModal
          title="Delete this screen?"
          message={`"${project.screens[deleting].name}" is used in ${plural(uses.length, 'place')}. Deleting it empties the screen choice in each of them.`}
          refs={uses.map((u) => ({ sceneId: u.sceneId, sceneName: u.where, description: u.kind === 'block' ? 'Show/Hide screen block' : u.kind === 'ending' ? 'Ending: screen' : `Screen "${u.where}": a Show screen action` }))}
          confirmLabel="Remove references and delete"
          onOpenScene={(id) => {
            setDeleting(null)
            useUiStore.getState().openScene(id)
          }}
          onConfirm={() => {
            store().deleteScreen(deleting, { removeReferences: true })
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

