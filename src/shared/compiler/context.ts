import type { Project } from '../model'
import type { KitContext } from '../kits/types'
import { buildNameTable } from '../naming'
import type { AssetCopy } from './assets'
import type { CompileContext } from './blocks'

/** The state the emit functions share for one compile (or one validation pass that renders kit templates). */
export function createCompileContext(project: Project, context: KitContext = {}): CompileContext {
  const names = buildNameTable(project)
  return {
    project,
    names,
    knownVariables: new Set(Object.values(names.variableRefs)),
    copies: new Map<string, AssetCopy>(),
    usesAmbient: false,
    kits: context.kits ?? [],
    sceneLabel: ''
  }
}
