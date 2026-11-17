import { countBlocks, firstSayText, walkBlocks } from '@shared/blockTree'
import type { Id, Project, Scene } from '@shared/model'
import { findEndingDef, findKit, type KitContext } from '@shared/kits/types'
import { conditionToWords } from '@shared/conditions'
import { deriveEdges, deriveVisitEdges, listExits } from '@shared/edges'

/** One row of a scene card. `handleId` is the React Flow source handle id (see listExits). */
export interface ExitRowInfo {
  handleId: string
  text: string
  /** Show the small "if" tag (conditional choice option). */
  ifTag: boolean
  /** The exit has no target yet: its dot is red. */
  unset: boolean
  /** A named exit of a code (or kit) ending: the text is the exit's name. */
  named?: true
}

export interface SceneCardInfo {
  backgroundAssetId: Id | null
  /** "Anna: You made it!" or the narration text; '' when the scene has no dialogue. */
  firstLine: string
  blockCount: number
  /** One row per exit; empty for an End scene (the card then shows "END" and has no handle). */
  exits: ExitRowInfo[]
  isEnd: boolean
  /** The scene ends with Ren'Py code: the card says so above its named exits. */
  codeEnding?: true
  /** The scene ends with a kit ending: its name, shown above the named exits. */
  kitEnding?: { name: string; icon?: string }
}

export const ARROW_LABEL_MAX = 24

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** The rows a card shows for its ending: Then / each choice (+ if tag) / each case in words + Otherwise / named exits. */
export function buildExitRows(scene: Scene, project: Project): ExitRowInfo[] {
  const varName = (id: Id): string => project.variables[id]?.name || 'a variable'
  const e = scene.ending
  return listExits(scene, project).map((x) => {
    let text = x.label
    if (x.kind === 'option') text = x.label.trim() === '' ? 'Untitled choice' : x.label
    else if (x.kind === 'named') text = x.label.trim() === '' ? 'Untitled exit' : x.label
    else if (x.kind === 'case' && e.type === 'branch') {
      const c = e.cases.find((k) => `case:${k.id}` === x.handleId)
      text = c ? conditionToWords(c.condition, varName) : x.label
    }
    return { handleId: x.handleId, text, ifTag: x.kind === 'option' && x.conditional, unset: x.target === null, ...(x.kind === 'named' ? { named: true as const } : {}) }
  })
}

export function sceneCardInfo(scene: Scene, project: Project, context: KitContext = {}): SceneCardInfo {
  let backgroundAssetId: Id | null = null
  let firstLine = ''
  let found = false
  walkBlocks(scene.blocks, (b) => {
    if (!found && b.type === 'background' && b.assetId !== null) {
      backgroundAssetId = b.assetId
      found = true
    }
  })
  walkBlocks(scene.blocks, (b) => {
    if (firstLine === '' && b.type === 'say' && b.text.trim() !== '') {
      const who = b.characterId ? project.characters[b.characterId]?.name : ''
      firstLine = `${who ? `${who}: ` : ''}${b.text.replace(/\s+/g, ' ').trim()}`
    }
  })
  const exits = buildExitRows(scene, project)
  const e = scene.ending
  const kitDef = e.type === 'kit' ? findEndingDef(findKit(context, e.kitId), e.endingType) : undefined
  const kitEnding = e.type === 'kit' ? { name: kitDef?.name ?? `Kit "${e.kitId}" is not available`, icon: kitDef?.icon } : undefined
  return { backgroundAssetId, firstLine, blockCount: countBlocks(scene.blocks), exits, isEnd: scene.ending.type === 'end', ...(scene.ending.type === 'code' ? { codeEnding: true as const } : {}), ...(kitEnding ? { kitEnding } : {}) }
}

/** Case-insensitive match on the scene name and on every dialogue line. An empty query matches nothing. */
export function sceneMatches(scene: Scene, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return false
  if (scene.name.toLowerCase().includes(q)) return true
  let hit = false
  walkBlocks(scene.blocks, (b) => {
    if (!hit && b.type === 'say' && b.text.toLowerCase().includes(q)) hit = true
  })
  return hit
}

/** Matching scene ids in a stable order (top to bottom, then left to right, then id) so Enter cycles predictably. */
export function matchingSceneIds(project: Project, query: string): Id[] {
  return Object.values(project.scenes)
    .filter((s) => sceneMatches(s, query))
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((s) => s.id)
}

/** How many arrows from scenes outside `ids` point into `ids` (they become empty exits when the scenes are deleted). */
export function countArrowsInto(project: Project, ids: readonly Id[]): number {
  const gone = new Set(ids)
  return [...deriveEdges(project), ...deriveVisitEdges(project)].filter((e) => gone.has(e.target) && !gone.has(e.source)).length
}

export const CHAPTER_PALETTE = ['#7c9cff', '#5fd08a', '#f2b84b', '#ff8a65', '#c792ea', '#4dd0e1', '#f06292', '#aed581'] as const

/** Name ("Chapter N") and colour (fixed palette, cycling) for the next chapter. */
export function nextChapter(project: Project): { name: string; color: string } {
  const n = project.chapterOrder.length
  return { name: `Chapter ${n + 1}`, color: CHAPTER_PALETTE[n % CHAPTER_PALETTE.length] }
}
