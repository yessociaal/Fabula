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
  CoreBlockType,
  CoreEndingType,
  Effect,
  Ending,
  Expression,
  Id,
  Project,
  Scene,
  Variable
} from '@shared/model'
import {
  cloneWithNewIds,
  createBlock,
  createCase,
  createChapter,
  createCharacter,
  createExpression,
  createOption,
  createScene,
  createVariable,
  defaultValueFor
} from '@shared/factory'
import { listExits, setExitTarget as setExitTargetOn } from '@shared/edges'

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

  addScene(position: Position, name?: string): Id
  renameScene(sceneId: Id, name: string): void
  moveScenes(positions: Record<Id, Position>): void
  deleteScenes(ids: Id[]): void
  duplicateScene(sceneId: Id): Id | null
  /** Add scenes made by `pasteScenes` (they already have fresh ids). One undo step. Returns their ids. */
  addScenes(scenes: Scene[]): Id[]
  setStartScene(sceneId: Id | null): void
  setSceneChapter(sceneId: Id, chapterId: Id | null): void

  addBlock(sceneId: Id, type: CoreBlockType, index?: number): Id | null
  updateBlock<T extends Block = Block>(sceneId: Id, blockId: Id, patch: BlockPatch<T>): void
  moveBlock(sceneId: Id, from: number, to: number): void
  deleteBlock(sceneId: Id, blockId: Id): void
  duplicateBlock(sceneId: Id, blockId: Id): Id | null

  setEnding(sceneId: Id, ending: Ending): void
  setEndingType(sceneId: Id, type: CoreEndingType): void
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

  addChapter(name?: string, color?: string): Id
  updateChapter(chapterId: Id, patch: Patch<Chapter>): void
  deleteChapter(chapterId: Id): void
}

// ---------- helpers that walk the project (blocks can nest) ----------

function walkBlocks(blocks: Block[], fn: (b: Block) => void): void {
  for (const b of blocks) {
    fn(b)
    if (b.type === 'if') {
      walkBlocks(b.then, fn)
      walkBlocks(b.otherwise, fn)
    } else if (b.type === 'inlineChoice') {
      for (const o of b.options) walkBlocks(o.blocks, fn)
    }
  }
}

function forEachBlock(project: Project, fn: (b: Block) => void): void {
  for (const s of Object.values(project.scenes)) walkBlocks(s.blocks, fn)
}

function forEachCondition(project: Project, fn: (c: Condition) => void): void {
  for (const s of Object.values(project.scenes)) {
    if (s.ending.type === 'choice') for (const o of s.ending.options) if (o.condition) fn(o.condition)
    if (s.ending.type === 'branch') for (const c of s.ending.cases) fn(c.condition)
    walkBlocks(s.blocks, (b) => {
      if (b.type === 'if') fn(b.condition)
      if (b.type === 'inlineChoice') for (const o of b.options) if (o.condition) fn(o.condition)
    })
  }
}

function forEachEffect(project: Project, fn: (e: Effect) => void): void {
  for (const s of Object.values(project.scenes)) {
    if (s.ending.type === 'choice') for (const o of s.ending.options) o.effects.forEach(fn)
    walkBlocks(s.blocks, (b) => {
      if (b.type === 'setVariable') fn(b.effect)
    })
  }
  for (const def of Object.values(project.screens)) {
    for (const el of def.elements) {
      if ('action' in el && el.action.type === 'setVariable') fn(el.action.effect)
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
              walkBlocks(scene.blocks, (b) => {
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

        // ----- blocks -----
        addBlock(sceneId, type, index) {
          if (!findScene(get().project, sceneId)) return null
          const block = createBlock(type)
          mutateScene(sceneId, (s) => {
            const at = index === undefined ? s.blocks.length : Math.max(0, Math.min(index, s.blocks.length))
            s.blocks.splice(at, 0, block)
          })
          return block.id
        },
        updateBlock(sceneId, blockId, patch) {
          mutateScene(sceneId, (s) => {
            const b = s.blocks.find((x) => x.id === blockId)
            if (b) Object.assign(b, patch)
          })
        },
        moveBlock(sceneId, from, to) {
          mutateScene(sceneId, (s) => {
            if (from < 0 || from >= s.blocks.length) return
            const [b] = s.blocks.splice(from, 1)
            s.blocks.splice(Math.max(0, Math.min(to, s.blocks.length)), 0, b)
          })
        },
        deleteBlock(sceneId, blockId) {
          mutateScene(sceneId, (s) => {
            s.blocks = s.blocks.filter((b) => b.id !== blockId)
          })
        },
        duplicateBlock(sceneId, blockId) {
          const scene = findScene(get().project, sceneId)
          const src = scene?.blocks.find((b) => b.id === blockId)
          if (!src) return null
          const copy = cloneWithNewIds(JSON.parse(JSON.stringify(src)) as Block)
          mutateScene(sceneId, (s) => {
            const at = s.blocks.findIndex((b) => b.id === blockId)
            s.blocks.splice(at + 1, 0, copy)
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
            }
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
