import type { Block, Condition, Effect, Id, Project, Scene, StagePosition } from './model'
import { MAX_BLOCK_DEPTH, walkBlocks, type BlockPath } from './blockTree'
import { findCodeRefs, mentionsLeaving } from './codeRefs'
import { sceneSuccessors } from './edges'
import { labelLockProblem } from './naming'
import { scriptFileProblems } from './scriptFiles'

export interface Problem {
  severity: 'error' | 'warning'
  message: string
  sceneId?: Id
  blockId?: Id
  exitId?: string
}

const TYPE_WORD = { boolean: 'true/false', number: 'number', text: 'text' } as const

function valueMatches(type: 'boolean' | 'number' | 'text', value: unknown): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'number') return typeof value === 'number'
  return typeof value === 'string'
}

export function validateProject(project: Project): Problem[] {
  const problems: Problem[] = []
  const add = (p: Problem): void => {
    problems.push(p)
  }
  const sceneOf = (scene: Scene): string => `"${scene.name}"`

  const usedAssets = new Set<Id>()
  const usedCharacters = new Set<Id>()
  const usedVariables = new Set<Id>()

  const startOk = project.startSceneId !== null && project.scenes[project.startSceneId] !== undefined
  if (!startOk) {
    add({ severity: 'error', message: 'The story has no start scene. Choose which scene the game begins with.' })
  }

  for (const id of project.characterOrder) {
    const c = project.characters[id]
    if (c && c.name.trim() === '') {
      add({ severity: 'error', message: 'A character has no name. Give every character a name.' })
    }
  }
  for (const id of project.variableOrder) {
    const v = project.variables[id]
    if (v && v.name.trim() === '') {
      add({ severity: 'error', message: 'A variable has no name. Give every variable a name.' })
    }
  }

  const checkCondition = (scene: Scene, condition: Condition, where: string, blockId?: Id, exitId?: string): void => {
    for (const clause of condition.clauses) {
      const variable = clause.variableId === null ? undefined : project.variables[clause.variableId]
      if (!variable) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: ${where} has a condition with no variable picked. Choose a variable.`,
          sceneId: scene.id,
          blockId,
          exitId
        })
        continue
      }
      usedVariables.add(variable.id)
      if (!valueMatches(variable.type, clause.value)) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: ${where} compares "${variable.name}" with a value that is not a ${TYPE_WORD[variable.type]}.`,
          sceneId: scene.id,
          blockId,
          exitId
        })
      }
    }
  }

  const checkEffect = (scene: Scene, effect: Effect, where: string, blockId?: Id, exitId?: string): void => {
    const variable = effect.variableId === null ? undefined : project.variables[effect.variableId]
    if (!variable) {
      add({
        severity: 'error',
        message: `${sceneOf(scene)}: ${where} changes a variable but none is picked. Choose a variable.`,
        sceneId: scene.id,
        blockId,
        exitId
      })
      return
    }
    usedVariables.add(variable.id)
    if (effect.op === 'toggle') {
      if (variable.type !== 'boolean') {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: ${where} flips "${variable.name}", which is not a true/false variable.`,
          sceneId: scene.id,
          blockId,
          exitId
        })
      }
      return
    }
    if (effect.op === 'add' || effect.op === 'subtract') {
      if (variable.type !== 'number' || typeof effect.value !== 'number') {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: ${where} adds to or subtracts from "${variable.name}", which needs a number variable and a number.`,
          sceneId: scene.id,
          blockId,
          exitId
        })
      }
      return
    }
    if (!valueMatches(variable.type, effect.value)) {
      add({
        severity: 'error',
        message: `${sceneOf(scene)}: ${where} sets "${variable.name}" to a value that is not a ${TYPE_WORD[variable.type]}.`,
        sceneId: scene.id,
        blockId,
        exitId
      })
    }
  }

  /** `block 3`, or `block 2.1.3` for a block inside another block. */
  const labelOf = (path: BlockPath): string => `block ${path.map((s) => s.i + 1).join('.')}`

  /** scene name -> how many scenes have exactly that name */
  const sceneNameCounts = (): Map<string, number> => {
    const counts = new Map<string, number>()
    for (const s of Object.values(project.scenes)) counts.set(s.name, (counts.get(s.name) ?? 0) + 1)
    return counts
  }
  const nameCounts = sceneNameCounts()

  const checkBlock = (scene: Scene, block: Block, label: string): void => {
    const where = label
    switch (block.type) {
      case 'say':
        if (block.characterId !== null) usedCharacters.add(block.characterId)
        if (block.voiceAssetId !== null && project.assets[block.voiceAssetId]?.kind === 'voice') {
          usedAssets.add(block.voiceAssetId)
        }
        if (block.text.trim() === '') {
          add({
            severity: 'warning',
            message: `${sceneOf(scene)}: a dialogue line (${label}) is empty.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        break
      case 'background':
        if (block.assetId !== null) usedAssets.add(block.assetId)
        break
      case 'show': {
        const character = block.characterId === null ? undefined : project.characters[block.characterId]
        if (!character || block.expressionId === null) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Show block (${label}) needs a character and an expression. Pick both.`,
            sceneId: scene.id,
            blockId: block.id
          })
          break
        }
        usedCharacters.add(character.id)
        const expression = character.expressions.find((e) => e.id === block.expressionId)
        if (!expression) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Show block (${label}) uses an expression that no longer exists for ${character.name}. Pick another.`,
            sceneId: scene.id,
            blockId: block.id
          })
          break
        }
        if (expression.assetId === null || !project.assets[expression.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: ${character.name}'s expression "${expression.name}" has no image, but the Show block (${label}) uses it. Upload an image for it.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else {
          usedAssets.add(expression.assetId)
        }
        break
      }
      case 'hide':
        if (block.characterId !== null) usedCharacters.add(block.characterId)
        break
      case 'playMusic':
        if (block.assetId === null || !project.assets[block.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Play music block (${label}) has no track. Pick a music file.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else usedAssets.add(block.assetId)
        break
      case 'playSound':
        if (block.assetId === null || !project.assets[block.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Play sound block (${label}) has no sound. Pick a sound file.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else usedAssets.add(block.assetId)
        break
      case 'setVariable':
        checkEffect(scene, block.effect, `the Variable block (${where})`, block.id)
        break
      case 'ask': {
        const variable = block.variableId === null ? undefined : project.variables[block.variableId]
        if (!variable) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Ask the player block (${label}) has no variable to store the answer in. Pick a text variable.`,
            sceneId: scene.id,
            blockId: block.id
          })
          break
        }
        usedVariables.add(variable.id)
        if (variable.type !== 'text') {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Ask the player block (${label}) stores the answer in "${variable.name}", which is not a text variable. Pick a text variable.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        break
      }
      case 'movie':
        if (block.assetId === null || !project.assets[block.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Movie block (${label}) has no movie. Pick a movie file.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else usedAssets.add(block.assetId)
        break
      case 'visit': {
        const target = block.sceneId === null ? undefined : project.scenes[block.sceneId]
        if (!target) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Visit block (${label}) has no scene to visit. Pick a scene.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        break
      }
      case 'if':
        if (block.condition.clauses.length === 0) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the If block (${label}) has no condition. Add one.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else checkCondition(scene, block.condition, `the If block (${label})`, block.id)
        break
      case 'inlineChoice': {
        if (block.prompt && block.prompt.characterId !== null) usedCharacters.add(block.prompt.characterId)
        if (block.options.length === 0) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Choice block (${label}) has no options. Add at least one option.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        for (const option of block.options) {
          if (option.text.trim() === '') {
            add({
              severity: 'error',
              message: `${sceneOf(scene)}: an option of the Choice block (${label}) has no text. Type what the player sees.`,
              sceneId: scene.id,
              blockId: block.id
            })
          }
          if (option.condition) checkCondition(scene, option.condition, `an option of the Choice block (${label})`, block.id)
        }
        if (block.options.length > 0 && block.options.every((o) => o.condition !== null)) {
          add({
            severity: 'warning',
            message: `${sceneOf(scene)}: every option of the Choice block (${label}) has a condition, so the player may see no options at all.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        break
      }
      case 'code':
        for (const ref of findCodeRefs(block.code, 'scene', [...nameCounts.keys()])) {
          const count = ref.known ? (nameCounts.get(ref.name) ?? 0) : 0
          if (count === 1) continue
          add({
            severity: 'error',
            message: ref.known
              ? `${sceneOf(scene)}: the Ren'Py code block (${label}) mentions @scene(${ref.name}), but ${count} scenes are named "${ref.name}". Rename one so the name is unique.`
              : `${sceneOf(scene)}: the Ren'Py code block (${label}) mentions @scene(${ref.name}), but no scene has that name. Use the exact name of a scene.`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        break
      default:
        break
    }
  }

  type OnStage = Map<Id, { expressionId: Id | null; position: StagePosition }>
  /** Walks a list in order. Each branch of a container starts from the stage as it was on entering; after a container nothing is assumed. */
  const stageWarnings = (scene: Scene): void => {
    const walkList = (list: Block[], onStage: OnStage, prefix: BlockPath): void => {
      list.forEach((block, index) => {
        if (block.type === 'background') onStage.clear()
        else if (block.type === 'hide' && block.characterId !== null) onStage.delete(block.characterId)
        else if (block.type === 'show' && block.characterId !== null) {
          const current = onStage.get(block.characterId)
          if (current && current.expressionId === block.expressionId && current.position === block.position) {
            const name = project.characters[block.characterId]?.name ?? 'A character'
            add({
              severity: 'warning',
              message: `${sceneOf(scene)}: ${name} is already on stage in the same position and expression (${labelOf([...prefix, { i: index }])}).`,
              sceneId: scene.id,
              blockId: block.id
            })
          }
          onStage.set(block.characterId, { expressionId: block.expressionId, position: block.position })
        } else if (block.type === 'if') {
          walkList(block.then, new Map(onStage), [...prefix, { i: index, in: 'then' }])
          walkList(block.otherwise, new Map(onStage), [...prefix, { i: index, in: 'otherwise' }])
          onStage.clear()
        } else if (block.type === 'inlineChoice') {
          for (const o of block.options) walkList(o.blocks, new Map(onStage), [...prefix, { i: index, in: `opt:${o.id}` }])
          onStage.clear()
        }
      })
    }
    walkList(scene.blocks, new Map(), [])
  }

  const targetMissing = (target: Id | null): boolean => target === null || !project.scenes[target]
  let splashSeen = false

  for (const scene of Object.values(project.scenes)) {
    walkBlocks(scene.blocks, (block, info) => {
      checkBlock(scene, block, labelOf(info.path))
      if (info.depth === MAX_BLOCK_DEPTH + 1) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: a block (${labelOf(info.path)}) is nested more than ${MAX_BLOCK_DEPTH} levels deep. Move it out of its containers.`,
          sceneId: scene.id,
          blockId: block.id
        })
      }
    })
    stageWarnings(scene)
    if (scene.blocks.length === 0) {
      add({ severity: 'warning', message: `${sceneOf(scene)}: this scene has no blocks.`, sceneId: scene.id })
    }

    if (scene.labelLock !== null && scene.id !== project.startSceneId) {
      const why = labelLockProblem(project, scene.id, scene.labelLock)
      if (why !== null) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: the locked label "${scene.labelLock}" can't be used. ${why}`,
          sceneId: scene.id
        })
      }
    } else if (scene.labelLock !== null) {
      add({
        severity: 'warning',
        message: `${sceneOf(scene)}: this is the start scene, so its label is always "start". The locked label is ignored.`,
        sceneId: scene.id
      })
    }
    if (scene.role === 'splashscreen') {
      if (scene.id === project.startSceneId) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: the start scene can't also be the splash screen. Choose another start scene or set this scene's role back to Normal.`,
          sceneId: scene.id
        })
      }
      if (scene.ending.type !== 'end') {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: a splash screen scene must finish with "End of story" (that is what hands over to the main menu). Change its ending.`,
          sceneId: scene.id
        })
      }
      if (!splashSeen) splashSeen = true
      else {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: only one scene can be the splash screen. Set this scene's role back to Normal.`,
          sceneId: scene.id
        })
      }
    }

    const e = scene.ending
    if (e.type === 'jump') {
      if (targetMissing(e.target)) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: "Then" doesn't lead anywhere. Drag its dot to a scene.`,
          sceneId: scene.id,
          exitId: 'jump'
        })
      }
    } else if (e.type === 'choice') {
      if (e.prompt && e.prompt.characterId !== null) usedCharacters.add(e.prompt.characterId)
      if (e.options.length === 0) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: the choice has no options. Add at least one option.`,
          sceneId: scene.id
        })
      }
      for (const option of e.options) {
        const label = option.text.trim() === '' ? 'an option' : `the choice "${option.text}"`
        if (option.text.trim() === '') {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: an option has no text. Type what the player sees.`,
            sceneId: scene.id,
            exitId: `opt:${option.id}`
          })
        }
        if (targetMissing(option.target)) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: ${label} doesn't lead anywhere. Drag its dot to a scene.`,
            sceneId: scene.id,
            exitId: `opt:${option.id}`
          })
        }
        if (option.condition) {
          checkCondition(scene, option.condition, label, undefined, `opt:${option.id}`)
        }
        option.effects.forEach((effect) =>
          checkEffect(scene, effect, label, undefined, `opt:${option.id}`)
        )
      }
      if (e.options.length > 0 && e.options.every((o) => o.condition !== null)) {
        add({
          severity: 'warning',
          message: `${sceneOf(scene)}: every option of the choice has a condition, so the player may see no options at all.`,
          sceneId: scene.id
        })
      }
    } else if (e.type === 'branch') {
      if (e.cases.length === 0) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: the "If" ending has no cases. Add a case or choose another ending.`,
          sceneId: scene.id
        })
      }
      e.cases.forEach((c, i) => {
        if (targetMissing(c.target)) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: case ${i + 1} doesn't lead anywhere. Drag its dot to a scene.`,
            sceneId: scene.id,
            exitId: `case:${c.id}`
          })
        }
        checkCondition(scene, c.condition, `case ${i + 1}`, undefined, `case:${c.id}`)
      })
      if (targetMissing(e.elseTarget)) {
        add({
          severity: 'error',
          message: `${sceneOf(scene)}: "Otherwise" doesn't lead anywhere. Drag its dot to a scene.`,
          sceneId: scene.id,
          exitId: 'else'
        })
      }
    } else if (e.type === 'code') {
      const exitCounts = new Map<string, number>()
      for (const x of e.exits) exitCounts.set(x.name, (exitCounts.get(x.name) ?? 0) + 1)
      const written = new Set<string>()
      for (const ref of findCodeRefs(e.code, 'exit', [...exitCounts.keys()])) {
        if (ref.known) written.add(ref.name)
        else {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the code of the ending uses @exit(${ref.name}), but the ending has no exit with that name. Add an exit called "${ref.name}" or fix the name.`,
            sceneId: scene.id
          })
        }
      }
      const reported = new Set<string>()
      for (const x of e.exits) {
        const exitId = `x:${x.id}`
        if (x.name.trim() === '') {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: an exit of the code ending has no name. Give it a name, or delete it.`,
            sceneId: scene.id,
            exitId
          })
        } else if ((exitCounts.get(x.name) ?? 0) > 1) {
          if (!reported.has(x.name)) {
            reported.add(x.name)
            add({
              severity: 'error',
              message: `${sceneOf(scene)}: two exits of the code ending are both called "${x.name}". Give each exit its own name.`,
              sceneId: scene.id,
              exitId
            })
          }
        } else if (!written.has(x.name)) {
          add({
            severity: 'warning',
            message: `${sceneOf(scene)}: the exit "${x.name}" is never used in the code of the ending, so nothing will follow its arrow. Use @exit(${x.name}) in the code or delete the exit.`,
            sceneId: scene.id,
            exitId
          })
        }
        if (targetMissing(x.target)) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the exit ${x.name.trim() === '' ? 'of the code ending' : `"${x.name}"`} doesn't lead anywhere. Drag its dot to a scene.`,
            sceneId: scene.id,
            exitId
          })
        }
      }
      if (e.exits.length === 0 && !mentionsLeaving(e.code)) {
        add({
          severity: 'warning',
          message: `${sceneOf(scene)}: the code of the ending has no exits and no return or jump, so this scene might fall through into whatever comes next.`,
          sceneId: scene.id
        })
      }
    }
  }

  for (const { file, message } of scriptFileProblems(project)) {
    add({ severity: 'error', message: `The script file "${file.name.trim() === '' ? '(no name)' : file.name}" can't be exported: ${message}` })
  }

  const visits = new Map<Id, Id[]>()
  for (const scene of Object.values(project.scenes)) {
    const targets: Id[] = []
    walkBlocks(scene.blocks, (b) => {
      if (b.type === 'visit' && b.sceneId !== null && project.scenes[b.sceneId]) targets.push(b.sceneId)
    })
    visits.set(scene.id, targets)
  }
  const visitReaches = (from: Id, goal: Id): boolean => {
    const seen = new Set<Id>()
    const stack = [...(visits.get(from) ?? [])]
    while (stack.length > 0) {
      const at = stack.pop() as Id
      if (at === goal) return true
      if (seen.has(at)) continue
      seen.add(at)
      stack.push(...(visits.get(at) ?? []))
    }
    return false
  }
  for (const scene of Object.values(project.scenes)) {
    walkBlocks(scene.blocks, (b, info) => {
      if (b.type !== 'visit' || b.sceneId === null) return
      const target = project.scenes[b.sceneId]
      if (!target || !visitReaches(target.id, scene.id)) return
      const who = target.id === scene.id ? 'itself' : `"${target.name}", which visits "${scene.name}" again`
      add({
        severity: 'error',
        message: `${sceneOf(scene)}: the Visit block (${labelOf(info.path)}) visits ${who}, so it would never finish. Break the loop.`,
        sceneId: scene.id,
        blockId: b.id
      })
    })
  }

  const visitedBy = new Map<Id, Scene[]>()
  for (const scene of Object.values(project.scenes)) {
    for (const target of visits.get(scene.id) ?? []) {
      const list = visitedBy.get(target) ?? []
      if (!list.includes(scene)) list.push(scene)
      visitedBy.set(target, list)
    }
  }
  for (const [id, visitors] of visitedBy) {
    const sub = project.scenes[id]
    if (sub.ending.type !== 'end') {
      add({
        severity: 'warning',
        message: `${sceneOf(sub)} is visited as a sub-scene but does not end the story; it will continue into whatever it points to.`,
        sceneId: sub.id
      })
    }
    if (id === project.startSceneId) {
      add({
        severity: 'warning',
        message: `${sceneOf(sub)} is the start scene and is also visited as a sub-scene by ${visitors.map(sceneOf).join(', ')}. Visit a separate scene instead.`,
        sceneId: sub.id
      })
    }
  }

  if (startOk) {
    const reachable = new Set<Id>([project.startSceneId as Id])
    const queue: Id[] = [project.startSceneId as Id]
    while (queue.length > 0) {
      const from = queue.shift() as Id
      for (const to of sceneSuccessors(project, from)) {
        if (!reachable.has(to)) {
          reachable.add(to)
          queue.push(to)
        }
      }
    }
    for (const scene of Object.values(project.scenes)) {
      if (!reachable.has(scene.id) && scene.role !== 'splashscreen') {
        add({
          severity: 'warning',
          message: `${sceneOf(scene)}: no path from the start scene leads here, so players will never see it.`,
          sceneId: scene.id
        })
      }
    }
  }

  for (const character of Object.values(project.characters)) {
    for (const expression of character.expressions) {
      if (expression.assetId !== null) usedAssets.add(expression.assetId)
    }
    if (character.sideAssetId !== null) usedAssets.add(character.sideAssetId)
  }
  for (const id of project.characterOrder) {
    const c = project.characters[id]
    if (c && !usedCharacters.has(id)) {
      add({ severity: 'warning', message: `The character "${c.name}" is never used in any scene.` })
    }
  }
  for (const id of project.variableOrder) {
    const v = project.variables[id]
    if (v && !usedVariables.has(id)) {
      add({ severity: 'warning', message: `The variable "${v.name}" is never used in any scene.` })
    }
  }
  for (const asset of Object.values(project.assets)) {
    if (!usedAssets.has(asset.id)) {
      add({ severity: 'warning', message: `The file "${asset.name}" is not used anywhere.` })
    }
  }

  return problems
}
