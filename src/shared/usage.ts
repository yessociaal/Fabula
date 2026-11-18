import { walkBlocks } from './blockTree'
import type { Condition, Effect, Id, Project, Scene, ScreenElement } from './model'
import { findBlockDef, findEndingDef, findKit, type KitContext, type KitField } from './kits/types'
import { kitRefs } from './kits/usage'

/** One place where an asset, character or variable is used. */
export interface UsageRef {
  /** null when the use is not inside a scene (a character's expression, a screen element). */
  sceneId: Id | null
  sceneName: string
  blockId?: Id
  optionId?: Id
  caseId?: Id
  /** Short plain-English description, e.g. `Dialogue line "Hello"` or `Choice "Open it": condition`. */
  description: string
}

export interface UsageIndex {
  assets: Record<Id, UsageRef[]>
  characters: Record<Id, UsageRef[]>
  variables: Record<Id, UsageRef[]>
  /** Where each designed screen is shown, used as an ending, or opened by another screen's element. */
  screens: Record<Id, UsageRef[]>
}

export function countUsage(refs: UsageRef[] | undefined): number {
  return refs ? refs.length : 0
}

/** Distinct scenes (in first-seen order) that appear in a list of references. Non-scene references are skipped. */
export function scenesUsing(refs: UsageRef[] | undefined): { id: Id; name: string }[] {
  const seen = new Set<Id>()
  const out: { id: Id; name: string }[] = []
  for (const r of refs ?? []) {
    if (r.sceneId === null || seen.has(r.sceneId)) continue
    seen.add(r.sceneId)
    out.push({ id: r.sceneId, name: r.sceneName })
  }
  return out
}

/** References that are not inside any scene (expressions, screens, character side images). */
export function outsideScenes(refs: UsageRef[] | undefined): UsageRef[] {
  return (refs ?? []).filter((r) => r.sceneId === null)
}

const short = (text: string, max = 28): string => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * Where assets, characters and variables are used. Text typed into Ren'Py code blocks, code endings and script files
 * is NOT scanned: a variable or file that only your own code mentions still shows as unused. This is deliberate,
 * because Fabula never reads inside code you wrote.
 */
export function findUsage(project: Project, context: KitContext = {}): UsageIndex {
  const index: UsageIndex = { assets: {}, characters: {}, variables: {}, screens: {} }
  const add = (map: Record<Id, UsageRef[]>, id: Id | null | undefined, ref: UsageRef): void => {
    if (!id) return
    ;(map[id] ??= []).push(ref)
  }

  const effectUse = (e: Effect, ref: UsageRef, what: string): void => {
    add(index.variables, e.variableId, { ...ref, description: `${ref.description}: ${what}` })
  }
  const conditionUse = (c: Condition | null | undefined, ref: UsageRef): void => {
    if (!c) return
    for (const cl of c.clauses) {
      add(index.variables, cl.variableId, { ...ref, description: `${ref.description}: condition` })
    }
  }

  const kitUse = (fields: readonly KitField[] | undefined, params: Record<string, unknown>, ref: UsageRef): void => {
    if (!fields) return
    const refs = kitRefs(fields, params)
    for (const id of refs.variables) add(index.variables, id, ref)
    for (const id of refs.characters) add(index.characters, id, ref)
    for (const id of refs.assets) add(index.assets, id, ref)
  }

  const sceneIds = Object.keys(project.scenes)
  for (const sceneId of sceneIds) {
    const scene: Scene = project.scenes[sceneId]
    const base = (description: string, extra: Partial<UsageRef> = {}): UsageRef => ({
      sceneId: scene.id,
      sceneName: scene.name,
      description,
      ...extra
    })

    walkBlocks(scene.blocks, (b) => {
      const at = (description: string): UsageRef => base(description, { blockId: b.id })
      switch (b.type) {
        case 'say': {
          const ref = at(`Dialogue "${short(b.text)}"`)
          add(index.characters, b.characterId, ref)
          add(index.assets, b.voiceAssetId, at('Voice line'))
          break
        }
        case 'background':
          add(index.assets, b.assetId, at('Background block'))
          break
        case 'show': {
          add(index.characters, b.characterId, at('Show block'))
          const expr = b.characterId
            ? project.characters[b.characterId]?.expressions.find((e) => e.id === b.expressionId)
            : undefined
          add(index.assets, expr?.assetId, at(`Show block (${expr?.name ?? 'expression'})`))
          break
        }
        case 'hide':
          add(index.characters, b.characterId, at('Hide block'))
          break
        case 'playMusic':
          add(index.assets, b.assetId, at('Play music block'))
          break
        case 'playSound':
          add(index.assets, b.assetId, at('Play sound block'))
          break
        case 'movie':
          add(index.assets, b.assetId, at('Movie block'))
          break
        case 'setVariable':
          effectUse(b.effect, at('Variable block'), 'changes it')
          break
        case 'ask':
          add(index.variables, b.variableId, at('Ask the player block'))
          break
        case 'if':
          conditionUse(b.condition, at('If block'))
          break
        case 'inlineChoice':
          add(index.characters, b.prompt?.characterId, at('Choice block prompt'))
          for (const o of b.options) {
            conditionUse(o.condition, base(`Choice option "${short(o.text)}"`, { blockId: b.id, optionId: o.id }))
          }
          break
        case 'screen':
          add(index.screens, b.screenId, at(`${b.action === 'show' ? 'Show' : 'Hide'} screen block`))
          break
        case 'kit': {
          const kit = findKit(context, b.kitId)
          const def = findBlockDef(kit, b.blockType)
          kitUse(def?.fields, b.params, at(`${def?.name ?? 'Kit block'}`))
          break
        }
        default:
          break
      }
    })

    const e = scene.ending
    if (e.type === 'choice') {
      add(index.characters, e.prompt?.characterId, base('Ending: choice prompt'))
      for (const o of e.options) {
        const ref = base(`Choice "${short(o.text)}"`, { optionId: o.id })
        conditionUse(o.condition, ref)
        for (const ef of o.effects) effectUse(ef, ref, 'changes it')
      }
    } else if (e.type === 'screen') {
      add(index.screens, e.screenId, base('Ending: screen'))
    } else if (e.type === 'kit') {
      const def = findEndingDef(findKit(context, e.kitId), e.endingType)
      kitUse(def?.fields, e.params, base(`Ending: ${def?.name ?? 'kit ending'}`))
    } else if (e.type === 'branch') {
      e.cases.forEach((c, i) => {
        conditionUse(c.condition, base(`Ending: case ${i + 1}`, { caseId: c.id }))
      })
    }
  }

  for (const c of Object.values(project.characters)) {
    const out = (description: string): UsageRef => ({ sceneId: null, sceneName: '', description })
    for (const ex of c.expressions) add(index.assets, ex.assetId, out(`${c.name}: expression "${ex.name}"`))
    add(index.assets, c.sideAssetId, out(`${c.name}: side image`))
  }

  for (const def of Object.values(project.screens ?? {})) {
    const out = (description: string): UsageRef => ({ sceneId: null, sceneName: '', description })
    for (const el of def.elements as ScreenElement[]) {
      const label = `Screen "${def.name}" ${el.name}`
      if (el.type === 'image') add(index.assets, el.assetId, out(label))
      if (el.type === 'text') add(index.assets, el.fontAssetId, out(`${label}: font`))
      if (el.type === 'imageButton') {
        add(index.assets, el.idleAssetId, out(`${label}: idle image`))
        add(index.assets, el.hoverAssetId, out(`${label}: hover image`))
      }
      if (el.type === 'bar') add(index.variables, el.variableId, out(`${label}: bar`))
      if ('action' in el && el.action.type === 'setVariable') {
        add(index.variables, el.action.effect.variableId, out(`${label}: changes it`))
      }
      if ('action' in el && el.action.type === 'showScreen') add(index.screens, el.action.screenId, out(`${label}: shows it`))
    }
  }

  return index
}
