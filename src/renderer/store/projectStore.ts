import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal } from 'zundo'
import type {
  Asset,
  Block,
  BranchCase,
  Chapter,
  Character,
  ChoiceOption,
  Condition,
  CreatableBlockType,
  SwitchableEndingType,
  Effect,
  Ending,
  Expression,
  Id,
  Project,
  Scene,
  ScreenAction,
  ScreenDef,
  ScreenElement,
  ScreenElementPatch,
  ScreenElementType,
  Variable
} from '@shared/model'
import {
  cloneWithNewIds,
  createBlock,
  createCase,
  createChapter,
  createCharacter,
  createExpression,
  createNamedExit,
  createOption,
  createScene,
  createScreen,
  createScreenAction,
  createScreenElement,
  createVariable,
  defaultValueFor,
  newId
} from '@shared/factory'
import { nextScriptFileName, scriptFileNameProblem } from '@shared/scriptFiles'
import { freeElementName, screenUses, syncScreenTargets, type ScreenUse } from '@shared/screens'
import { createKitBlock, createKitEnding } from '@shared/factory'
import { defaultParams } from '@shared/kits/fields'
import { syncKitExits } from '@shared/kits/exits'
import { findBlockDef, findEndingDef, findKit } from '@shared/kits/types'
import { scenesUsingKit } from '@shared/kits/usage'
import { useKitStore } from './kitStore'
import { listExits, setExitTarget as setExitTargetOn } from '@shared/edges'
import {
  DEPTH_ERROR,
  blockHeight,
  containersEqual,
  findBlockPath,
  fitsDepth,
  getBlockAt,
  isInsidePath,
  resolveList,
  splitPath,
  walkBlocks,
  type BlockPath
} from '@shared/blockTree'

/** What a script file action reports: the file's id, or the reason it was refused (shown as a message next to the name). */
export type ScriptFileResult = { ok: true; id: Id } | { ok: false; error: string }

/** What deleting a screen reports: done, or refused because something still uses it (the places are listed). */
export type DeleteScreenResult = { ok: true } | { ok: false; uses: ScreenUse[] }

/** What a block action reports: the new block's id (when there is one), or a message the UI shows as a toast. */
export type BlockResult = { ok: true; id: Id | null } | { ok: false; error: string }

type Position = { x: number; y: number }
type Patch<T> = Partial<Omit<T, 'id'>>
type BlockPatch<T extends Block> = Partial<Omit<T, 'id' | 'type'>>

export interface ProjectState {
  dir: string | null
  project: Project | null
  dirty: boolean

  loadProject(dir: string | null, project: Project): void
  markSaved(): void
  updateMeta(patch: Partial<Project['meta']>): void
  /** Link (or unlink) the Ren'Py game this story exports into. */
  setRenpyProjectDir(dir: string | null): void
  /** Look & Feel: remember a value (keyed by the Ren'Py define name; for a font or picture, the id of the asset), so it can be applied again to a new game. */
  setLookValue(key: string, value: string): void
  /** Look & Feel: forget a value. */
  resetLookValue(key: string): void

  addScene(position: Position, name?: string): Id
  renameScene(sceneId: Id, name: string): void
  moveScenes(positions: Record<Id, Position>): void
  deleteScenes(ids: Id[]): void
  duplicateScene(sceneId: Id): Id | null
  /** Add scenes made by `pasteScenes` (they already have fresh ids). One undo step. Returns their ids. */
  addScenes(scenes: Scene[]): Id[]
  setStartScene(sceneId: Id | null): void
  setSceneChapter(sceneId: Id, chapterId: Id | null): void
  /** Normal scene, or the splash screen shown before the main menu. */
  setSceneRole(sceneId: Id, role: Scene['role']): void
  /** Lock the exported label to exactly this text, or pass null to go back to the automatic one. The text is not checked here: see `labelLockProblem`. */
  setLabelLock(sceneId: Id, label: string | null): void

  /**
   * Add a block. `at` is an index in the scene's own list, or a block path (see blockTree.ts) whose last step is the
   * insertion index and whose earlier steps (each with `in`) lead to the list to insert into. Returns null when
   * refused (no such scene or list, or nested deeper than MAX_BLOCK_DEPTH); `addBlockAt` says why.
   */
  addBlock(sceneId: Id, type: CreatableBlockType, at?: number | BlockPath): Id | null
  addBlockAt(sceneId: Id, type: CreatableBlockType, at: BlockPath): BlockResult
  /** Add a block of a kit (its form starts with the manifest defaults). Refused when the kit or block type is not available. */
  addKitBlockAt(sceneId: Id, kitId: string, blockType: string, at: BlockPath): BlockResult
  /** Turn a kit on or off for this story. Turning it off while a block or ending uses it is refused, and the scenes that use it are returned. */
  setKitEnabled(kitId: string, enabled: boolean): { ok: true } | { ok: false; scenes: { id: Id; name: string }[] }
  /**
   * Save the form values of a kit block (`blockId`) or of the scene's kit ending (`null`). For an ending the exits are
   * brought in line with the list the manifest names: new items get an exit, removed items lose theirs, the others keep their targets.
   */
  setKitParams(sceneId: Id, blockId: Id | null, params: Record<string, unknown>): void
  /** Switch the scene's ending to a kit ending. The first target of the old ending moves to the first exit when there is one. */
  setKitEnding(sceneId: Id, kitId: string, endingType: string): void
  /** Blocks are found by id at any depth. */
  updateBlock<T extends Block = Block>(sceneId: Id, blockId: Id, patch: BlockPatch<T>): void
  /**
   * Move a block, as one undo step. Numbers are indices in the scene's own list and `to` is the index the block ends up at.
   * With paths, `from` addresses the block and `to` is an insertion position: its last step is the index to insert before,
   * counted in the list as it is BEFORE the block is taken out; its earlier steps (each with `in`) lead to the destination list.
   * Refused when the block would end up inside itself or nested deeper than MAX_BLOCK_DEPTH.
   */
  moveBlock(sceneId: Id, from: number | BlockPath, to: number | BlockPath): BlockResult
  /** Deletes the block and everything inside it. */
  deleteBlock(sceneId: Id, blockId: Id): void
  /** The copy (with fresh ids all the way down) goes right after the original, in the same list. */
  duplicateBlock(sceneId: Id, blockId: Id): Id | null

  setEnding(sceneId: Id, ending: Ending): void
  /**
   * Switch how a scene ends. The first exit that has a target is kept: jump -> code makes one exit called "next" with the old target
   * (and starts the code with `jump @exit(next)`); code -> anything else keeps the first exit's target.
   */
  setEndingType(sceneId: Id, type: SwitchableEndingType): void
  /** The text of a code ending, stored exactly as typed. */
  setEndingCode(sceneId: Id, code: string): void
  /** Add a named exit to a code ending (a free name like "exit_2"). Returns its id. */
  addExit(sceneId: Id): Id | null
  updateExit(sceneId: Id, exitId: Id, patch: { name?: string }): void
  deleteExit(sceneId: Id, exitId: Id): void
  addOption(sceneId: Id): Id | null
  updateOption(sceneId: Id, optionId: Id, patch: Patch<ChoiceOption>): void
  moveOption(sceneId: Id, from: number, to: number): void
  deleteOption(sceneId: Id, optionId: Id): void
  addCase(sceneId: Id): Id | null
  updateCase(sceneId: Id, caseId: Id, patch: Patch<BranchCase>): void
  deleteCase(sceneId: Id, caseId: Id): void
  setExitTarget(sceneId: Id, exitId: string, targetId: Id | null): void

  addCharacter(init?: Partial<Omit<Character, 'id'>>): Id
  updateCharacter(characterId: Id, patch: Patch<Character>): void
  deleteCharacter(characterId: Id): void
  addExpression(characterId: Id, name?: string, assetId?: Id | null): Id | null
  updateExpression(characterId: Id, expressionId: Id, patch: Patch<Expression>): void
  deleteExpression(characterId: Id, expressionId: Id): void

  addVariable(init?: Partial<Omit<Variable, 'id'>>): Id
  updateVariable(variableId: Id, patch: Patch<Variable>): void
  /** Change a variable's type: resets its starting value and every value that was compared with or assigned to it. */
  changeVariableType(variableId: Id, type: Variable['type']): void
  deleteVariable(variableId: Id): void

  addAsset(asset: Asset): Id
  renameAsset(assetId: Id, name: string): void
  /** Swap the file behind an asset while keeping its id (and so every place that uses it). */
  replaceAssetFile(assetId: Id, patch: Pick<Asset, 'file' | 'width' | 'height' | 'bytes'>): void
  deleteAsset(assetId: Id): void

  /** Script files: extra .rpy files written by hand and exported unchanged. A name that is not allowed is refused with the reason. */
  addScriptFile(name?: string, content?: string): ScriptFileResult
  renameScriptFile(fileId: Id, name: string): ScriptFileResult
  /** The text is stored exactly as typed. */
  updateScriptFile(fileId: Id, content: string): void
  deleteScriptFile(fileId: Id): void

  /** Screens made in the Screen Designer. Every action below is one undo step. */
  addScreen(name?: string): Id
  renameScreen(screenId: Id, name: string): void
  /** Change the screen's own settings (its name, "Blocks clicks behind"). */
  updateScreen(screenId: Id, patch: Partial<Pick<ScreenDef, 'name' | 'modal'>>): void
  /** A copy with fresh ids, named "<name> copy", placed after the original. Returns its id. */
  duplicateScreen(screenId: Id): Id | null
  /**
   * Delete a screen. Refused (with the list of what uses it: Show/Hide screen blocks, screen endings, "Show screen" actions) unless
   * `removeReferences` is true, which empties every one of those first.
   */
  deleteScreen(screenId: Id, options?: { removeReferences?: boolean }): DeleteScreenResult
  /** Add an element of this type with its top-left corner at (x, y). It gets a unique readable name ("button 1"). Returns its id. */
  addElement(screenId: Id, type: ScreenElementType, x: number, y: number): Id | null
  /** Change an element: position, size, or the properties of its type. The id and the type stay. Screen endings keep their targets in step. */
  updateElement(screenId: Id, elementId: Id, patch: ScreenElementPatch): void
  /** Change what an element does when clicked (the action must fit the element: image, text and bar have none). */
  setElementAction(screenId: Id, elementId: Id, action: ScreenAction | ScreenAction['type']): void
  /** Layer order: `toIndex` is the element's new position in the list (the last element is in front). */
  moveElement(screenId: Id, elementId: Id, toIndex: number): void
  deleteElement(screenId: Id, elementId: Id): void
  /** The copy goes right above the original, 20 pixels down and right, named "<name> copy". Returns its id. */
  duplicateElement(screenId: Id, elementId: Id): Id | null
  /** Pick the screen of a screen ending. Targets are kept for elements the new screen shares and start empty for the others. */
  setEndingScreen(sceneId: Id, screenId: Id | null): void
  /** Where one leaving element of a scene's screen ending leads (null clears it). */
  setScreenElementTarget(sceneId: Id, elementId: Id, targetId: Id | null): void

  addChapter(name?: string, color?: string): Id
  updateChapter(chapterId: Id, patch: Patch<Chapter>): void
  deleteChapter(chapterId: Id): void
}

// ---------- helpers that walk the project (blocks can nest) ----------

function eachBlock(blocks: Block[], fn: (b: Block) => void): void {
  walkBlocks(blocks, (b) => {
    fn(b)
  })
}

function forEachBlock(project: Project, fn: (b: Block) => void): void {
  for (const s of Object.values(project.scenes)) eachBlock(s.blocks, fn)
}

function forEachCondition(project: Project, fn: (c: Condition) => void): void {
  for (const s of Object.values(project.scenes)) {
    if (s.ending.type === 'choice') for (const o of s.ending.options) if (o.condition) fn(o.condition)
    if (s.ending.type === 'branch') for (const c of s.ending.cases) fn(c.condition)
    eachBlock(s.blocks, (b) => {
      if (b.type === 'if') fn(b.condition)
      if (b.type === 'inlineChoice') for (const o of b.options) if (o.condition) fn(o.condition)
    })
  }
}

function forEachEffect(project: Project, fn: (e: Effect) => void): void {
  for (const s of Object.values(project.scenes)) {
    if (s.ending.type === 'choice') for (const o of s.ending.options) o.effects.forEach(fn)
    eachBlock(s.blocks, (b) => {
      if (b.type === 'setVariable') fn(b.effect)
    })
  }
  for (const def of Object.values(project.screens)) {
    for (const el of def.elements) {
      if ('action' in el && el.action.type === 'setVariable') fn(el.action.effect)
    }
  }
}

/** After a screen changed: every scene that ends with it keeps one target per leaving element. */
function syncEndings(p: Project, screenId: Id): void {
  const def = p.screens[screenId]
  for (const scene of Object.values(p.scenes)) {
    if (scene.ending.type === 'screen' && scene.ending.screenId === screenId) {
      scene.ending.targets = syncScreenTargets(def, scene.ending.targets)
    }
  }
}

function findScene(p: Project | null, id: Id): Scene | undefined {
  return p?.scenes[id]
}

// ---------- store ----------

let loading = false

export const useProjectStore = create<ProjectState>()(
  temporal(
    immer((set, get) => {
      /** Run a mutation on the draft project and mark dirty. Returns false when no project is loaded. */
      const mutate = (fn: (p: Project) => void): void => {
        set((s) => {
          if (!s.project) return
          fn(s.project)
          s.dirty = true
        })
      }
      const mutateScene = (sceneId: Id, fn: (scene: Scene, p: Project) => void): void =>
        mutate((p) => {
          const scene = p.scenes[sceneId]
          if (scene) fn(scene, p)
        })

      return {
        dir: null,
        project: null,
        dirty: false,

        loadProject(dir, project) {
          loading = true
          try {
            set((s) => {
              s.dir = dir
              s.project = project
              s.dirty = false
            })
            useProjectStore.temporal.getState().clear()
          } finally {
            loading = false
          }
        },
        markSaved() {
          set((s) => {
            s.dirty = false
          })
        },
        updateMeta(patch) {
          mutate((p) => {
            Object.assign(p.meta, patch)
          })
        },
        setRenpyProjectDir(dir) {
          mutate((p) => {
            p.renpyProjectDir = dir
          })
        },
        setLookValue(key, value) {
          mutate((p) => {
            p.look[key] = value
          })
        },
        resetLookValue(key) {
          mutate((p) => {
            delete p.look[key]
          })
        },

        // ----- scenes -----
        addScene(position, name) {
          const scene = createScene(position, name)
          mutate((p) => {
            p.scenes[scene.id] = scene
          })
          return scene.id
        },
        renameScene(sceneId, name) {
          mutateScene(sceneId, (s) => {
            s.name = name
          })
        },
        moveScenes(positions) {
          mutate((p) => {
            for (const [id, pos] of Object.entries(positions)) {
              const s = p.scenes[id]
              if (s) s.position = { x: pos.x, y: pos.y }
            }
          })
        },
        deleteScenes(ids) {
          mutate((p) => {
            const gone = new Set(ids)
            for (const id of ids) delete p.scenes[id]
            if (p.startSceneId && gone.has(p.startSceneId)) p.startSceneId = null
            for (const scene of Object.values(p.scenes)) {
              for (const x of listExits(scene, p)) {
                if (x.target !== null && gone.has(x.target)) setExitTargetOn(scene, x.handleId, null)
              }
              eachBlock(scene.blocks, (b) => {
                if (b.type === 'visit' && b.sceneId !== null && gone.has(b.sceneId)) b.sceneId = null
              })
            }
          })
        },
        duplicateScene(sceneId) {
          const src = findScene(get().project, sceneId)
          if (!src) return null
          const copy = cloneWithNewIds(JSON.parse(JSON.stringify(src)) as Scene)
          copy.name = `${src.name} copy`
          copy.position = { x: src.position.x + 40, y: src.position.y + 40 }
          copy.labelLock = null
          copy.role = 'normal'
          mutate((p) => {
            p.scenes[copy.id] = copy
          })
          return copy.id
        },
        addScenes(scenes) {
          mutate((p) => {
            for (const sc of scenes) p.scenes[sc.id] = JSON.parse(JSON.stringify(sc)) as Scene
          })
          return scenes.map((sc) => sc.id)
        },
        setStartScene(sceneId) {
          mutate((p) => {
            p.startSceneId = sceneId
          })
        },
        setSceneChapter(sceneId, chapterId) {
          mutateScene(sceneId, (s) => {
            s.chapterId = chapterId
          })
        },

        setSceneRole(sceneId, role) {
          mutateScene(sceneId, (s) => {
            s.role = role
          })
        },
        setLabelLock(sceneId, label) {
          mutateScene(sceneId, (s) => {
            s.labelLock = label === null || label === '' ? null : label
          })
        },

        // ----- blocks -----
        addBlock(sceneId, type, at) {
          const path: BlockPath = typeof at === 'number' ? [{ i: at }] : (at ?? [{ i: Number.MAX_SAFE_INTEGER }])
          const result = get().addBlockAt(sceneId, type, path)
          return result.ok ? result.id : null
        },
        addBlockAt(sceneId, type, at) {
          const scene = findScene(get().project, sceneId)
          if (!scene) return { ok: false, error: 'That scene no longer exists.' }
          const list = at.length === 0 ? undefined : resolveList(scene.blocks, splitPath(at).container)
          if (!list) return { ok: false, error: 'There is nowhere to put the block there.' }
          const block = createBlock(type)
          if (!fitsDepth(at.length, blockHeight(block))) return { ok: false, error: DEPTH_ERROR }
          mutateScene(sceneId, (s) => {
            const target = resolveList(s.blocks, splitPath(at).container)
            if (!target) return
            target.splice(Math.max(0, Math.min(splitPath(at).index, target.length)), 0, block)
          })
          return { ok: true, id: block.id }
        },
        addKitBlockAt(sceneId, kitId, blockType, at) {
          const scene = findScene(get().project, sceneId)
          if (!scene) return { ok: false, error: 'That scene no longer exists.' }
          const def = findBlockDef(findKit(useKitStore.getState(), kitId), blockType)
          if (!def) return { ok: false, error: 'That kit block is not available.' }
          const list = at.length === 0 ? undefined : resolveList(scene.blocks, splitPath(at).container)
          if (!list) return { ok: false, error: 'There is nowhere to put the block there.' }
          const block = createKitBlock(kitId, blockType, defaultParams(def.fields))
          if (!fitsDepth(at.length, blockHeight(block))) return { ok: false, error: DEPTH_ERROR }
          mutateScene(sceneId, (s) => {
            const target = resolveList(s.blocks, splitPath(at).container)
            if (target) target.splice(Math.max(0, Math.min(splitPath(at).index, target.length)), 0, block)
          })
          return { ok: true, id: block.id }
        },
        setKitEnabled(kitId, enabled) {
          const project = get().project
          if (!project) return { ok: true }
          if (!enabled) {
            const scenes = scenesUsingKit(project, kitId)
            if (scenes.length > 0) return { ok: false, scenes }
          }
          mutate((p) => {
            const has = p.kits.includes(kitId)
            if (enabled && !has) p.kits.push(kitId)
            if (!enabled && has) p.kits = p.kits.filter((k) => k !== kitId)
          })
          return { ok: true }
        },
        setKitParams(sceneId, blockId, params) {
          const kits = useKitStore.getState()
          mutateScene(sceneId, (s) => {
            if (blockId !== null) {
              const path = findBlockPath(s.blocks, blockId)
              const b = path ? getBlockAt(s.blocks, path) : undefined
              if (b && b.type === 'kit') b.params = params
              return
            }
            if (s.ending.type !== 'kit') return
            s.ending.params = params
            s.ending.exits = syncKitExits(s.ending, findKit(kits, s.ending.kitId))
          })
        },
        setKitEnding(sceneId, kitId, endingType) {
          const kit = findKit(useKitStore.getState(), kitId)
          const def = findEndingDef(kit, endingType)
          if (!def) return
          mutateScene(sceneId, (s, p) => {
            const target = listExits(s, p).find((x) => x.target !== null)?.target ?? null
            const ending = createKitEnding(kitId, endingType, defaultParams(def.fields))
            if (ending.type !== 'kit') return
            ending.exits = syncKitExits(ending, kit)
            if (target !== null && ending.exits.length > 0) ending.exits[0].target = target
            s.ending = ending
          })
        },
        updateBlock(sceneId, blockId, patch) {
          mutateScene(sceneId, (s) => {
            const path = findBlockPath(s.blocks, blockId)
            const b = path ? getBlockAt(s.blocks, path) : undefined
            if (b) Object.assign(b, patch)
          })
        },
        moveBlock(sceneId, from, to) {
          const scene = findScene(get().project, sceneId)
          if (!scene) return { ok: false, error: 'That scene no longer exists.' }
          let fromPath: BlockPath
          let toPath: BlockPath
          if (typeof from === 'number' && typeof to === 'number') {
            const last = scene.blocks.length - 1
            const final = Math.max(0, Math.min(to, last))
            fromPath = [{ i: from }]
            toPath = [{ i: from < final ? final + 1 : final }]
          } else if (typeof from !== 'number' && typeof to !== 'number') {
            fromPath = from
            toPath = to
          } else {
            return { ok: false, error: 'Move needs two block paths or two indexes.' }
          }
          const block = getBlockAt(scene.blocks, fromPath)
          if (!block) return { ok: false, error: 'That block no longer exists.' }
          if (toPath.length === 0) return { ok: false, error: 'There is nowhere to put the block there.' }
          if (toPath.length > fromPath.length && isInsidePath(toPath, fromPath)) {
            return { ok: false, error: "A block can't be moved into itself." }
          }
          const dest = splitPath(toPath)
          const source = splitPath(fromPath)
          const destList = resolveList(scene.blocks, dest.container)
          if (!destList) return { ok: false, error: 'There is nowhere to put the block there.' }
          if (!fitsDepth(toPath.length, blockHeight(block))) return { ok: false, error: DEPTH_ERROR }
          const sameList = containersEqual(source.container, dest.container)
          const insertion = Math.max(0, Math.min(dest.index, destList.length))
          if (sameList && (insertion === source.index || insertion === source.index + 1)) return { ok: true, id: block.id }
          mutateScene(sceneId, (s) => {
            const fromList = resolveList(s.blocks, source.container)
            const toList = resolveList(s.blocks, dest.container)
            if (!fromList || !toList) return
            const [moved] = fromList.splice(source.index, 1)
            const at = sameList && source.index < insertion ? insertion - 1 : insertion
            toList.splice(Math.max(0, Math.min(at, toList.length)), 0, moved)
          })
          return { ok: true, id: block.id }
        },
        deleteBlock(sceneId, blockId) {
          mutateScene(sceneId, (s) => {
            const path = findBlockPath(s.blocks, blockId)
            if (!path) return
            const { container, index } = splitPath(path)
            resolveList(s.blocks, container)?.splice(index, 1)
          })
        },
        duplicateBlock(sceneId, blockId) {
          const scene = findScene(get().project, sceneId)
          const path = scene ? findBlockPath(scene.blocks, blockId) : null
          const src = scene && path ? getBlockAt(scene.blocks, path) : undefined
          if (!src || !path) return null
          const copy = cloneWithNewIds(JSON.parse(JSON.stringify(src)) as Block)
          mutateScene(sceneId, (s) => {
            const { container, index } = splitPath(path)
            resolveList(s.blocks, container)?.splice(index + 1, 0, copy)
          })
          return copy.id
        },

        // ----- endings -----
        setEnding(sceneId, ending) {
          mutateScene(sceneId, (s) => {
            s.ending = ending
          })
        },
        setEndingType(sceneId, type) {
          mutateScene(sceneId, (s, p) => {
            if (s.ending.type === type) return
            const target = listExits(s, p).find((x) => x.target !== null)?.target ?? null
            switch (type) {
              case 'jump':
                s.ending = { type: 'jump', target }
                break
              case 'choice': {
                const o = createOption()
                o.target = target
                s.ending = { type: 'choice', prompt: null, options: [o] }
                break
              }
              case 'branch':
                s.ending = { type: 'branch', cases: [createCase()], elseTarget: target }
                break
              case 'end':
                s.ending = { type: 'end' }
                break
              case 'screen':
                s.ending = { type: 'screen', screenId: null, targets: {} }
                break
              case 'code': {
                const fromJump = s.ending.type === 'jump'
                if (fromJump || target !== null) {
                  s.ending = { type: 'code', code: 'jump @exit(next)', exits: [createNamedExit('next', target)] }
                } else {
                  s.ending = { type: 'code', code: '', exits: [] }
                }
                break
              }
            }
          })
        },
        setEndingCode(sceneId, code) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type === 'code') s.ending.code = code
          })
        },
        addExit(sceneId) {
          let id: Id | null = null
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'code') return
            const taken = new Set(s.ending.exits.map((x) => x.name))
            let n = s.ending.exits.length + 1
            while (taken.has(`exit_${n}`)) n++
            const exit = createNamedExit(`exit_${n}`)
            s.ending.exits.push(exit)
            id = exit.id
          })
          return id
        },
        updateExit(sceneId, exitId, patch) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'code') return
            const x = s.ending.exits.find((e) => e.id === exitId)
            if (x && patch.name !== undefined) x.name = patch.name
          })
        },
        deleteExit(sceneId, exitId) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'code') return
            s.ending.exits = s.ending.exits.filter((e) => e.id !== exitId)
          })
        },
        addOption(sceneId) {
          const o = createOption()
          let ok = false
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'choice') return
            s.ending.options.push(o)
            ok = true
          })
          return ok ? o.id : null
        },
        updateOption(sceneId, optionId, patch) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'choice') return
            const o = s.ending.options.find((x) => x.id === optionId)
            if (o) Object.assign(o, patch)
          })
        },
        moveOption(sceneId, from, to) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'choice') return
            const list = s.ending.options
            if (from < 0 || from >= list.length) return
            const [o] = list.splice(from, 1)
            list.splice(Math.max(0, Math.min(to, list.length)), 0, o)
          })
        },
        deleteOption(sceneId, optionId) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'choice') return
            s.ending.options = s.ending.options.filter((o) => o.id !== optionId)
          })
        },
        addCase(sceneId) {
          const c = createCase()
          let ok = false
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'branch') return
            s.ending.cases.push(c)
            ok = true
          })
          return ok ? c.id : null
        },
        updateCase(sceneId, caseId, patch) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'branch') return
            const c = s.ending.cases.find((x) => x.id === caseId)
            if (c) Object.assign(c, patch)
          })
        },
        deleteCase(sceneId, caseId) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type !== 'branch') return
            s.ending.cases = s.ending.cases.filter((c) => c.id !== caseId)
          })
        },
        setExitTarget(sceneId, exitId, targetId) {
          mutateScene(sceneId, (s) => {
            setExitTargetOn(s, exitId, targetId)
          })
        },

        // ----- characters -----
        addCharacter(init) {
          const c = { ...createCharacter(), ...init }
          mutate((p) => {
            p.characters[c.id] = c
            p.characterOrder.push(c.id)
          })
          return c.id
        },
        updateCharacter(characterId, patch) {
          mutate((p) => {
            const c = p.characters[characterId]
            if (c) Object.assign(c, patch)
          })
        },
        deleteCharacter(characterId) {
          mutate((p) => {
            const c = p.characters[characterId]
            if (!c) return
            const exprIds = new Set(c.expressions.map((e) => e.id))
            forEachBlock(p, (b) => {
              if ((b.type === 'say' || b.type === 'show' || b.type === 'hide') && b.characterId === characterId) {
                b.characterId = null
                if (b.type === 'show') b.expressionId = null
              }
              if (b.type === 'show' && b.expressionId && exprIds.has(b.expressionId)) b.expressionId = null
              if (b.type === 'inlineChoice' && b.prompt?.characterId === characterId) b.prompt.characterId = null
            })
            for (const s of Object.values(p.scenes)) {
              if (s.ending.type === 'choice' && s.ending.prompt?.characterId === characterId) {
                s.ending.prompt.characterId = null
              }
            }
            delete p.characters[characterId]
            p.characterOrder = p.characterOrder.filter((id) => id !== characterId)
          })
        },
        addExpression(characterId, name, assetId) {
          const e = createExpression(name, assetId ?? null)
          let ok = false
          mutate((p) => {
            const c = p.characters[characterId]
            if (!c) return
            c.expressions.push(e)
            ok = true
          })
          return ok ? e.id : null
        },
        updateExpression(characterId, expressionId, patch) {
          mutate((p) => {
            const e = p.characters[characterId]?.expressions.find((x) => x.id === expressionId)
            if (e) Object.assign(e, patch)
          })
        },
        deleteExpression(characterId, expressionId) {
          mutate((p) => {
            const c = p.characters[characterId]
            if (!c) return
            c.expressions = c.expressions.filter((e) => e.id !== expressionId)
            forEachBlock(p, (b) => {
              if (b.type === 'show' && b.expressionId === expressionId) b.expressionId = null
            })
          })
        },

        // ----- variables -----
        addVariable(init) {
          const v = { ...createVariable(), ...init }
          if (init?.type && init.defaultValue === undefined) v.defaultValue = defaultValueFor(init.type)
          mutate((p) => {
            p.variables[v.id] = v
            p.variableOrder.push(v.id)
          })
          return v.id
        },
        updateVariable(variableId, patch) {
          mutate((p) => {
            const v = p.variables[variableId]
            if (!v) return
            Object.assign(v, patch)
            if (patch.type && patch.type !== undefined && patch.defaultValue === undefined) {
              v.defaultValue = defaultValueFor(v.type)
            }
          })
        },
        changeVariableType(variableId, type) {
          mutate((p) => {
            const v = p.variables[variableId]
            if (!v || v.type === type) return
            v.type = type
            v.defaultValue = defaultValueFor(type)
            forEachCondition(p, (c) => {
              for (const cl of c.clauses) {
                if (cl.variableId !== variableId) continue
                cl.value = defaultValueFor(type)
                if (type !== 'number' && cl.op !== 'eq' && cl.op !== 'neq') cl.op = 'eq'
              }
            })
            forEachEffect(p, (e) => {
              if (e.variableId !== variableId) return
              e.value = defaultValueFor(type)
              if (type === 'boolean' && (e.op === 'add' || e.op === 'subtract')) e.op = 'set'
              if (type === 'number' && e.op === 'toggle') e.op = 'set'
              if (type === 'text' && e.op !== 'set') e.op = 'set'
            })
          })
        },
        deleteVariable(variableId) {
          mutate((p) => {
            forEachCondition(p, (c) => {
              for (const cl of c.clauses) if (cl.variableId === variableId) cl.variableId = null
            })
            forEachEffect(p, (e) => {
              if (e.variableId === variableId) e.variableId = null
            })
            forEachBlock(p, (b) => {
              if (b.type === 'ask' && b.variableId === variableId) b.variableId = null
            })
            for (const def of Object.values(p.screens)) {
              for (const el of def.elements) {
                if (el.type === 'bar' && el.variableId === variableId) el.variableId = null
              }
            }
            delete p.variables[variableId]
            p.variableOrder = p.variableOrder.filter((id) => id !== variableId)
          })
        },

        // ----- assets -----
        addAsset(asset) {
          mutate((p) => {
            p.assets[asset.id] = asset
          })
          return asset.id
        },
        renameAsset(assetId, name) {
          mutate((p) => {
            const a = p.assets[assetId]
            if (a) a.name = name
          })
        },
        replaceAssetFile(assetId, patch) {
          mutate((p) => {
            const a = p.assets[assetId]
            if (!a) return
            a.file = patch.file
            a.width = patch.width
            a.height = patch.height
            a.bytes = patch.bytes
          })
        },
        deleteAsset(assetId) {
          mutate((p) => {
            forEachBlock(p, (b) => {
              if (
                (b.type === 'background' ||
                  b.type === 'playMusic' ||
                  b.type === 'playSound' ||
                  b.type === 'movie') &&
                b.assetId === assetId
              ) {
                b.assetId = null
              }
              if (b.type === 'say' && b.voiceAssetId === assetId) b.voiceAssetId = null
            })
            for (const c of Object.values(p.characters)) {
              if (c.sideAssetId === assetId) c.sideAssetId = null
              for (const e of c.expressions) if (e.assetId === assetId) e.assetId = null
            }
            for (const def of Object.values(p.screens)) {
              for (const el of def.elements) {
                if (el.type === 'image' && el.assetId === assetId) el.assetId = null
                if (el.type === 'text' && el.fontAssetId === assetId) el.fontAssetId = null
                if (el.type === 'imageButton') {
                  if (el.idleAssetId === assetId) el.idleAssetId = null
                  if (el.hoverAssetId === assetId) el.hoverAssetId = null
                }
              }
            }
            delete p.assets[assetId]
          })
        },

        // ----- script files -----
        addScriptFile(name, content = '') {
          const project = get().project
          if (!project) return { ok: false, error: 'No story is open.' }
          const wanted = name === undefined ? nextScriptFileName(project) : name.trim()
          const problem = scriptFileNameProblem(project, wanted)
          if (problem !== null) return { ok: false, error: problem }
          const id = newId()
          mutate((p) => {
            p.scriptFiles.push({ id, name: wanted, content })
          })
          return { ok: true, id }
        },
        renameScriptFile(fileId, name) {
          const project = get().project
          if (!project || !project.scriptFiles.some((f) => f.id === fileId)) return { ok: false, error: 'That file no longer exists.' }
          const wanted = name.trim()
          const problem = scriptFileNameProblem(project, wanted, fileId)
          if (problem !== null) return { ok: false, error: problem }
          mutate((p) => {
            const f = p.scriptFiles.find((x) => x.id === fileId)
            if (f) f.name = wanted
          })
          return { ok: true, id: fileId }
        },
        updateScriptFile(fileId, content) {
          mutate((p) => {
            const f = p.scriptFiles.find((x) => x.id === fileId)
            if (f) f.content = content
          })
        },
        deleteScriptFile(fileId) {
          mutate((p) => {
            p.scriptFiles = p.scriptFiles.filter((f) => f.id !== fileId)
          })
        },

        // ----- screens -----
        addScreen(name) {
          const taken = new Set(Object.values(get().project?.screens ?? {}).map((s) => s.name.trim().toLowerCase()))
          let label = name ?? 'New screen'
          for (let n = 2; taken.has(label.trim().toLowerCase()); n++) label = `${name ?? 'New screen'} ${n}`
          const def = createScreen(label)
          mutate((p) => {
            p.screens[def.id] = def
            p.screenOrder.push(def.id)
          })
          return def.id
        },
        renameScreen(screenId, name) {
          mutate((p) => {
            const def = p.screens[screenId]
            if (def) def.name = name
          })
        },
        updateScreen(screenId, patch) {
          mutate((p) => {
            const def = p.screens[screenId]
            if (!def) return
            if (patch.name !== undefined) def.name = patch.name
            if (patch.modal !== undefined) def.modal = patch.modal
          })
        },
        duplicateScreen(screenId) {
          const src = get().project?.screens[screenId]
          if (!src) return null
          const copy = cloneWithNewIds(JSON.parse(JSON.stringify(src)) as ScreenDef)
          const taken = new Set(Object.values(get().project?.screens ?? {}).map((s) => s.name.trim().toLowerCase()))
          let label = `${src.name} copy`
          for (let n = 2; taken.has(label.trim().toLowerCase()); n++) label = `${src.name} copy ${n}`
          copy.name = label
          mutate((p) => {
            p.screens[copy.id] = copy
            const at = p.screenOrder.indexOf(screenId)
            p.screenOrder.splice(at === -1 ? p.screenOrder.length : at + 1, 0, copy.id)
          })
          return copy.id
        },
        deleteScreen(screenId, options) {
          const project = get().project
          if (!project?.screens[screenId]) return { ok: true }
          const uses = screenUses(project, screenId)
          if (uses.length > 0 && !options?.removeReferences) return { ok: false, uses }
          mutate((p) => {
            for (const scene of Object.values(p.scenes)) {
              eachBlock(scene.blocks, (b) => {
                if (b.type === 'screen' && b.screenId === screenId) b.screenId = null
              })
              if (scene.ending.type === 'screen' && scene.ending.screenId === screenId) {
                scene.ending.screenId = null
                scene.ending.targets = {}
              }
            }
            for (const def of Object.values(p.screens)) {
              for (const el of def.elements) {
                if ('action' in el && el.action.type === 'showScreen' && el.action.screenId === screenId) el.action.screenId = null
              }
            }
            delete p.screens[screenId]
            p.screenOrder = p.screenOrder.filter((id) => id !== screenId)
          })
          return { ok: true }
        },
        addElement(screenId, type, x, y) {
          const def = get().project?.screens[screenId]
          if (!def) return null
          const el = createScreenElement(type, x, y, def.elements.map((e) => e.name))
          mutate((p) => {
            p.screens[screenId]?.elements.push(el)
            syncEndings(p, screenId)
          })
          return el.id
        },
        updateElement(screenId, elementId, patch) {
          mutate((p) => {
            const el = p.screens[screenId]?.elements.find((e) => e.id === elementId)
            if (!el) return
            const { ...rest } = patch as Record<string, unknown>
            delete rest.id
            delete rest.type
            for (const [key, value] of Object.entries(rest)) {
              if (key in el || key === 'action') (el as unknown as Record<string, unknown>)[key] = value
            }
            syncEndings(p, screenId)
          })
        },
        setElementAction(screenId, elementId, action) {
          const next = typeof action === 'string' ? createScreenAction(action) : action
          mutate((p) => {
            const el = p.screens[screenId]?.elements.find((e) => e.id === elementId)
            if (!el || !('action' in el)) return
            el.action = next
            syncEndings(p, screenId)
          })
        },
        moveElement(screenId, elementId, toIndex) {
          mutate((p) => {
            const list = p.screens[screenId]?.elements
            if (!list) return
            const from = list.findIndex((e) => e.id === elementId)
            if (from === -1) return
            const [el] = list.splice(from, 1)
            list.splice(Math.max(0, Math.min(toIndex, list.length)), 0, el)
          })
        },
        deleteElement(screenId, elementId) {
          mutate((p) => {
            const def = p.screens[screenId]
            if (!def) return
            def.elements = def.elements.filter((e) => e.id !== elementId)
            syncEndings(p, screenId)
          })
        },
        duplicateElement(screenId, elementId) {
          const def = get().project?.screens[screenId]
          const src = def?.elements.find((e) => e.id === elementId)
          if (!def || !src) return null
          const copy = cloneWithNewIds(JSON.parse(JSON.stringify(src)) as ScreenElement)
          copy.name = freeElementName(def, `${src.name} copy`)
          copy.x = src.x + 20
          copy.y = src.y + 20
          mutate((p) => {
            const list = p.screens[screenId]?.elements
            if (!list) return
            const at = list.findIndex((e) => e.id === elementId)
            list.splice(at + 1, 0, copy)
            syncEndings(p, screenId)
          })
          return copy.id
        },
        setEndingScreen(sceneId, screenId) {
          mutateScene(sceneId, (s, p) => {
            if (s.ending.type !== 'screen') return
            s.ending.screenId = screenId
            s.ending.targets = syncScreenTargets(screenId === null ? undefined : p.screens[screenId], s.ending.targets)
          })
        },
        setScreenElementTarget(sceneId, elementId, targetId) {
          mutateScene(sceneId, (s) => {
            if (s.ending.type === 'screen') s.ending.targets[elementId] = targetId
          })
        },

        // ----- chapters -----
        addChapter(name, color) {
          const c = createChapter(name, color)
          mutate((p) => {
            p.chapters[c.id] = c
            p.chapterOrder.push(c.id)
          })
          return c.id
        },
        updateChapter(chapterId, patch) {
          mutate((p) => {
            const c = p.chapters[chapterId]
            if (c) Object.assign(c, patch)
          })
        },
        deleteChapter(chapterId) {
          mutate((p) => {
            for (const s of Object.values(p.scenes)) if (s.chapterId === chapterId) s.chapterId = null
            delete p.chapters[chapterId]
            p.chapterOrder = p.chapterOrder.filter((id) => id !== chapterId)
          })
        }
      }
    }),
    {
      limit: 100,
      partialize: (s) => ({ project: s.project }),
      equality: (a, b) => a.project === b.project
    }
  )
)

// Undo/redo changes the project without going through an action: keep `dirty` honest.
useProjectStore.subscribe((state, prev) => {
  if (loading || state.project === prev.project || state.dirty) return
  useProjectStore.setState({ dirty: true })
})

// ---------- undo grouping for drags ----------

let pausedAt: Project | null | undefined

/** Call when a drag starts: changes until resumeHistory() are collapsed into one undo step. */
export function pauseHistory(): void {
  if (pausedAt !== undefined) return
  pausedAt = useProjectStore.getState().project
  useProjectStore.temporal.getState().pause()
}

/** Call when the drag ends. Records a single undo step if anything changed. */
export function resumeHistory(): void {
  if (pausedAt === undefined) return
  const before = pausedAt
  pausedAt = undefined
  const temporalStore = useProjectStore.temporal
  temporalStore.getState().resume()
  const now = useProjectStore.getState().project
  if (before !== now) {
    const { pastStates } = temporalStore.getState()
    temporalStore.setState({ pastStates: [...pastStates, { project: before }].slice(-100), futureStates: [] })
  }
}

export const undo = (): void => useProjectStore.temporal.getState().undo()
export const redo = (): void => useProjectStore.temporal.getState().redo()
