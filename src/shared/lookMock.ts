import { colourToHex6 } from './look'

/**
 * Numbers for the live mock of the dialogue box in the Look & Feel view. The mock is drawn inside a box with the game's
 * aspect ratio, so every size is a percentage of the game screen: the same sizes work at any preview width.
 */

export interface LookMockGame {
  width: number
  height: number
}

export interface DialogueMock {
  /** Height of the box as a percentage of the stage height. */
  boxHeightPct: number
  /** Where the dialogue starts inside the box: percentage of the stage width from the left, percentage of the box height from the top. */
  textLeftPct: number
  textTopPct: number
  /** The widest a line gets, as a percentage of the stage width. */
  textWidthPct: number
  nameLeftPct: number
  nameTopPct: number
  /** Font sizes as a percentage of the stage width (use with the cqw unit). */
  textSizePct: number
  nameSizePct: number
  interfaceSizePct: number
  accent: string
  idle: string
  hover: string
  text: string
  interfaceText: string
}

/** What the template's own lines say for a 1280 x 720 game, used when a value is unknown or unusable. */
export const MOCK_DEFAULTS: Record<string, string> = {
  'gui.accent_color': '#7c9cff',
  'gui.idle_color': '#888888',
  'gui.hover_color': '#b0c3ff',
  'gui.text_color': '#ffffff',
  'gui.interface_text_color': '#ffffff',
  'gui.text_size': '22',
  'gui.name_text_size': '30',
  'gui.interface_text_size': '22',
  'gui.textbox_height': '185',
  'gui.dialogue_xpos': '268',
  'gui.dialogue_ypos': '50',
  'gui.dialogue_width': '744',
  'gui.name_xpos': '240',
  'gui.name_ypos': '0'
}

/** A usable colour from the value, or the default for that key. */
export function mockColour(values: Record<string, string>, key: string): string {
  return colourToHex6(values[key] ?? '') ?? colourToHex6(MOCK_DEFAULTS[key] ?? '') ?? '#ffffff'
}

/** A finite number from the value (at least `min`), or the default for that key. */
export function mockNumber(values: Record<string, string>, key: string, min = 0): number {
  const raw = values[key]
  const n = raw !== undefined && raw.trim() !== '' ? Number(raw) : Number.NaN
  if (Number.isFinite(n) && n >= min) return n
  return Number(MOCK_DEFAULTS[key] ?? 0)
}

const pct = (part: number, whole: number): number => (whole > 0 ? (part / whole) * 100 : 0)
const round = (n: number): number => Math.round(n * 1000) / 1000

/** Everything the dialogue mock needs, from the values that would be in the game (pending value, else current value, else the template's). */
export function dialogueMock(values: Record<string, string>, game: LookMockGame): DialogueMock {
  const w = game.width
  const h = game.height
  const boxHeight = Math.min(h, mockNumber(values, 'gui.textbox_height', 1))
  return {
    boxHeightPct: round(pct(boxHeight, h)),
    textLeftPct: round(pct(mockNumber(values, 'gui.dialogue_xpos', -w), w)),
    textTopPct: round(pct(mockNumber(values, 'gui.dialogue_ypos', -h), boxHeight)),
    textWidthPct: round(pct(mockNumber(values, 'gui.dialogue_width', 1), w)),
    nameLeftPct: round(pct(mockNumber(values, 'gui.name_xpos', -w), w)),
    nameTopPct: round(pct(mockNumber(values, 'gui.name_ypos', -h), boxHeight)),
    textSizePct: round(pct(mockNumber(values, 'gui.text_size', 1), w)),
    nameSizePct: round(pct(mockNumber(values, 'gui.name_text_size', 1), w)),
    interfaceSizePct: round(pct(mockNumber(values, 'gui.interface_text_size', 1), w)),
    accent: mockColour(values, 'gui.accent_color'),
    idle: mockColour(values, 'gui.idle_color'),
    hover: mockColour(values, 'gui.hover_color'),
    text: mockColour(values, 'gui.text_color'),
    interfaceText: mockColour(values, 'gui.interface_text_color')
  }
}
