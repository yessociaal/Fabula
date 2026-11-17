import { walkBlocks } from '../blockTree'
import type { Condition, Effect, Id, Project } from '../model'
import { asCondition, asEffects, fieldValue, listItems } from './fields'
import type { KitField } from './types'

/** Everything a kit block or ending refers to through its form: picked variables, characters and assets, and the changes and conditions it holds. */
export interface KitRefs {
  variables: Id[]
  characters: Id[]
  assets: Id[]
  effects: { effect: Effect; where: string }[]
  conditions: { condition: Condition; where: string }[]
}

/** Walk the fields of a kit block or ending with its params and collect what they refer to. `where` names the field for messages. */
export function kitRefs(fields: readonly KitField[], params: Record<string, unknown>, prefix = ''): KitRefs {
  const out: KitRefs = { variables: [], characters: [], assets: [], effects: [], conditions: [] }
  for (const field of fields) {
    const value = fieldValue(field, params)
    const where = `${prefix}${field.label}`
    switch (field.type) {
      case 'variable':
        if (typeof value === 'string' && value !== '') out.variables.push(value)
        break
      case 'character':
        if (typeof value === 'string' && value !== '') out.characters.push(value)
        break
      case 'asset':
        if (typeof value === 'string' && value !== '') out.assets.push(value)
        break
      case 'effects':
        for (const effect of asEffects(value)) {
          out.effects.push({ effect, where })
          if (effect.variableId) out.variables.push(effect.variableId)
        }
        break
      case 'condition': {
        const condition = asCondition(value)
        if (condition) {
          out.conditions.push({ condition, where })
          for (const clause of condition.clauses) if (clause.variableId) out.variables.push(clause.variableId)
        }
        break
      }
      case 'list':
        for (const item of listItems(value)) {
          const inner = kitRefs(field.fields, item, `${where}: `)
          out.variables.push(...inner.variables)
          out.characters.push(...inner.characters)
          out.assets.push(...inner.assets)
          out.effects.push(...inner.effects)
          out.conditions.push(...inner.conditions)
        }
        break
      default:
        break
    }
  }
  return out
}

export interface KitUse {
  sceneId: Id
  sceneName: string
  blockId?: Id
  /** `block` or `ending` with the type, e.g. `block "print"`. */
  description: string
}

/** Every block and ending of the story that belongs to the kit `kitId`. */
export function kitUses(project: Project, kitId: string): KitUse[] {
  const uses: KitUse[] = []
  for (const scene of Object.values(project.scenes)) {
    walkBlocks(scene.blocks, (b) => {
      if (b.type === 'kit' && b.kitId === kitId) {
        uses.push({ sceneId: scene.id, sceneName: scene.name, blockId: b.id, description: `block "${b.blockType}"` })
      }
    })
    if (scene.ending.type === 'kit' && scene.ending.kitId === kitId) {
      uses.push({ sceneId: scene.id, sceneName: scene.name, description: `ending "${scene.ending.endingType}"` })
    }
  }
  return uses
}

/** The scenes that use a kit, once each, in first-seen order. Used to block turning a kit off while it is in use. */
export function scenesUsingKit(project: Project, kitId: string): { id: Id; name: string }[] {
  const seen = new Set<Id>()
  const out: { id: Id; name: string }[] = []
  for (const use of kitUses(project, kitId)) {
    if (seen.has(use.sceneId)) continue
    seen.add(use.sceneId)
    out.push({ id: use.sceneId, name: use.sceneName })
  }
  return out
}

/** Ids of every kit that at least one block or ending uses. */
export function kitsInUse(project: Project): Set<string> {
  const ids = new Set<string>()
  for (const scene of Object.values(project.scenes)) {
    walkBlocks(scene.blocks, (b) => {
      if (b.type === 'kit') ids.add(b.kitId)
    })
    if (scene.ending.type === 'kit') ids.add(scene.ending.kitId)
  }
  return ids
}
