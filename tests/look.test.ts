import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LOOK_FIELDS,
  applyLookText,
  colourToHex6,
  findLookField,
  isLineField,
  lookValueProblem,
  lookValuesEqual,
  printLookToken,
  readLookText,
  type LookField
} from '../src/shared/look'

const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', 'gui', name), 'utf8')
const GUI = fixture('gui.rpy.txt')
const OPTIONS = fixture('options.rpy.txt')
const textOf = (f: LookField): string => (f.file === 'gui.rpy' ? GUI : OPTIONS)
const field = (key: string): LookField => {
  const f = findLookField(key)
  if (!f) throw new Error(`no field ${key}`)
  return f
}

/** Indexes of the lines that differ between two texts that have the same number of lines. */
function changedLines(a: string, b: string): number[] {
  const x = a.split(/\r\n|\n|\r/)
  const y = b.split(/\r\n|\n|\r/)
  expect(y.length).toBe(x.length)
  return x.flatMap((line, i) => (line === y[i] ? [] : [i]))
}

const EXPECTED: Record<string, string> = {
  'gui.accent_color': '#7c9cff',
  'gui.idle_color': '#888888',
  'gui.hover_color': '#b0c3ff',
  'gui.text_color': '#ffffff',
  'gui.interface_text_color': '#ffffff',
  'gui.text_font': 'DejaVuSans.ttf',
  'gui.name_text_font': 'DejaVuSans.ttf',
  'gui.interface_text_font': 'DejaVuSans.ttf',
  'gui.text_size': '22',
  'gui.name_text_size': '30',
  'gui.interface_text_size': '22',
  'gui.textbox_height': '185',
  'gui.dialogue_xpos': '268',
  'gui.dialogue_ypos': '50',
  'gui.dialogue_width': '744',
  'gui.name_xpos': '240',
  'gui.name_ypos': '0',
  'gui.show_name': 'True',
  'config.name': 'g',
  'config.version': '1.0',
  'gui.about': '',
  'preferences.text_cps': '0'
}

const CHANGED: Record<string, string> = {
  'gui.accent_color': '#aa3344',
  'gui.idle_color': '#112233',
  'gui.hover_color': '#ffcc00',
  'gui.text_color': '#eeeeee',
  'gui.interface_text_color': '#00ff00',
  'gui.text_font': 'fonts/my_font.ttf',
  'gui.name_text_font': 'fonts/my_font.otf',
  'gui.interface_text_font': 'fonts/other.ttf',
  'gui.text_size': '28',
  'gui.name_text_size': '36',
  'gui.interface_text_size': '24',
  'gui.textbox_height': '220',
  'gui.dialogue_xpos': '300',
  'gui.dialogue_ypos': '60',
  'gui.dialogue_width': '800',
  'gui.name_xpos': '200',
  'gui.name_ypos': '-10',
  'gui.show_name': 'False',
  'config.version': '2.1 "beta"',
  'gui.about': 'First paragraph.\n\nSecond one.',
  'preferences.text_cps': '40'
}

describe('the field table', () => {
  it('has the fields of every group in the plan', () => {
    const groups = new Set(LOOK_FIELDS.map((f) => f.group))
    expect([...groups]).toEqual(['Colours', 'Fonts', 'Dialogue box', 'Menus', 'Game'])
    const keys = LOOK_FIELDS.map((f) => f.key)
    for (const k of [
      'gui.accent_color',
      'gui.text_font',
      'gui.text_size',
      'gui.textbox_height',
      'gui.show_name',
      'config.version',
      'gui.about',
      'preferences.text_cps',
      'gui/textbox.png',
      'gui/namebox.png',
      'gui/main_menu.png',
      'gui/game_menu.png',
      'gui/window_icon.png'
    ]) {
      expect(keys, k).toContain(k)
    }
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has a line pattern for every line field, anchored to the start of the line', () => {
    for (const f of LOOK_FIELDS.filter(isLineField)) {
      expect(f.loose, f.key).toBeInstanceOf(RegExp)
      if (f.type !== 'multiline') expect(f.pattern?.source.startsWith('^'), f.key).toBe(true)
    }
    for (const f of LOOK_FIELDS.filter((x) => !isLineField(x))) expect(f.imageTarget, f.key).toMatch(/^gui\/[a-z_]+\.png$/)
  })
})

describe('every field is found exactly once in the real generated files', () => {
  for (const f of LOOK_FIELDS.filter(isLineField)) {
    it(`${f.key} reads ${JSON.stringify(EXPECTED[f.key])}`, () => {
      const text = textOf(f)
      const hits = text.split('\n').filter((l) => f.loose?.test(l))
      expect(hits.length, 'lines that start like it').toBe(1)
      if (f.pattern) expect(text.split('\n').filter((l) => f.pattern?.test(l)).length, 'lines that match it fully').toBe(1)
      const read = readLookText(f, text)
      expect(read).toEqual({ found: true, value: EXPECTED[f.key], editedByHand: false })
    })
  }

  it('does not mistake the indented small-screen variant lines for the field', () => {
    expect(GUI).toContain('        gui.textbox_height = 240')
    expect(readLookText(field('gui.textbox_height'), GUI).value).toBe('185')
  })
})

describe('replacing a value changes only that line', () => {
  for (const f of LOOK_FIELDS.filter(isLineField).filter((x) => !x.readOnly)) {
    it(`${f.key}`, () => {
      const text = textOf(f)
      const next = applyLookText(f, text, CHANGED[f.key])
      expect(next.status).toBe('applied')
      if (f.type === 'multiline') {
        // the about text spans lines: everything before its first line and after its closing line is identical
        const lines = text.split('\n')
        const out = next.text.split('\n')
        const head = lines.findIndex((l) => l.startsWith('define gui.about'))
        const end = lines.findIndex((l, i) => i > head && l === '""")')
        expect(out.slice(0, head + 1)).toEqual(lines.slice(0, head + 1))
        expect(out.slice(out.length - (lines.length - end))).toEqual(lines.slice(end))
      } else {
        const changed = changedLines(text, next.text)
        expect(changed.length).toBe(1)
        expect(text.split('\n')[changed[0]]).toMatch(f.loose as RegExp)
      }
      expect(readLookText(f, next.text).value).toBe(CHANGED[f.key])
      // writing the same value again changes nothing
      const again = applyLookText(f, next.text, CHANGED[f.key])
      expect(again.status).toBe('unchanged')
      expect(again.text).toBe(next.text)
    })
  }

  it('prints in the template style: single quotes for colours, bare numbers, True/False, double quotes for fonts and text', () => {
    expect(applyLookText(field('gui.accent_color'), GUI, '#AA3344').text).toContain("define gui.accent_color = '#aa3344'\n")
    expect(applyLookText(field('gui.text_size'), GUI, '28').text).toContain('define gui.text_size = 28\n')
    expect(applyLookText(field('gui.show_name'), OPTIONS, 'False').text).toContain('define gui.show_name = False\n')
    expect(applyLookText(field('gui.text_font'), GUI, 'fonts/a.ttf').text).toContain('define gui.text_font = "fonts/a.ttf"\n')
    expect(applyLookText(field('config.version'), OPTIONS, '2.0').text).toContain('define config.version = "2.0"\n')
    expect(applyLookText(field('preferences.text_cps'), OPTIONS, '30').text).toContain('default preferences.text_cps = 30\n')
    expect(applyLookText(field('config.version'), OPTIONS, 'say "hi"\\now').text).toContain('define config.version = "say \\"hi\\"\\\\now"\n')
  })
})

describe('quote styles and forms of the template', () => {
  it('reads and keeps the surrounding text of a double-quoted colour, a Color(...) colour and a trailing comment', () => {
    const f = field('gui.accent_color')
    expect(readLookText(f, 'define gui.accent_color = "#7C9CFF"\n').value).toBe('#7c9cff')
    expect(readLookText(f, "define gui.accent_color = Color('#7c9cff')\n").value).toBe('#7c9cff')
    expect(readLookText(f, 'define gui.accent_color = Color( "#7c9cff" )\n').value).toBe('#7c9cff')
    expect(readLookText(f, "define gui.accent_color = '#7c9cffaa'  ## note\n").value).toBe('#7c9cffaa')
    expect(readLookText(f, "define gui.accent_color = '#fa0'\n").value).toBe('#fa0')
    const out = applyLookText(f, "define gui.accent_color = '#7c9cff'  ## note\nx\n", '#000000')
    expect(out.text).toBe("define gui.accent_color = '#000000'  ## note\nx\n")
  })

  it('reads single-quoted fonts and text, and the _() wrapper of the game name', () => {
    expect(readLookText(field('gui.text_font'), "define gui.text_font = 'fonts/a b.ttf'\n").value).toBe('fonts/a b.ttf')
    expect(readLookText(field('config.version'), "define config.version = 'v\\'1'\n").value).toBe("v'1")
    expect(readLookText(field('config.name'), "define config.name = _('My game')\n").value).toBe('My game')
  })

  it('does not rewrite a line whose value already means the same thing', () => {
    const text = 'define gui.accent_color = "#7C9CFF"\n'
    const out = applyLookText(field('gui.accent_color'), text, '#7c9cff')
    expect(out.status).toBe('unchanged')
    expect(out.text).toBe(text)
    expect(lookValuesEqual(field('gui.text_size'), '22', '22.0')).toBe(true)
  })

  it('reads decimal numbers', () => {
    expect(readLookText(field('gui.dialogue_xpos'), 'define gui.dialogue_xpos = 0.5\n').value).toBe('0.5')
    expect(readLookText(field('gui.name_ypos'), 'define gui.name_ypos = -4\n').value).toBe('-4')
  })
})

describe('edited by hand, missing and invalid', () => {
  const handEdited: [string, string][] = [
    ['gui.accent_color', "define gui.accent_color = gui.something\n"],
    ['gui.accent_color', "define gui.accent_color = '#7c9cff' + '1'\n"],
    ['gui.text_size', 'define gui.text_size = 22 * 2\n'],
    ['gui.text_size', 'define gui.text_size = gui.text_size_big\n'],
    ['gui.text_font', 'define gui.text_font = gui.interface_text_font\n'],
    ['gui.show_name', 'define gui.show_name = not config.developer\n'],
    ['config.version', 'define config.version = str(5)\n'],
    ['preferences.text_cps', 'default preferences.text_cps = persistent.cps\n']
  ]
  for (const [key, line] of handEdited) {
    it(`${key}: ${line.trim()}`, () => {
      const f = field(key)
      const text = `first\n${line}last\n`
      expect(readLookText(f, text)).toEqual({ found: false, value: null, editedByHand: true })
      const out = applyLookText(f, text, CHANGED[key] ?? '1')
      expect(out.status).toBe('edited-by-hand')
      expect(out.text).toBe(text)
    })
  }

  it('a line defined twice is ambiguous and left alone', () => {
    const text = 'define gui.text_size = 22\ndefine gui.text_size = 30\n'
    expect(applyLookText(field('gui.text_size'), text, '40')).toEqual({ text, status: 'edited-by-hand' })
  })

  it('a missing line is not found, and a commented-out line does not count', () => {
    const f = field('gui.text_size')
    for (const text of ['', 'define gui.other = 1\n', '# define gui.text_size = 22\n', '    define gui.text_size = 22\n']) {
      expect(readLookText(f, text)).toEqual({ found: false, value: null, editedByHand: false })
      expect(applyLookText(f, text, '30')).toEqual({ text, status: 'not-found' })
    }
  })

  it('an unusable value is reported and nothing changes', () => {
    const cases: [string, string][] = [
      ['gui.accent_color', 'red'],
      ['gui.accent_color', '#12'],
      ['gui.text_size', 'big'],
      ['gui.text_size', '12.5'],
      ['gui.text_size', '0'],
      ['gui.textbox_height', '-5'],
      ['preferences.text_cps', '-1'],
      ['gui.show_name', 'yes'],
      ['gui.about', 'a """ b']
    ]
    for (const [key, value] of cases) {
      const f = field(key)
      const text = textOf(f)
      const out = applyLookText(f, text, value)
      expect(out, `${key}=${value}`).toEqual({ text, status: 'invalid' })
      expect(lookValueProblem(f, value), key).not.toBeNull()
    }
  })

  it('a picture field has no line to find', () => {
    expect(applyLookText(field('gui/textbox.png'), GUI, 'x')).toEqual({ text: GUI, status: 'not-found' })
    expect(readLookText(field('gui/textbox.png'), GUI).found).toBe(false)
  })
})

describe('line endings and the byte order mark are kept', () => {
  it('a CRLF file stays CRLF and only the one line changes', () => {
    const crlf = GUI.replace(/\n/g, '\r\n')
    const out = applyLookText(field('gui.text_size'), crlf, '40')
    expect(out.status).toBe('applied')
    expect(out.text.replace(/\r\n/g, '')).not.toContain('\n')
    expect(out.text).toBe(crlf.replace('define gui.text_size = 22\r\n', 'define gui.text_size = 40\r\n'))
  })

  it('a file with a byte order mark keeps it, even when the first line is the field', () => {
    const text = "﻿define gui.accent_color = '#7c9cff'\r\nrest\r\n"
    const out = applyLookText(field('gui.accent_color'), text, '#000000')
    expect(out.text).toBe("﻿define gui.accent_color = '#000000'\r\nrest\r\n")
    expect(readLookText(field('gui.accent_color'), text).value).toBe('#7c9cff')
  })

  it('a file whose last line has no line break stays without one', () => {
    const out = applyLookText(field('gui.text_size'), 'a\ndefine gui.text_size = 22', '30')
    expect(out.text).toBe('a\ndefine gui.text_size = 30')
  })

  it('mixed line endings are preserved line by line', () => {
    const text = 'a\r\ndefine gui.text_size = 22\nb\rc\r\n'
    expect(applyLookText(field('gui.text_size'), text, '30').text).toBe('a\r\ndefine gui.text_size = 30\nb\rc\r\n')
  })

  it('the about text uses the file\'s own line breaks', () => {
    const crlf = OPTIONS.replace(/\n/g, '\r\n')
    const out = applyLookText(field('gui.about'), crlf, 'One\nTwo')
    expect(out.text).toContain('define gui.about = _p("""\r\nOne\r\nTwo\r\n""")\r\n')
    expect(out.text.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

describe('the about text', () => {
  const f = field('gui.about')

  it('reads an empty block, a block with paragraphs, and writes both ways', () => {
    expect(readLookText(f, 'define gui.about = _p("""\n""")\n').value).toBe('')
    const filled = 'x\ndefine gui.about = _p("""\nHello.\n\nWorld.\n""")\ny\n'
    expect(readLookText(f, filled).value).toBe('Hello.\n\nWorld.')
    const cleared = applyLookText(f, filled, '')
    expect(cleared.text).toBe('x\ndefine gui.about = _p("""\n""")\ny\n')
    expect(applyLookText(f, cleared.text, 'Hello.\n\nWorld.').text).toBe(filled)
  })

  it('escapes backslashes and reads them back', () => {
    const out = applyLookText(f, OPTIONS, 'a\\b')
    expect(out.text).toContain('a\\\\b\n')
    expect(readLookText(f, out.text).value).toBe('a\\b')
  })

  it('a trailing line break in the value is not written twice', () => {
    const once = applyLookText(f, OPTIONS, 'Hi\n\n')
    expect(readLookText(f, once.text).value).toBe('Hi')
    expect(applyLookText(f, once.text, 'Hi').status).toBe('unchanged')
  })

  it('an about block that was changed by hand is left alone', () => {
    for (const text of [
      'define gui.about = _p("""Text on the same line\n""")\n',
      'define gui.about = _p("""\nline\n""", "extra")\n',
      'define gui.about = _p("""\nline with \\n escape\n""")\n',
      'define gui.about = _("short")\n',
      'define gui.about = _p("""\nnever closed\n'
    ]) {
      expect(applyLookText(f, text, 'New').status, text).toBe('edited-by-hand')
    }
  })
})

describe('helpers', () => {
  it('colourToHex6 normalises', () => {
    expect(colourToHex6('#ABC')).toBe('#aabbcc')
    expect(colourToHex6('#7c9cff80')).toBe('#7c9cff')
    expect(colourToHex6('#12')).toBeNull()
    expect(colourToHex6('blue')).toBeNull()
  })

  it('printLookToken does not need the value to be valid text to escape it', () => {
    expect(printLookToken(field('config.version'), 'a\nb')).toBe('"a\\nb"')
  })
})
