import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyLook, readLook } from '../src/main/look'
import { LOOK_FIELDS } from '../src/shared/look'

const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', 'gui', name), 'utf8')
/** The files of a game made by Ren'Py's generate_gui: a byte order mark and Windows line breaks. */
const asGenerated = (text: string): Buffer => Buffer.from(`﻿${text.replace(/\n/g, '\r\n')}`, 'utf8')

const PNG_OLD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
const PNG_NEW = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9])
const FONT = Buffer.from('not really a font, only bytes')

let root: string
let game: string
let editor: string
const NOW = (): Date => new Date(2026, 4, 6, 7, 8, 9)
const options = { now: NOW }

const read = (...p: string[]): Buffer => readFileSync(join(game, 'game', ...p))
const text = (name: string): string => read(name).toString('utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fabula-look-'))
  game = join(root, 'game-project')
  editor = join(root, 'editor')
  mkdirSync(join(game, 'game', 'gui'), { recursive: true })
  writeFileSync(join(game, 'game', 'gui.rpy'), asGenerated(fixture('gui.rpy.txt')))
  writeFileSync(join(game, 'game', 'options.rpy'), asGenerated(fixture('options.rpy.txt')))
  for (const n of ['textbox', 'namebox', 'main_menu', 'game_menu', 'window_icon']) writeFileSync(join(game, 'game', 'gui', `${n}.png`), PNG_OLD)
  mkdirSync(join(editor, 'assets', 'ui'), { recursive: true })
  mkdirSync(join(editor, 'assets', 'fonts'), { recursive: true })
  writeFileSync(join(editor, 'assets', 'ui', 'box.png'), PNG_NEW)
  writeFileSync(join(editor, 'assets', 'ui', 'photo.jpg'), PNG_NEW)
  writeFileSync(join(editor, 'assets', 'fonts', 'f1.ttf'), FONT)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('readLook', () => {
  it('finds every field of a freshly generated game', () => {
    const entries = readLook(game)
    expect(entries.map((e) => e.key)).toEqual(LOOK_FIELDS.map((f) => f.key))
    for (const e of entries) {
      expect(e.found, e.key).toBe(true)
      expect(e.editedByHand, e.key).toBe(false)
    }
    const by = Object.fromEntries(entries.map((e) => [e.key, e.value]))
    expect(by['gui.accent_color']).toBe('#7c9cff')
    expect(by['gui.text_size']).toBe('22')
    expect(by['gui.show_name']).toBe('True')
    expect(by['gui/textbox.png']).toBe('gui/textbox.png')
  })

  it('reports a missing game as not found and a missing picture as not found', () => {
    rmSync(join(game, 'game', 'gui', 'namebox.png'))
    rmSync(join(game, 'game', 'options.rpy'))
    const by = Object.fromEntries(readLook(game).map((e) => [e.key, e]))
    expect(by['gui/namebox.png']).toMatchObject({ found: false, value: null })
    expect(by['config.version']).toMatchObject({ found: false, editedByHand: false })
    expect(by['gui.text_size'].found).toBe(true)
    expect(readLook(join(root, 'nothing')).every((e) => !e.found)).toBe(true)
  })

  it('reports a hand-edited line', () => {
    const file = join(game, 'game', 'gui.rpy')
    writeFileSync(file, readFileSync(file, 'utf8').replace('define gui.text_size = 22', 'define gui.text_size = 22 * 2'))
    const e = readLook(game).find((x) => x.key === 'gui.text_size')
    expect(e).toEqual({ key: 'gui.text_size', found: false, value: null, editedByHand: true })
  })
})

describe('applyLook', () => {
  it('replaces only the asked lines, keeps CRLF and the byte order mark, and reports each field', () => {
    const before = readFileSync(join(game, 'game', 'gui.rpy'))
    const result = applyLook(game, editor, { 'gui.accent_color': '#aa3344', 'gui.text_size': '28', 'gui.show_name': 'False' }, {}, options)
    expect(result.ok).toBe(true)
    expect(result.results).toEqual([
      { key: 'gui.accent_color', status: 'applied' },
      { key: 'gui.text_size', status: 'applied' },
      { key: 'gui.show_name', status: 'applied' }
    ])
    const after = readFileSync(join(game, 'game', 'gui.rpy'))
    expect(after.subarray(0, 3)).toEqual(before.subarray(0, 3))
    const a = before.toString('utf8').split('\r\n')
    const b = after.toString('utf8').split('\r\n')
    expect(b.length).toBe(a.length)
    const diff = a.flatMap((l, i) => (l === b[i] ? [] : [[l, b[i]]]))
    expect(diff).toEqual([
      ["define gui.accent_color = '#7c9cff'", "define gui.accent_color = '#aa3344'"],
      ['define gui.text_size = 22', 'define gui.text_size = 28']
    ])
    expect(text('options.rpy')).toContain('define gui.show_name = False\r\n')
    expect(text('options.rpy').replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('applying twice: the second time everything is unchanged and no file is touched', () => {
    const values = { 'gui.accent_color': '#aa3344', 'gui.text_size': '28', 'config.version': '3.0', 'gui.about': 'Hello\n\nthere' }
    const uploads = { 'gui.text_font': { file: 'fonts/f1.ttf', to: 'fonts/f1.ttf' }, 'gui/textbox.png': { file: 'ui/box.png' } }
    const first = applyLook(game, editor, values, uploads, options)
    expect(first.results.every((r) => r.status === 'applied')).toBe(true)
    const snapshot = [text('gui.rpy'), text('options.rpy'), read('fonts', 'f1.ttf').toString('hex'), read('gui', 'textbox.png').toString('hex')]
    const second = applyLook(game, editor, values, uploads, { now: () => new Date(2027, 0, 1, 0, 0, 0) })
    expect(second.results.map((r) => r.status)).toEqual(['unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged', 'unchanged'])
    expect(second.backupDir).toBeNull()
    expect([text('gui.rpy'), text('options.rpy'), read('fonts', 'f1.ttf').toString('hex'), read('gui', 'textbox.png').toString('hex')]).toEqual(snapshot)
    expect(readdirSync(join(editor, 'backups'))).toEqual(['20260506-070809'])
  })

  it('backs up each modified file once, in backups/<timestamp>/, with its original bytes', () => {
    const guiBefore = readFileSync(join(game, 'game', 'gui.rpy'))
    const optionsBefore = readFileSync(join(game, 'game', 'options.rpy'))
    const result = applyLook(game, editor, { 'gui.text_size': '28', 'gui.name_text_size': '40', 'config.version': '2' }, { 'gui/textbox.png': { file: 'ui/box.png' } }, options)
    expect(result.backupDir).toBe(join(editor, 'backups', '20260506-070809'))
    const dir = join(editor, 'backups', '20260506-070809')
    expect(readFileSync(join(dir, 'gui.rpy'))).toEqual(guiBefore)
    expect(readFileSync(join(dir, 'options.rpy'))).toEqual(optionsBefore)
    expect(readFileSync(join(dir, 'gui', 'textbox.png'))).toEqual(PNG_OLD)
    expect(readdirSync(dir).sort()).toEqual(['gui', 'gui.rpy', 'options.rpy'])
    expect(readdirSync(join(dir, 'gui'))).toEqual(['textbox.png'])
  })

  it('writes no backup folder when nothing changed', () => {
    const result = applyLook(game, editor, { 'gui.text_size': '22' }, {}, options)
    expect(result.results).toEqual([{ key: 'gui.text_size', status: 'unchanged' }])
    expect(result.backupDir).toBeNull()
    expect(existsSync(join(editor, 'backups'))).toBe(false)
  })

  it('leaves a hand-edited line and everything else about its file alone', () => {
    const file = join(game, 'game', 'gui.rpy')
    const edited = readFileSync(file, 'utf8').replace('define gui.text_size = 22', 'define gui.text_size = gui.base * 2')
    writeFileSync(file, edited)
    const result = applyLook(game, editor, { 'gui.text_size': '30', 'gui.hover_color': '#ffcc00' }, {}, options)
    expect(result.results).toEqual([
      { key: 'gui.hover_color', status: 'applied' },
      { key: 'gui.text_size', status: 'edited-by-hand' }
    ])
    const now = readFileSync(file, 'utf8')
    expect(now).toContain('define gui.text_size = gui.base * 2')
    expect(now).toContain("define gui.hover_color = '#ffcc00'")
  })

  it('reports a missing line, an unusable value and a field that follows the story title', () => {
    const file = join(game, 'game', 'options.rpy')
    writeFileSync(file, readFileSync(file, 'utf8').replace('default preferences.text_cps = 0', ''))
    const result = applyLook(game, editor, { 'preferences.text_cps': '30', 'gui.text_size': 'big', 'config.name': 'Other' }, {}, options)
    expect(Object.fromEntries(result.results.map((r) => [r.key, r.status]))).toEqual({
      'gui.text_size': 'invalid',
      'config.name': 'invalid',
      'preferences.text_cps': 'not-found'
    })
    expect(text('gui.rpy')).toContain('define gui.text_size = 22')
    expect(text('options.rpy')).toContain('define config.name = _("g")')
  })

  it('a missing options.rpy is not found for each of its fields, and the game folder is required', () => {
    rmSync(join(game, 'game', 'options.rpy'))
    expect(applyLook(game, editor, { 'config.version': '2' }, {}, options).results).toEqual([{ key: 'config.version', status: 'not-found' }])
    expect(applyLook(join(root, 'nothing'), editor, { 'config.version': '2' }, {}, options).ok).toBe(false)
  })

  it('replaces a picture by copying the upload over it, and keeps the original in backups', () => {
    const result = applyLook(game, editor, {}, { 'gui/textbox.png': { file: 'ui/box.png' }, 'gui/namebox.png': { file: 'ui/box.png' } }, options)
    expect(result.results.map((r) => r.status)).toEqual(['applied', 'applied'])
    expect(read('gui', 'textbox.png')).toEqual(PNG_NEW)
    expect(read('gui', 'namebox.png')).toEqual(PNG_NEW)
    expect(read('gui', 'main_menu.png')).toEqual(PNG_OLD)
    const dir = join(editor, 'backups', '20260506-070809', 'gui')
    expect(readFileSync(join(dir, 'textbox.png'))).toEqual(PNG_OLD)
    expect(readFileSync(join(dir, 'namebox.png'))).toEqual(PNG_OLD)
    // a second replacement with the same file changes nothing and the first backup stays the first original
    const again = applyLook(game, editor, {}, { 'gui/textbox.png': { file: 'ui/box.png' } }, { now: () => new Date(2027, 1, 1, 1, 1, 1) })
    expect(again.results).toEqual([{ key: 'gui/textbox.png', status: 'unchanged' }])
    expect(readdirSync(join(editor, 'backups'))).toEqual(['20260506-070809'])
  })

  it('creates a picture the game did not have, without a backup', () => {
    rmSync(join(game, 'game', 'gui', 'main_menu.png'))
    const result = applyLook(game, editor, {}, { 'gui/main_menu.png': { file: 'ui/box.png' } }, options)
    expect(result.results).toEqual([{ key: 'gui/main_menu.png', status: 'applied' }])
    expect(read('gui', 'main_menu.png')).toEqual(PNG_NEW)
    expect(result.backupDir).toBeNull()
  })

  it('refuses a picture that is not a PNG, a missing upload and a path that leaves the story folder', () => {
    const result = applyLook(
      game,
      editor,
      {},
      {
        'gui/textbox.png': { file: 'ui/photo.jpg' },
        'gui/namebox.png': { file: 'ui/gone.png' },
        'gui/main_menu.png': { file: '../outside.png' }
      },
      options
    )
    expect(result.results.map((r) => r.status)).toEqual(['invalid', 'invalid', 'invalid'])
    expect(read('gui', 'textbox.png')).toEqual(PNG_OLD)
  })

  it('copies a font into game/fonts/ and sets the define to its relative path', () => {
    const result = applyLook(game, editor, {}, { 'gui.text_font': { file: 'fonts/f1.ttf', to: 'fonts/my_font.ttf' } }, options)
    expect(result.results).toEqual([{ key: 'gui.text_font', status: 'applied' }])
    expect(read('fonts', 'my_font.ttf')).toEqual(FONT)
    expect(text('gui.rpy')).toContain('define gui.text_font = "fonts/my_font.ttf"\r\n')
    expect(text('gui.rpy')).toContain('define gui.name_text_font = "DejaVuSans.ttf"\r\n')
  })

  it('does not copy the font when its define was edited by hand', () => {
    const file = join(game, 'game', 'gui.rpy')
    writeFileSync(file, readFileSync(file, 'utf8').replace('define gui.text_font = "DejaVuSans.ttf"', 'define gui.text_font = gui.name_text_font'))
    const result = applyLook(game, editor, {}, { 'gui.text_font': { file: 'fonts/f1.ttf', to: 'fonts/my_font.ttf' } }, options)
    expect(result.results).toEqual([{ key: 'gui.text_font', status: 'edited-by-hand' }])
    expect(existsSync(join(game, 'game', 'fonts'))).toBe(false)
  })

  it('refuses a font target outside fonts/ or without a font extension', () => {
    for (const to of ['gui/x.ttf', 'fonts/x.png', '../fonts/x.ttf', 'fonts/sub/x.ttf', '']) {
      const r = applyLook(game, editor, {}, { 'gui.text_font': { file: 'fonts/f1.ttf', to } }, options)
      expect(r.results[0].status, to).toBe('invalid')
    }
    expect(text('gui.rpy')).toContain('define gui.text_font = "DejaVuSans.ttf"')
  })

  it('a font that already exists with other bytes is backed up before it is replaced', () => {
    mkdirSync(join(game, 'game', 'fonts'))
    writeFileSync(join(game, 'game', 'fonts', 'my_font.ttf'), 'older')
    applyLook(game, editor, {}, { 'gui.text_font': { file: 'fonts/f1.ttf', to: 'fonts/my_font.ttf' } }, options)
    expect(readFileSync(join(editor, 'backups', '20260506-070809', 'fonts', 'my_font.ttf'), 'utf8')).toBe('older')
    expect(read('fonts', 'my_font.ttf')).toEqual(FONT)
  })

  it('changes nothing else in the game folder', () => {
    const list = (dir: string, base = dir): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(join(dir, e.name), base) : [join(dir, e.name).slice(base.length).split('\\').join('/')]))
    writeFileSync(join(game, 'game', 'screens.rpy'), 'screen x(): pass\n')
    const screens = readFileSync(join(game, 'game', 'screens.rpy'))
    applyLook(game, editor, { 'gui.text_size': '30' }, { 'gui.text_font': { file: 'fonts/f1.ttf', to: 'fonts/z.ttf' } }, options)
    expect(readFileSync(join(game, 'game', 'screens.rpy'))).toEqual(screens)
    expect(list(game).sort()).toEqual(
      ['/game/fonts/z.ttf', '/game/gui.rpy', '/game/options.rpy', '/game/screens.rpy', ...['textbox', 'namebox', 'main_menu', 'game_menu', 'window_icon'].map((n) => `/game/gui/${n}.png`)].sort()
    )
  })
})
