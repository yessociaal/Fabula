import { replaceCodeRefs } from '../codeRefs'
import type { Ending, Id } from '../model'
import { conditionPython, emitEffect, indentLines, promptLine, sayText } from './blocks'
import type { CompileContext } from './blocks'

const IND = '    '

function jumpLine(target: Id | null, ctx: CompileContext): string {
  if (target === null || !ctx.project.scenes[target]) return 'return'
  const label = ctx.names.sceneLabels[target]
  return label === undefined ? 'return' : `jump ${label}`
}

/** One statement (possibly several lines, already indented) for the scene ending, or null for extended endings. */
export function emitEnding(ending: Ending, ctx: CompileContext): string | null {
  switch (ending.type) {
    case 'jump':
      return `${IND}${jumpLine(ending.target, ctx)}`
    case 'end':
      return `${IND}return`
    case 'choice': {
      if (ending.options.length === 0) return `${IND}return`
      const items: string[] = []
      if (ending.prompt) {
        const line = promptLine(ending.prompt, ctx)
        if (line !== null) items.push(`${IND}${IND}${line}`)
      }
      for (const option of ending.options) {
        const guard = option.condition ? ` if ${conditionPython(option.condition, ctx)}` : ''
        const body: string[] = []
        for (const effect of option.effects) {
          const line = emitEffect(effect, ctx)
          if (line !== null) body.push(`${IND}${IND}${IND}${line}`)
        }
        body.push(`${IND}${IND}${IND}${jumpLine(option.target, ctx)}`)
        items.push([`${IND}${IND}${sayText(option.text, ctx)}${guard}:`, ...body].join('\n'))
      }
      let out = [`${IND}menu:`, ...items].join('\n\n')
      if (ending.options.every((o) => o.condition !== null)) out += `\n\n${IND}return`
      return out
    }
    case 'branch': {
      if (ending.cases.length === 0) return `${IND}${jumpLine(ending.elseTarget, ctx)}`
      const lines: string[] = []
      ending.cases.forEach((c, i) => {
        lines.push(`${IND}${i === 0 ? 'if' : 'elif'} ${conditionPython(c.condition, ctx)}:`)
        lines.push(`${IND}${IND}${jumpLine(c.target, ctx)}`)
      })
      lines.push(`${IND}else:`)
      lines.push(`${IND}${IND}${jumpLine(ending.elseTarget, ctx)}`)
      return lines.join('\n')
    }
    case 'code': {
      if (ending.code.trim() === '') return null
      const counts = new Map<string, number>()
      for (const x of ending.exits) counts.set(x.name, (counts.get(x.name) ?? 0) + 1)
      const text = replaceCodeRefs(ending.code, 'exit', [...counts.keys()], (name) => {
        const exit = ending.exits.find((x) => x.name === name)
        const target = exit && counts.get(name) === 1 ? exit.target : null
        return target !== null && ctx.project.scenes[target] ? (ctx.names.sceneLabels[target] ?? null) : null
      })
      return indentLines(text)
    }
    default:
      return null
  }
}
