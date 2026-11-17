import type { Id, Project } from '../model'
import type { KitContext } from '../kits/types'
import { compileProject, type CompileResult } from './index'

/**
 * Exactly the lines one scene compiles to, taken from the compiled file it is written in: from its `label` line
 * up to the line before the blank lines that separate it from the next scene (or to the end of the file).
 * The compiler places scenes one after another with exactly two blank lines between them, and `sceneLocations`
 * says where each label starts, so the scene ends 3 lines before the next label of the same file.
 * Returns null when the scene is not part of the compiled output.
 */
export function sceneScriptFrom(result: CompileResult, sceneId: Id): { file: string; line: number; text: string } | null {
  const here = result.sceneLocations[sceneId]
  if (!here) return null
  const file = result.files.find((f) => f.path === here.file)
  if (!file) return null
  const lines = file.content.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  let nextLabelLine = Infinity
  for (const other of Object.values(result.sceneLocations)) {
    if (other.file === here.file && other.line > here.line && other.line < nextLabelLine) nextLabelLine = other.line
  }
  const lastLine = nextLabelLine === Infinity ? lines.length : nextLabelLine - 3
  return { file: here.file, line: here.line, text: lines.slice(here.line - 1, lastLine).join('\n') }
}

/** The script of one scene, compiled from the project as it is now. */
export function compileSceneScript(project: Project, sceneId: Id, context: KitContext = {}): string | null {
  return sceneScriptFrom(compileProject(project, context), sceneId)?.text ?? null
}
