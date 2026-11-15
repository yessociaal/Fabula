import type { Id, Project, Scene } from '@shared/model'
import { listExits } from '@shared/edges'

export const CARD_WIDTH = 240
export const COLUMN_GAP = 120
export const ROW_GAP = 40

/**
 * Card height in pixels, as laid out by the CSS in storyMap.css (every part has a fixed height):
 *   header 36 + thumbnail 64 + first dialogue line 22 + block count 22 + exit list padding 8 + 26 per exit row.
 * A scene with no exit handles (End) still shows one "END" row, so the row count is never below 1.
 */
export const CARD_PARTS = { header: 36, thumbnail: 64, dialogue: 22, meta: 22, exitsPadding: 8, exitRow: 26 } as const

export function cardHeight(exitCount: number): number {
  const { header, thumbnail, dialogue, meta, exitsPadding, exitRow } = CARD_PARTS
  return header + thumbnail + dialogue + meta + exitsPadding + exitRow * Math.max(1, exitCount)
}

export function sceneCardHeight(scene: Scene, project: Project): number {
  return cardHeight(listExits(scene, project).length)
}

/** Shortest number of arrows from the start scene to each reachable scene (the start scene is 0). Empty when there is no start scene. */
export function distancesFromStart(project: Project): Map<Id, number> {
  const dist = new Map<Id, number>()
  const start = project.startSceneId
  if (!start || !project.scenes[start]) return dist
  dist.set(start, 0)
  const queue: Id[] = [start]
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]
    for (const x of listExits(project.scenes[from], project)) {
      if (x.target === null || !project.scenes[x.target] || dist.has(x.target)) continue
      dist.set(x.target, (dist.get(from) as number) + 1)
      queue.push(x.target)
    }
  }
  return dist
}

/**
 * Tidy up: left-to-right layers. Column = shortest path length from the start scene; within a column the scenes
 * keep the order in which they were first reached (exits in display order), and are stacked ROW_GAP apart using
 * their real card heights. Scenes the start scene cannot reach go in one last column, ordered by their current
 * position (y, x, id). Pure and deterministic. With no start scene every scene is "unreachable" and shares column 0.
 */
export function tidyLayout(project: Project): Record<Id, { x: number; y: number }> {
  const dist = distancesFromStart(project)
  const columns: Id[][] = []
  // Reached scenes in breadth-first discovery order (Map keeps insertion order).
  for (const [id, d] of dist) {
    while (columns.length <= d) columns.push([])
    columns[d].push(id)
  }
  const unreachable = Object.values(project.scenes)
    .filter((s) => !dist.has(s.id))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => s.id)
  if (unreachable.length > 0) columns.push(unreachable)

  const out: Record<Id, { x: number; y: number }> = {}
  columns.forEach((ids, col) => {
    let y = 0
    for (const id of ids) {
      out[id] = { x: col * (CARD_WIDTH + COLUMN_GAP), y }
      y += sceneCardHeight(project.scenes[id], project) + ROW_GAP
    }
  })
  return out
}
