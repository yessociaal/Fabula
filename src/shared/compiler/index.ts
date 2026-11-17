import type { Id, Project, Scene } from '../model'
import { buildNameTable, sceneOrder } from '../naming'
import { scriptFilePath, usableScriptFiles } from '../scriptFiles'
import type { AssetCopy } from './assets'
import { lookupAsset, sidePath } from './assets'
import { emitBlocks, indentLines } from './blocks'
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
  const statements = emitBlocks(scene.blocks, ctx).map((text) => indentLines(text))
  const ending = emitEnding(scene.ending, ctx)
  if (ending !== null) statements.push(ending)
  return [`label ${ctx.names.sceneLabels[scene.id]}:`, ...statements].join('\n\n')
}

export function compileProject(project: Project): CompileResult {
  const names = buildNameTable(project)
  const ctx: CompileContext = {
    project,
    names,
    knownVariables: new Set(Object.values(names.variableRefs)),
    copies: new Map<string, AssetCopy>(),
    usesAmbient: false
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
    const tag = names.characters[id]
    const parts = [pythonString(c.name)]
    if (c.mode === 'nvl') parts.push('kind=nvl')
    parts.push(`color=${pythonString(c.color)}`)
    const side = lookupAsset(project, c.sideAssetId)
    const sideTo = side ? sidePath(side, tag) : null
    if (side && sideTo !== null) {
      ctx.copies.set(sideTo, { assetId: side.id, from: side.file, to: sideTo })
      parts.push(`image=${pythonString(tag)}`)
    }
    characterLines.push(`define ${tag} = Character(${parts.join(', ')})`)
  }
  if (project.characterOrder.some((id) => project.characters[id]?.mode === 'nvl')) {
    characterLines.push('define narrator = nvl_narrator')
  }
  if (characterLines.length > 0) scriptSections.push({ text: characterLines.join('\n') })
  const variableLines: string[] = []
  for (const id of project.variableOrder) {
    const v = project.variables[id]
    if (!v) continue
    variableLines.push(`default ${names.variableRefs[id]} = ${pythonValue(v.defaultValue)}`)
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

  if (ctx.usesAmbient) {
    groups[0].sections.unshift({ text: 'init python:\n    renpy.music.register_channel("ambient", "sfx", loop=True)' })
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

  // Script files the author wrote: each goes out exactly as typed, under its own name.
  for (const file of usableScriptFiles(project)) files.push({ path: scriptFilePath(file.name), content: file.content })

  const assetCopies = [...ctx.copies.values()].sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0))
  return { files, assetCopies, sceneLocations }
}
