import type { Block, Condition, Effect, Id, Project, Scene, ScreenElement } from './model'

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

/** Visit a block and every block nested inside it. Reads nested lists defensively so future block types are covered. */
function walk(blocks: unknown, fn: (b: Block) => void): void {
  if (!Array.isArray(blocks)) return
  for (const raw of blocks) {
    if (!raw || typeof raw !== 'object') continue
    const b = raw as Block
    fn(b)
    const any = raw as unknown as Record<string, unknown>
    walk(any.then, fn)
    walk(any.otherwise, fn)
    walk(any.blocks, fn)
    if (Array.isArray(any.options)) {
      for (const o of any.options) if (o && typeof o === 'object') walk((o as Record<string, unknown>).blocks, fn)
    }
  }
}

export function findUsage(project: Project): UsageIndex {
  const index: UsageIndex = { assets: {}, characters: {}, variables: {} }
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

  const sceneIds = Object.keys(project.scenes)
  for (const sceneId of sceneIds) {
    const scene: Scene = project.scenes[sceneId]
    const base = (description: string, extra: Partial<UsageRef> = {}): UsageRef => ({
      sceneId: scene.id,
      sceneName: scene.name,
      description,
      ...extra
    })

    walk(scene.blocks, (b) => {
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
    }
  }

  return index
}
