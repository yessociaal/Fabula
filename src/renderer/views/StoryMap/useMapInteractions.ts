import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  MarkerType,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type OnBeforeDelete
} from '@xyflow/react'
import type { Id, Project } from '@shared/model'
import { deriveEdges } from '@shared/edges'
import { copyScenes, pasteScenes } from '@shared/sceneClipboard'
import { validateProject } from '@shared/validate'
import { toast } from '../../components/Toast'
import { pauseHistory, resumeHistory, useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { distancesFromStart, sceneCardHeight, tidyLayout, CARD_WIDTH } from './layout'
import { ARROW_LABEL_MAX, countArrowsInto, matchingSceneIds, nextChapter, truncate } from './mapModel'
import { useMapUi } from './mapUi'
import type { SceneFlowNode, SceneNodeData } from './SceneNode'

export const EDGE_COLOR = '#7d8599'

export type MapMenu =
  | { kind: 'node'; x: number; y: number; sceneId: Id }
  | { kind: 'pane'; x: number; y: number; flow: { x: number; y: number } }

interface SceneProblems {
  errors: number
  warnings: number
  text: string
}

function problemsByScene(project: Project): Map<Id, SceneProblems> {
  const out = new Map<Id, SceneProblems>()
  const messages = new Map<Id, string[]>()
  for (const p of validateProject(project)) {
    if (!p.sceneId) continue
    const cur = out.get(p.sceneId) ?? { errors: 0, warnings: 0, text: '' }
    if (p.severity === 'error') cur.errors++
    else cur.warnings++
    out.set(p.sceneId, cur)
    messages.set(p.sceneId, [...(messages.get(p.sceneId) ?? []), p.message])
  }
  for (const [id, cur] of out) {
    const list = messages.get(id) ?? []
    cur.text = list.slice(0, 3).join('\n') + (list.length > 3 ? `\n…and ${list.length - 3} more` : '')
  }
  return out
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function pointOf(event: MouseEvent | TouchEvent): { x: number; y: number } {
  if ('changedTouches' in event && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
  }
  const m = event as MouseEvent
  return { x: m.clientX, y: m.clientY }
}

/** What is under the pointer when a drag from an exit dot is released: a card, the empty canvas, or something else (toolbar, minimap). */
function dropTarget(event: MouseEvent | TouchEvent): { kind: 'node'; id: Id } | { kind: 'canvas' } | { kind: 'other' } {
  const { x, y } = pointOf(event)
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  if (!el) return { kind: 'other' }
  const node = el.closest<HTMLElement>('.react-flow__node')
  if (node?.dataset.id) return { kind: 'node', id: node.dataset.id }
  if (el.closest('.react-flow__panel, .react-flow__minimap')) return { kind: 'other' }
  return el.closest('.react-flow') ? { kind: 'canvas' } : { kind: 'other' }
}

export function useMapInteractions(wrapperRef: RefObject<HTMLDivElement | null>, searchRef: RefObject<HTMLInputElement | null>) {
  const rf = useReactFlow()
  const project = useProjectStore((s) => s.project) as Project
  const selectedNodeIds = useUiStore((s) => s.selectedNodeIds)
  const query = useMapUi((s) => s.query)
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<MapMenu | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Id[] | null>(null)
  // React Flow reports each card's measured size; keep it so the minimap and fit-view know the card sizes.
  const [measured, setMeasured] = useState<Record<Id, { width: number; height: number }>>({})

  // ----- derived view data (memoised; edges are never stored) -----
  const problems = useMemo(() => problemsByScene(project), [project])
  const distances = useMemo(() => distancesFromStart(project), [project])
  const matches = useMemo(() => matchingSceneIds(project, query), [project, query])
  const baseEdges = useMemo(() => deriveEdges(project), [project])

  const dataCache = useRef(new Map<Id, SceneNodeData>())
  const nodes = useMemo<SceneFlowNode[]>(() => {
    const selected = new Set(selectedNodeIds)
    const matchSet = new Set(matches)
    const searching = query.trim() !== ''
    const cache = dataCache.current
    return Object.values(project.scenes).map((scene) => {
      const pr = problems.get(scene.id)
      const next: SceneNodeData = {
        sceneId: scene.id,
        dimmed: searching && !matchSet.has(scene.id),
        match: searching && matchSet.has(scene.id),
        unreachable: project.startSceneId !== null && !distances.has(scene.id),
        errors: pr?.errors ?? 0,
        warnings: pr?.warnings ?? 0,
        problemText: pr?.text ?? ''
      }
      const prev = cache.get(scene.id)
      const same = prev && (Object.keys(next) as (keyof SceneNodeData)[]).every((k) => prev[k] === next[k])
      const data = same ? prev : next
      cache.set(scene.id, data)
      return { id: scene.id, type: 'scene', position: scene.position, data, selected: selected.has(scene.id), measured: measured[scene.id] }
    })
  }, [project, problems, distances, matches, query, selectedNodeIds, measured])

  const edges = useMemo<Edge[]>(() => {
    const selected = new Set(selectedEdgeIds)
    return baseEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.handle,
      targetHandle: 'in',
      type: 'smoothstep',
      label: e.handle.startsWith('opt:') || e.handle.startsWith('x:') ? truncate(e.label, ARROW_LABEL_MAX) : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR },
      style: e.conditional ? { strokeDasharray: '6 4' } : undefined,
      className: e.conditional ? 'edge-conditional' : undefined,
      reconnectable: 'target',
      selected: selected.has(e.id)
    }))
  }, [baseEdges, selectedEdgeIds])

  // ----- store actions -----
  const S = useProjectStore.getState

  const setTarget = useCallback((sceneId: Id, handleId: string, target: Id | null) => {
    useProjectStore.getState().setExitTarget(sceneId, handleId, target)
  }, [])

  const select = useCallback((ids: Id[]) => useUiStore.getState().setSelectedNodes(ids), [])

  const flowPointOf = useCallback(
    (clientX: number, clientY: number) => rf.screenToFlowPosition({ x: clientX, y: clientY }),
    [rf]
  )

  const addSceneAt = useCallback(
    (position: { x: number; y: number }) => {
      const id = S().addScene(position)
      select([id])
      return id
    },
    [S, select]
  )

  const centerPoint = useCallback(() => {
    const r = wrapperRef.current?.getBoundingClientRect()
    return r ? flowPointOf(r.left + r.width / 2, r.top + r.height / 2) : { x: 0, y: 0 }
  }, [flowPointOf, wrapperRef])

  const addSceneInView = useCallback(() => {
    const c = centerPoint()
    addSceneAt({ x: Math.round(c.x - CARD_WIDTH / 2), y: Math.round(c.y - 90) })
  }, [addSceneAt, centerPoint])

  const addChapter = useCallback(() => {
    const p = S().project
    if (!p) return
    const { name, color } = nextChapter(p)
    S().addChapter(name, color)
    toast(`${name} added. Use a card's right-click menu to move scenes into it.`)
  }, [S])

  const tidy = useCallback(() => {
    const p = S().project
    if (!p) return
    S().moveScenes(tidyLayout(p))
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 300 }))
  }, [S, rf])

  const requestDelete = useCallback((ids: Id[]) => {
    if (ids.length > 0) setPendingDelete(ids)
  }, [])

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return
    S().deleteScenes(pendingDelete)
    select([])
    setPendingDelete(null)
  }, [S, pendingDelete, select])

  const deleteSummary = useMemo(() => {
    if (!pendingDelete) return null
    return { count: pendingDelete.length, arrows: countArrowsInto(project, pendingDelete) }
  }, [pendingDelete, project])

  const copySelection = useCallback(() => {
    const p = S().project
    const ids = useUiStore.getState().selectedNodeIds
    if (!p || ids.length === 0) return false
    const clip = copyScenes(p, ids)
    if (clip.scenes.length === 0) return false
    useMapUi.getState().setClipboard(clip)
    toast(clip.scenes.length === 1 ? 'Copied 1 scene' : `Copied ${clip.scenes.length} scenes`)
    return true
  }, [S])

  const paste = useCallback(() => {
    const clip = useMapUi.getState().clipboard
    const p = S().project
    if (!clip || !p) return
    const offset = useMapUi.getState().nextPasteOffset()
    const scenes = pasteScenes(clip, { x: offset, y: offset }, new Set(p.chapterOrder))
    select(S().addScenes(scenes))
  }, [S, select])

  const focusMatch = useCallback(
    (step: 1 | -1) => {
      const p = S().project
      if (!p) return
      const ids = matchingSceneIds(p, useMapUi.getState().query)
      if (ids.length === 0) return
      const n = ids.length
      // matchIndex is the index of the NEXT match; going back means two before it.
      const base = useMapUi.getState().matchIndex + (step === 1 ? 0 : -2)
      const i = ((base % n) + n) % n
      const scene = p.scenes[ids[i]]
      useMapUi.getState().setMatchIndex(i + 1)
      rf.setCenter(scene.position.x + CARD_WIDTH / 2, scene.position.y + sceneCardHeight(scene, p) / 2, {
        zoom: Math.max(rf.getZoom(), 0.8),
        duration: 300
      })
    },
    [S, rf]
  )

  // ----- React Flow handlers -----
  const onNodesChange = useCallback(
    (changes: NodeChange<SceneFlowNode>[]) => {
      const moves: Record<Id, { x: number; y: number }> = {}
      let selection: Set<Id> | null = null
      const sizes: Record<Id, { width: number; height: number }> = {}
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) sizes[c.id] = { width: c.dimensions.width, height: c.dimensions.height }
        else if (c.type === 'position' && c.position) moves[c.id] = { x: Math.round(c.position.x), y: Math.round(c.position.y) }
        else if (c.type === 'select') {
          selection ??= new Set(useUiStore.getState().selectedNodeIds)
          if (c.selected) selection.add(c.id)
          else selection.delete(c.id)
        }
      }
      if (Object.keys(sizes).length > 0) {
        setMeasured((cur) => {
          const changed = Object.entries(sizes).filter(([id, d]) => cur[id]?.width !== d.width || cur[id]?.height !== d.height)
          return changed.length === 0 ? cur : { ...cur, ...Object.fromEntries(changed) }
        })
      }
      if (Object.keys(moves).length > 0) S().moveScenes(moves)
      if (selection) select([...selection])
    },
    [S, select]
  )

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdgeIds((cur) => {
      let next: Set<string> | null = null
      for (const c of changes) {
        if (c.type !== 'select') continue
        next ??= new Set(cur)
        if (c.selected) next.add(c.id)
        else next.delete(c.id)
      }
      return next ? [...next] : cur
    })
  }, [])

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.sourceHandle && c.target) setTarget(c.source, c.sourceHandle, c.target)
    },
    [setTarget]
  )

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      if (state.isValid || !state.fromNode || !state.fromHandle?.id) return
      const from = state.fromNode.id
      const handleId = state.fromHandle.id
      const drop = dropTarget(event)
      if (drop.kind === 'node') {
        setTarget(from, handleId, drop.id)
      } else if (drop.kind === 'canvas') {
        const { x, y } = pointOf(event)
        const at = flowPointOf(x, y)
        // new scene + connection = one undo step
        pauseHistory()
        try {
          const id = S().addScene({ x: Math.round(at.x), y: Math.round(at.y - 20) })
          S().setExitTarget(from, handleId, id)
          select([id])
        } finally {
          resumeHistory()
        }
      }
    },
    [S, flowPointOf, select, setTarget]
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, c: Connection) => {
      if (oldEdge.sourceHandle && c.target) setTarget(oldEdge.source, oldEdge.sourceHandle, c.target)
    },
    [setTarget]
  )

  const onReconnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, edge: Edge, _type: unknown, state: FinalConnectionState) => {
      if (state.isValid || !edge.sourceHandle) return
      const drop = dropTarget(event)
      if (drop.kind === 'node') setTarget(edge.source, edge.sourceHandle, drop.id)
    },
    [setTarget]
  )

  const onBeforeDelete = useCallback<OnBeforeDelete<SceneFlowNode, Edge>>(
    async ({ nodes: doomed, edges: doomedEdges }) => {
      if (doomed.length > 0) {
        requestDelete(doomed.map((n) => n.id))
      } else if (doomedEdges.length > 0) {
        pauseHistory()
        try {
          for (const e of doomedEdges) if (e.sourceHandle) S().setExitTarget(e.source, e.sourceHandle, null)
        } finally {
          resumeHistory()
        }
        setSelectedEdgeIds([])
      }
      return false
    },
    [S, requestDelete]
  )

  const onNodeDragStart = useCallback(() => pauseHistory(), [])
  const onNodeDragStop = useCallback(() => resumeHistory(), [])

  const openScene = useCallback((id: Id) => useUiStore.getState().openScene(id), [])

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: Id }) => {
      event.preventDefault()
      if (!useUiStore.getState().selectedNodeIds.includes(node.id)) select([node.id])
      setMenu({ kind: 'node', x: event.clientX, y: event.clientY, sceneId: node.id })
    },
    [select]
  )

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
      setMenu({ kind: 'pane', x: event.clientX, y: event.clientY, flow: flowPointOf(event.clientX, event.clientY) })
    },
    [flowPointOf]
  )

  /** Double-click on the empty canvas creates a scene there. */
  const onDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const el = event.target as HTMLElement
      if (!el.classList.contains('react-flow__pane')) return
      const at = flowPointOf(event.clientX, event.clientY)
      addSceneAt({ x: Math.round(at.x - CARD_WIDTH / 2), y: Math.round(at.y - 20) })
    },
    [addSceneAt, flowPointOf]
  )

  // ----- keyboard: copy, paste, search -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (isTyping(e.target)) return
      if (document.querySelector('.modal-backdrop')) return
      if (k === 'c') {
        if (copySelection()) e.preventDefault()
      } else if (k === 'v') {
        if (useMapUi.getState().clipboard) {
          e.preventDefault()
          paste()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, paste, searchRef])

  return {
    nodes,
    edges,
    matchCount: matches.length,
    menu,
    closeMenu: useCallback(() => setMenu(null), []),
    pendingDelete: deleteSummary,
    cancelDelete: useCallback(() => setPendingDelete(null), []),
    confirmDelete,
    requestDelete,
    addSceneAt,
    addSceneInView,
    addChapter,
    tidy,
    paste,
    focusMatch,
    openScene,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectEnd,
    onReconnect,
    onReconnectEnd,
    onBeforeDelete,
    onNodeDragStart,
    onNodeDragStop,
    onNodeContextMenu,
    onPaneContextMenu,
    onDoubleClick,
    select
  }
}
