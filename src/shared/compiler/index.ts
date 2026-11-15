import type { Id, Project, Scene } from '../model'
import { buildNameTable, sceneOrder } from '../naming'
import type { AssetCopy } from './assets'
import { emitBlock } from './blocks'
import type { CompileContext } from './blocks'
import { emitEnding } from './ending'
import { pythonString, pythonValue } from './text'

export interface CompileResult {
  files: { path: string; content: string }[]
  assetCopies: { assetId: Id; from: string; to: string }[]
  sceneLocations: Record<Id, { file: string; line: number }>
}

interface Section {
  text: string
  sceneId?: Id
}

function emitScene(scene: Scene, ctx: CompileContext): string {
  const statements: string[] = []
  for (const block of scene.blocks) {
    const line = emitBlock(block, ctx)
    if (line !== null) statements.push(`    ${line}`)
  }
  const ending = emitEnding(scene.ending, ctx)
  if (ending !== null) statements.push(ending)
  return [`label ${ctx.names.sceneLabels[scene.id]}:`, ...statements].join('\n\n')
}

export function compileProject(project: Project): CompileResult {
  const names = buildNameTable(project)
  const ctx: CompileContext = {
    project,
    names,
    knownVariables: new Set(Object.values(names.variables)),
    copies: new Map<string, AssetCopy>()
  }

  const scenes = sceneOrder(project)
  const startFirst = (list: Scene[]): Scene[] => {
    const at = list.findIndex((s) => s.id === project.startSceneId)
    return at <= 0 ? list : [list[at], ...list.slice(0, at), ...list.slice(at + 1)]
  }
  const inChapter = (s: Scene): boolean => s.chapterId !== null && names.chapterFiles[s.chapterId] !== undefined
  const groups: { file: string; sections: Section[] }[] = []

  const scriptSections: Section[] = []
  const characterLines: string[] = []
  for (const id of project.characterOrder) {
    const c = project.characters[id]
    if (!c) continue
    characterLines.push(
      `define ${names.characters[id]} = Character(${pythonString(c.name)}, color=${pythonString(c.color)})`
    )
  }
  if (characterLines.length > 0) scriptSections.push({ text: characterLines.join('\n') })
  const variableLines: string[] = []
  for (const id of project.variableOrder) {
    const v = project.variables[id]
    if (!v) continue
    variableLines.push(`default ${names.variables[id]} = ${pythonValue(v.defaultValue)}`)
  }
  if (variableLines.length > 0) scriptSections.push({ text: variableLines.join('\n') })
  for (const scene of startFirst(scenes.filter((s) => !inChapter(s)))) {
    scriptSections.push({ text: emitScene(scene, ctx), sceneId: scene.id })
  }
  groups.push({ file: 'script.rpy', sections: scriptSections })

  for (const chapterId of project.chapterOrder) {
    const file = names.chapterFiles[chapterId]
    if (file === undefined) continue
    const mine = startFirst(scenes.filter((s) => s.chapterId === chapterId))
    if (mine.length === 0) continue
    groups.push({ file, sections: mine.map((s) => ({ text: emitScene(s, ctx), sceneId: s.id })) })
  }

  const files: CompileResult['files'] = []
  const sceneLocations: CompileResult['sceneLocations'] = {}
  for (const group of groups) {
    let content = ''
    group.sections.forEach((section, i) => {
      if (i > 0) content += section.sceneId === undefined ? '\n\n' : '\n\n\n'
      if (section.sceneId !== undefined) {
        sceneLocations[section.sceneId] = { file: group.file, line: content.split('\n').length }
      }
      content += section.text
    })
    files.push({ path: group.file, content: content === '' ? '' : `${content}\n` })
  }

  const assetCopies = [...ctx.copies.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
  return { files, assetCopies, sceneLocations }
}
