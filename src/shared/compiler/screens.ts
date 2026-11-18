import type { Id, ScreenAction, ScreenDef, ScreenElement } from '../model'
import { leaveElements } from '../screens'
import { fontPath, lookupAsset, screenImagePath } from './assets'
import { INDENT, sayText, useAsset, variableName } from './blocks'
import type { CompileContext } from './blocks'
import { pythonNumber, pythonString, pythonValue } from './text'

/** The Python for an action, or null when it cannot be made (the element is then left without an action). */
export function emitScreenAction(action: ScreenAction, element: ScreenElement, ctx: CompileContext): string | null {
  switch (action.type) {
    case 'leave': {
      const name = ctx.names.screenElements[element.id]
      return name === undefined ? null : `Return(${pythonString(name)})`
    }
    case 'hideThis':
      return 'Hide()'
    case 'showScreen': {
      const name = action.screenId === null ? undefined : ctx.names.screens[action.screenId]
      return name === undefined ? null : `Show(${pythonString(name)})`
    }
    case 'setVariable': {
      const e = action.effect
      const ref = variableName(ctx, e.variableId)
      if (ref === null) return null
      switch (e.op) {
        case 'set':
          return `SetVariable(${pythonString(ref)}, ${pythonValue(e.value)})`
        case 'toggle':
          return `ToggleVariable(${pythonString(ref)})`
        case 'add':
        case 'subtract':
          if (typeof e.value !== 'number') return null
          return `SetVariable(${pythonString(ref)}, ${ref} ${e.op === 'add' ? '+' : '-'} ${pythonValue(e.value)})`
      }
    }
  }
}

function withAction(parts: string[], element: ScreenElement & { action: ScreenAction }, ctx: CompileContext): string {
  const action = emitScreenAction(element.action, element, ctx)
  if (action !== null) parts.push(`action ${action}`)
  return parts.join(' ')
}

/**
 * The fills of buttons and bars are explicit. A game made with generate_gui has no gui/button or gui/bar images, and the default
 * styles of a button and a bar would fail to load them, so a designed screen never depends on them.
 */
export const BUTTON_FILL = '#3a3f4b'
export const BUTTON_HOVER_FILL = '#4a5266'
export const BAR_FILL = '#7c9cff'
export const BAR_BACK = '#262a33'

const whole = (n: number): string => pythonNumber(Math.round(n))
const at = (e: ScreenElement): string => `xpos ${whole(e.x)} ypos ${whole(e.y)}`

/** One screen statement for an element (relative to the screen's body), or null when the element cannot be made. */
export function emitScreenElement(element: ScreenElement, ctx: CompileContext): string | null {
  switch (element.type) {
    case 'image': {
      const asset = lookupAsset(ctx.project, element.assetId)
      const to = asset ? screenImagePath(asset, ctx.names) : null
      if (!asset || to === null) return null
      useAsset(ctx, asset.id, to)
      const sized = asset.width === element.w && asset.height === element.h ? '' : ` xsize ${whole(element.w)} ysize ${whole(element.h)}`
      return `add ${pythonString(to)} ${at(element)}${sized}`
    }
    case 'text': {
      const parts = [`text ${sayText(element.text, ctx)}`, at(element), `size ${whole(element.size)}`, `color ${pythonString(element.color)}`]
      const font = lookupAsset(ctx.project, element.fontAssetId)
      const fontTo = font ? fontPath(font, ctx.names) : null
      if (font && fontTo !== null) {
        useAsset(ctx, font.id, fontTo)
        parts.push(`font ${pythonString(fontTo)}`)
      }
      return parts.join(' ')
    }
    case 'button':
      return withAction(
        [
          `textbutton ${sayText(element.text, ctx)}`,
          at(element),
          `xsize ${whole(element.w)} ysize ${whole(element.h)}`,
          `background Solid(${pythonString(BUTTON_FILL)})`,
          `hover_background Solid(${pythonString(BUTTON_HOVER_FILL)})`,
          'text_xalign 0.5 text_yalign 0.5'
        ],
        element,
        ctx
      )
    case 'imageButton': {
      const idle = lookupAsset(ctx.project, element.idleAssetId)
      const idleTo = idle ? screenImagePath(idle, ctx.names) : null
      if (!idle || idleTo === null) return null
      useAsset(ctx, idle.id, idleTo)
      const parts = [`imagebutton idle ${pythonString(idleTo)}`]
      const hover = lookupAsset(ctx.project, element.hoverAssetId)
      const hoverTo = hover ? screenImagePath(hover, ctx.names) : null
      if (hover && hoverTo !== null) {
        useAsset(ctx, hover.id, hoverTo)
        parts.push(`hover ${pythonString(hoverTo)}`)
      }
      parts.push(at(element))
      return withAction(parts, element, ctx)
    }
    case 'hotspot':
      return withAction(['button', at(element), `xsize ${whole(element.w)} ysize ${whole(element.h)}`, 'background None'], element, ctx)
    case 'bar': {
      const variable = element.variableId === null ? undefined : ctx.project.variables[element.variableId]
      const ref = variableName(ctx, element.variableId)
      if (!variable || variable.type !== 'number' || ref === null) return null
      return `bar value VariableValue(${pythonString(ref)}, ${pythonNumber(element.max)}) ${at(element)} xsize ${whole(element.w)} ysize ${whole(element.h)} left_bar Solid(${pythonString(BAR_FILL)}) right_bar Solid(${pythonString(BAR_BACK)})`
    }
  }
}

/** The text of one `screen name():` statement, or null when the screen has no name in the table. */
export function emitScreen(def: ScreenDef, ctx: CompileContext): string | null {
  const name = ctx.names.screens[def.id]
  if (name === undefined) return null
  const body: string[] = []
  if (def.modal) body.push('modal True')
  for (const el of def.elements) {
    const text = emitScreenElement(el, ctx)
    if (text !== null) body.push(text)
  }
  if (body.length === 0) body.push('null')
  return [`screen ${name}():`, ...body.map((b) => `${INDENT}${b}`)].join('\n\n')
}

/** `interface.rpy`: every screen, in screenOrder, or null when the story has none. */
export function emitInterface(ctx: CompileContext): string | null {
  const screens: string[] = []
  for (const id of ctx.project.screenOrder) {
    const def = ctx.project.screens[id]
    const text = def ? emitScreen(def, ctx) : null
    if (text !== null) screens.push(text)
  }
  return screens.length === 0 ? null : `${screens.join('\n\n\n')}\n`
}

/** The statements of a screen ending: `call screen x`, then one `jump` per leaving element (a single exit is a bare `jump`). */
export function emitScreenEnding(
  screenId: Id | null,
  targets: Record<Id, Id | null>,
  ctx: CompileContext,
  jump: (target: Id | null) => string
): string {
  const def = screenId === null ? undefined : ctx.project.screens[screenId]
  const name = screenId === null ? undefined : ctx.names.screens[screenId]
  if (!def || name === undefined) return `${INDENT}return`
  const lines = [`${INDENT}call screen ${name}`]
  const leaving = leaveElements(def)
  if (leaving.length === 0) return [...lines, '', `${INDENT}return`].join('\n')
  if (leaving.length === 1) return [...lines, '', `${INDENT}${jump(targets[leaving[0].id] ?? null)}`].join('\n')
  lines.push('')
  leaving.forEach((el, i) => {
    lines.push(`${INDENT}${i === 0 ? 'if' : 'elif'} _return == ${pythonString(ctx.names.screenElements[el.id] ?? el.name)}:`)
    lines.push(`${INDENT}${INDENT}${jump(targets[el.id] ?? null)}`)
  })
  return lines.join('\n')
}
