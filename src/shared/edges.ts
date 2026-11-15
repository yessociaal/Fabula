import type { Id, Project, Scene } from './model'

export interface ExitInfo {
  /** `jump`, `opt:<id>`, `case:<id>`, `else`, `x:<id>` */
  handleId: string
  kind: 'jump' | 'option' | 'case' | 'else' | 'named' | 'element'
  /** human label: option text, case index, exit name, ... (not truncated) */
  label: string
  target: Id | null
  conditional: boolean
}

export interface Edge {
  id: string
  source: Id
  handle: string
  target: Id
  label: string
  conditional: boolean
}

/** All outgoing exits of a scene's ending, in display order. Pass the project so screen endings can list their leaving elements. */
export function listExits(scene: Scene, project?: Project): ExitInfo[] {
  const e = scene.ending
  switch (e.type) {
    case 'jump':
      return [{ handleId: 'jump', kind: 'jump', label: 'Then', target: e.target, conditional: false }]
    case 'choice':
      return e.options.map((o) => ({
        handleId: `opt:${o.id}`,
        kind: 'option' as const,
        label: o.text,
        target: o.target,
        conditional: o.condition !== null
      }))
    case 'branch':
      return [
        ...e.cases.map((c, i) => ({
          handleId: `case:${c.id}`,
          kind: 'case' as const,
          label: `Case ${i + 1}`,
          target: c.target,
          conditional: true
        })),
        { handleId: 'else', kind: 'else' as const, label: 'Otherwise', target: e.elseTarget, conditional: false }
      ]
    case 'end':
      return []
    case 'code':
    case 'kit':
      return e.exits.map((x) => ({
        handleId: `x:${x.id}`,
        kind: 'named' as const,
        label: x.name,
        target: x.target,
        conditional: false
      }))
    case 'screen': {
      const def = e.screenId && project ? project.screens[e.screenId] : undefined
      const ids = def
        ? def.elements.filter((el) => 'action' in el && el.action.type === 'leave').map((el) => ({ id: el.id, name: el.name }))
        : Object.keys(e.targets).map((k) => ({ id: k, name: k }))
      return ids.map((el) => ({
        handleId: `x:${el.id}`,
        kind: 'element' as const,
        label: el.name,
        target: e.targets[el.id] ?? null,
        conditional: false
      }))
    }
  }
}

/** Edges are never stored; compute them from the project. Targets that do not exist are skipped. */
export function deriveEdges(project: Project): Edge[] {
  const edges: Edge[] = []
  for (const scene of Object.values(project.scenes)) {
    for (const x of listExits(scene, project)) {
      if (x.target === null || !project.scenes[x.target]) continue
      edges.push({
        id: `${scene.id}:${x.handleId}`,
        source: scene.id,
        handle: x.handleId,
        target: x.target,
        label: x.label,
        conditional: x.conditional
      })
    }
  }
  return edges
}

/** Mutates the scene's ending in place (safe on an immer draft). Returns false when the handle does not exist. */
export function setExitTarget(scene: Scene, handleId: string, target: Id | null): boolean {
  const e = scene.ending
  if (handleId === 'jump') {
    if (e.type !== 'jump') return false
    e.target = target
    return true
  }
  if (handleId === 'else') {
    if (e.type !== 'branch') return false
    e.elseTarget = target
    return true
  }
  if (handleId.startsWith('opt:')) {
    if (e.type !== 'choice') return false
    const o = e.options.find((x) => `opt:${x.id}` === handleId)
    if (!o) return false
    o.target = target
    return true
  }
  if (handleId.startsWith('case:')) {
    if (e.type !== 'branch') return false
    const c = e.cases.find((x) => `case:${x.id}` === handleId)
    if (!c) return false
    c.target = target
    return true
  }
  if (handleId.startsWith('x:')) {
    const key = handleId.slice(2)
    if (e.type === 'code' || e.type === 'kit') {
      const x = e.exits.find((n) => n.id === key)
      if (!x) return false
      x.target = target
      return true
    }
    if (e.type === 'screen') {
      e.targets[key] = target
      return true
    }
  }
  return false
}
