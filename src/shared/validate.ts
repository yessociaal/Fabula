import type { Block, Condition, Effect, Id, Project, Scene, StagePosition } from './model'
import { deriveEdges } from './edges'
import { labelLockProblem } from './naming'

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

  const checkBlock = (scene: Scene, block: Block, index: number): void => {
    const where = `block ${index + 1}`
    switch (block.type) {
      case 'say':
        if (block.characterId !== null) usedCharacters.add(block.characterId)
        if (block.voiceAssetId !== null && project.assets[block.voiceAssetId]?.kind === 'voice') {
          usedAssets.add(block.voiceAssetId)
        }
        if (block.text.trim() === '') {
          add({
            severity: 'warning',
            message: `${sceneOf(scene)}: a dialogue line (block ${index + 1}) is empty.`,
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
            message: `${sceneOf(scene)}: the Show block (block ${index + 1}) needs a character and an expression. Pick both.`,
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
            message: `${sceneOf(scene)}: the Show block (block ${index + 1}) uses an expression that no longer exists for ${character.name}. Pick another.`,
            sceneId: scene.id,
            blockId: block.id
          })
          break
        }
        if (expression.assetId === null || !project.assets[expression.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: ${character.name}'s expression "${expression.name}" has no image, but the Show block (block ${index + 1}) uses it. Upload an image for it.`,
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
            message: `${sceneOf(scene)}: the Play music block (block ${index + 1}) has no track. Pick a music file.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else usedAssets.add(block.assetId)
        break
      case 'playSound':
        if (block.assetId === null || !project.assets[block.assetId]) {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Play sound block (block ${index + 1}) has no sound. Pick a sound file.`,
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
            message: `${sceneOf(scene)}: the Ask the player block (block ${index + 1}) has no variable to store the answer in. Pick a text variable.`,
            sceneId: scene.id,
            blockId: block.id
          })
          break
        }
        usedVariables.add(variable.id)
        if (variable.type !== 'text') {
          add({
            severity: 'error',
            message: `${sceneOf(scene)}: the Ask the player block (block ${index + 1}) stores the answer in "${variable.name}", which is not a text variable. Pick a text variable.`,
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
            message: `${sceneOf(scene)}: the Movie block (block ${index + 1}) has no movie. Pick a movie file.`,
            sceneId: scene.id,
            blockId: block.id
          })
        } else usedAssets.add(block.assetId)
        break
      default:
        break
    }
  }

  const stageWarnings = (scene: Scene): void => {
    const onStage = new Map<Id, { expressionId: Id | null; position: StagePosition }>()
    scene.blocks.forEach((block, index) => {
      if (block.type === 'background') onStage.clear()
      else if (block.type === 'hide' && block.characterId !== null) onStage.delete(block.characterId)
      else if (block.type === 'show' && block.characterId !== null) {
        const current = onStage.get(block.characterId)
        if (current && current.expressionId === block.expressionId && current.position === block.position) {
          const name = project.characters[block.characterId]?.name ?? 'A character'
          add({
            severity: 'warning',
            message: `${sceneOf(scene)}: ${name} is already on stage in the same position and expression (block ${index + 1}).`,
            sceneId: scene.id,
            blockId: block.id
          })
        }
        onStage.set(block.characterId, { expressionId: block.expressionId, position: block.position })
      }
    })
  }

  const targetMissing = (target: Id | null): boolean => target === null || !project.scenes[target]
  let splashSeen = false

  for (const scene of Object.values(project.scenes)) {
    scene.blocks.forEach((block, i) => checkBlock(scene, block, i))
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
    }
  }

  if (startOk) {
    const reachable = new Set<Id>([project.startSceneId as Id])
    const edges = deriveEdges(project)
    const queue: Id[] = [project.startSceneId as Id]
    while (queue.length > 0) {
      const from = queue.shift() as Id
      for (const edge of edges) {
        if (edge.source === from && !reachable.has(edge.target)) {
          reachable.add(edge.target)
          queue.push(edge.target)
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
