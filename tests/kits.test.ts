import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { createCompileContext } from '@shared/compiler/context'
import { renderKitPart } from '@shared/compiler/kits'
import { deriveEdges, listExits, setExitTarget } from '@shared/edges'
import { createKitBlock, createKitEnding, createProject, createScene, createVariable, cloneWithNewIds } from '@shared/factory'
import { syncKitExits } from '@shared/kits/exits'
import { defaultParams, summaryLine } from '@shared/kits/fields'
import { loadKit, mergeKits, OVERRIDE_NOTE } from '@shared/kits/load'
import { kitPathProblem, parseKitManifest, reservedTargetProblem } from '@shared/kits/manifest'
import { TemplateError, checkTemplate, renderTemplate, type TemplateHost } from '@shared/kits/template'
import { findBlockDef, findEndingDef, type KitField, type LoadedKit } from '@shared/kits/types'
import { kitUses, kitsInUse, scenesUsingKit } from '@shared/kits/usage'
import { kitPaletteGroups } from '../src/renderer/views/SceneEditor/paletteEntries'
import type { Block, Ending, Project, Scene } from '@shared/model'
import { findUsage } from '@shared/usage'
import { start, step } from '@shared/interpreter'
import { validateProject } from '@shared/validate'
import { exportProject } from '../src/main/exporter'
import { builtInKitsDir, listKits, loadKitsIn } from '../src/main/kits'
import { sceneCardInfo } from '../src/renderer/views/StoryMap/mapModel'
import { summarizeBlock } from '../src/renderer/views/SceneEditor/blockSummaries'
import { useKitStore } from '../src/renderer/store/kitStore'
import { useProjectStore } from '../src/renderer/store/projectStore'
import { BUILT_IN_KITS_DIR, builtInKits } from './helpers/kits'

// ---------------------------------------------------------------------------------------------------------------
// helpers

const terminal = (): LoadedKit => builtInKits().find((k) => k.id === 'terminal') as LoadedKit
const ctx = (): { kits: LoadedKit[] } => ({ kits: [terminal()] })

interface World {
  project: Project
  start: Scene
  vault: Scene
  out: Scene
  courage: string
}

function world(): World {
  const project = createProject('T')
  project.kits = ['terminal']
  const start = project.scenes[project.startSceneId as string]
  start.name = 'Server room'
  const vault = createScene({ x: 100, y: 0 }, 'Vault')
  const out = createScene({ x: 100, y: 100 }, 'Outside')
  for (const s of [vault, out]) {
    s.ending = { type: 'end' }
    project.scenes[s.id] = s
  }
  const v = createVariable('Courage', 'number')
  project.variables[v.id] = v
  project.variableOrder.push(v.id)
  return { project, start, vault, out, courage: v.id }
}

function sessionEnding(w: World, commands: Record<string, unknown>[] = []): Extract<Ending, { type: 'kit' }> {
  const def = findEndingDef(terminal(), 'session')!
  const params = { ...defaultParams(def.fields), commands, help: false }
  const ending = createKitEnding('terminal', 'session', params) as Extract<Ending, { type: 'kit' }>
  ending.exits = syncKitExits(ending, terminal())
  return ending
}

const cmd = (id: string, word: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  word,
  reply: `${word} reply`,
  effects: [],
  only: null,
  leaves: false,
  ...extra
})

const errorsOf = (p: Project, c = ctx()): string[] => validateProject(p, c).filter((x) => x.severity === 'error').map((x) => x.message)

// ---------------------------------------------------------------------------------------------------------------
describe('kit manifest', () => {
  const valid = (): Record<string, unknown> => JSON.parse(readFileSync(join(BUILT_IN_KITS_DIR, 'terminal', 'kit.json'), 'utf8'))

  it('accepts the Terminal kit manifest', () => {
    const r = parseKitManifest(valid())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.manifest.id).toBe('terminal')
      expect(r.manifest.endings[0].exits).toEqual({ list: 'commands', when: 'leaves', name: '{{word}}' })
    }
  })

  const mutate = (fn: (m: Record<string, any>) => void): string => {
    const m = valid()
    fn(m)
    const r = parseKitManifest(m)
    expect(r.ok).toBe(false)
    return r.ok ? '' : r.error
  }

  it('says what is wrong in plain words', () => {
    expect(mutate((m) => (m.id = 'Bad Id'))).toMatch(/kit\.json, id: must be 1 to 40 characters/)
    expect(mutate((m) => (m.formatVersion = 2))).toMatch(/formatVersion: must be 1/)
    expect(mutate((m) => delete m.name)).toMatch(/kit\.json, name: is required/)
    expect(mutate((m) => (m.blocks[0].fields[0].type = 'colour'))).toMatch(/unknown field type\. Use one of: text, multiline/)
    expect(mutate((m) => (m.surprise = 1))).toMatch(/unknown key "surprise"/)
    expect(mutate((m) => (m.blocks[0].fields[0].key = '1x'))).toMatch(/key: must start with a letter/)
    expect(mutate((m) => m.blocks[0].fields.push({ key: 'x', label: 'X', type: 'select', options: [] }))).toMatch(/needs at least one option/)
  })

  it('rejects duplicate keys, duplicate types and exits that point nowhere', () => {
    expect(mutate((m) => m.blocks[0].fields.push({ key: 'text', label: 'Again', type: 'text' }))).toMatch(/two fields are both called "text"/)
    expect(mutate((m) => m.blocks.push({ ...m.blocks[0] }))).toMatch(/two blocks are both of type "print"/)
    expect(mutate((m) => m.endings.push({ ...m.endings[0] }))).toMatch(/two endings are both of type "session"/)
    expect(mutate((m) => (m.endings[0].exits.list = 'nope'))).toMatch(/exits\.list is "nope" but there is no list field/)
    expect(mutate((m) => (m.endings[0].exits.when = 'word'))).toMatch(/exits\.when is "word"/)
    expect(mutate((m) => (m.endings[0].exits.name = '{{ghost}}'))).toMatch(/exits\.name uses \{\{ghost\}\}/)
    expect(mutate((m) => m.endings[0].fields[5].fields.push({ key: 'word', label: 'W', type: 'text' }))).toMatch(/list "commands": two fields are both called "word"/)
  })

  it('refuses paths that leave the kit folder or the game folder', () => {
    expect(mutate((m) => (m.files[0].from = '../outside.rpy'))).toMatch(/"\.\."/)
    expect(mutate((m) => (m.files[0].from = '/etc/passwd'))).toMatch(/absolute/)
    expect(mutate((m) => (m.files[0].from = 'C:/Windows/x.rpy'))).toMatch(/absolute/)
    expect(mutate((m) => (m.files[0].to = '../escape.rpy'))).toMatch(/"\.\."/)
    expect(mutate((m) => (m.files[0].to = 'a\\b.rpy'))).toMatch(/backslash/)
    expect(mutate((m) => (m.blocks[0].template = '../../secrets.txt'))).toMatch(/template path.*"\.\."/)
    expect(mutate((m) => (m.endings[0].template = '/abs/session.txt'))).toMatch(/template path.*absolute/)
  })

  it('refuses target names the game or Fabula already uses', () => {
    for (const to of ['script.rpy', 'gui.rpy', 'screens.rpy', 'options.rpy', 'interface.rpy', 'GUI.rpy', 'gui/extra.png', 'script.rpyc']) {
      expect(mutate((m) => (m.files[0].to = to)), to).toMatch(/already uses|gui folder/)
    }
    expect(mutate((m) => m.files.push({ from: 'files/terminal.rpy', to: 'Terminal.rpy' }))).toMatch(/both copied to/)
    expect(reservedTargetProblem('mykit.rpy')).toBeNull()
  })

  it('kitPathProblem covers the unsafe shapes', () => {
    expect(kitPathProblem('files/a.rpy')).toBeNull()
    for (const bad of ['', '/a', 'a//b', 'a/', './a', 'a/../b', 'a\\b', 'C:x', 'a/b.', 'a?b']) expect(kitPathProblem(bad), bad).not.toBeNull()
  })

  it('accepts every field type', () => {
    const m = valid()
    ;(m.blocks as Record<string, unknown>[])[0].fields = [
      { key: 'a', label: 'A', type: 'text', default: 'x' },
      { key: 'b', label: 'B', type: 'multiline' },
      { key: 'c', label: 'C', type: 'number', min: 0, max: 5, step: 1, default: 2 },
      { key: 'd', label: 'D', type: 'boolean', default: true },
      { key: 'e', label: 'E', type: 'select', options: ['one', { value: 'two', label: 'Two' }], default: 'two' },
      { key: 'f', label: 'F', type: 'color', default: '#ffffff' },
      { key: 'g', label: 'G', type: 'variable', varType: 'number' },
      { key: 'h', label: 'H', type: 'character' },
      { key: 'i', label: 'I', type: 'asset', kind: 'music' },
      { key: 'j', label: 'J', type: 'effects' },
      { key: 'k', label: 'K', type: 'condition' },
      { key: 'l', label: 'L', type: 'list', itemLabel: '{{a}}', fields: [{ key: 'a', label: 'A', type: 'text' }] }
    ]
    expect(parseKitManifest(m).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('template engine', () => {
  const fields: KitField[] = [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'body', label: 'Body', type: 'multiline' },
    { key: 'n', label: 'N', type: 'number' },
    { key: 'on', label: 'On', type: 'boolean' },
    { key: 'who', label: 'Who', type: 'character' },
    { key: 'var', label: 'Var', type: 'variable' },
    { key: 'song', label: 'Song', type: 'asset', kind: 'music' },
    { key: 'fx', label: 'Fx', type: 'effects' },
    { key: 'when', label: 'When', type: 'condition' },
    {
      key: 'rows',
      label: 'Rows',
      type: 'list',
      fields: [
        { key: 'word', label: 'Word', type: 'text' },
        { key: 'go', label: 'Go', type: 'boolean' },
        { key: 'inner', label: 'Inner', type: 'list', fields: [{ key: 'x', label: 'X', type: 'text' }] }
      ]
    }
  ]
  const host: TemplateHost = {
    label: 'scene_a',
    text: (v) => `T<${v}>`,
    name: (kind, id) => (id === 'missing' ? null : `${kind}_${id}`),
    path: (id) => (id === 'missing' ? null : `audio/music/${id}.ogg`),
    effects: (e) => e.map((x) => `$ fx${x.variableId}`),
    condition: (c) => `cond${c.clauses.length}`,
    exitLabel: (id) => (id === 'r2' ? 'target_two' : null)
  }
  const params = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    title: 'He said "hi"',
    body: 'one\ntwo',
    n: 3,
    on: true,
    who: 'c1',
    var: 'v1',
    song: 'm1',
    fx: [{ variableId: 'v1', op: 'set', value: 1 }, { variableId: 'v2', op: 'set', value: 2 }],
    when: { join: 'and', clauses: [{ id: 'k', variableId: 'v1', op: 'eq', value: 1 }] },
    rows: [
      { id: 'r1', word: 'a', go: false, inner: [] },
      { id: 'r2', word: 'b', go: true, inner: [{ id: 'i1', x: 'p' }, { id: 'i2', x: 'q' }] }
    ],
    ...extra
  })
  const r = (src: string, extra: Record<string, unknown> = {}): string => renderTemplate(src, fields, params(extra), host)

  it('{{key}} prints the value as it is', () => {
    expect(r('a {{title}} b {{n}} c {{on}}')).toBe('a He said "hi" b 3 c True')
    expect(r('{{ n }}')).toBe('3')
  })
  it('|text quotes and escapes through the dialogue rules (host)', () => {
    expect(r('x = {{title|text}}')).toBe('x = T<He said "hi">')
  })
  it('|py makes a Python literal, with the project escaping', () => {
    expect(r('{{title|py}} {{n|py}} {{on|py}}')).toBe('"He said \\"hi\\"" 3 True')
    expect(r('{{body|py}}')).toBe('"one\\ntwo"')
  })
  it('|name, |path, |effects, |condition, |lines', () => {
    expect(r('{{who|name}} {{var|name}} {{song|path}}')).toBe('character_c1 variable_v1 audio/music/m1.ogg')
    expect(r('{{fx|effects}}')).toBe('$ fxv1\n$ fxv2')
    expect(r('{{when|condition}}')).toBe('cond1')
    expect(r('[{{body|lines}}]')).toBe('[T<one>, T<two>]')
    expect(r('[{{body|lines}}]', { body: '  ' })).toBe('[]')
  })
  it('lower and trim come before the last filter', () => {
    expect(r('{{title|lower|py}}', { title: '  HeLLo ' })).toBe('"  hello "')
    expect(r('{{title|trim|lower|py}}', { title: '  HeLLo ' })).toBe('"hello"')
  })
  it('{{@label}} is the scene label and {{@index}} counts from 0', () => {
    expect(r('{{@label}}_x')).toBe('scene_a_x')
    expect(r('{{#each rows}}{{@index}}{{word}} {{/each}}')).toBe('0a 1b')
  })
  it('{{#each}} with {{@exit}}, {{@first}} and {{@last}}, and nested lists', () => {
    expect(r('{{#each rows}}{{word}}={{@exit}};{{/each}}')).toBe('a=;b=target_two;')
    expect(r('{{#each rows}}{{#if @first}}[{{/if}}{{word}}{{#if @last}}]{{else}},{{/if}}{{/each}}')).toBe('[a,b]')
    expect(r('{{#each rows}}{{#each inner}}{{x}}{{/each}}|{{/each}}')).toBe('|pq|')
  })
  it('{{#if}} with {{else}} on every kind of value', () => {
    const t = (key: string, extra: Record<string, unknown> = {}): string => r(`{{#if ${key}}}yes{{else}}no{{/if}}`, extra)
    expect(t('on')).toBe('yes')
    expect(t('on', { on: false })).toBe('no')
    expect(t('title', { title: '  ' })).toBe('no')
    expect(t('n', { n: 0 })).toBe('no')
    expect(t('who')).toBe('yes')
    expect(t('who', { who: null })).toBe('no')
    expect(t('fx', { fx: [] })).toBe('no')
    expect(t('when', { when: null })).toBe('no')
    expect(t('rows', { rows: [] })).toBe('no')
  })
  it('a missing key falls back to the default of the field', () => {
    const f: KitField[] = [{ key: 'greeting', label: 'G', type: 'text', default: 'hello' }]
    expect(renderTemplate('{{greeting}}', f, {}, host)).toBe('hello')
  })
  it('tags alone on a line take the whole line; output alone on a line keeps its indent and drops when empty', () => {
    const src = ['start', '{{#if on}}', '    kept', '{{else}}', '    dropped', '{{/if}}', '    {{fx|effects}}', '    {{body}}', 'end'].join('\n')
    expect(r(src)).toBe('start\n    kept\n    $ fxv1\n    $ fxv2\n    one\n    two\nend')
    expect(r(src, { on: false, fx: [], body: '' })).toBe('start\n    dropped\nend')
  })
  it('never adds a comment and trims the ends', () => {
    expect(r('\n\nplain\n\n')).toBe('plain')
    expect(r('plain')).not.toContain('#')
  })

  const error = (src: string, extra: Record<string, unknown> = {}): TemplateError => {
    try {
      r(src, extra)
    } catch (e) {
      expect(e).toBeInstanceOf(TemplateError)
      return e as TemplateError
    }
    throw new Error('expected a TemplateError')
  }

  it('TemplateError names the line and says what is wrong', () => {
    expect(error('ok\n{{nope}}').message).toBe('line 2: unknown key "nope". This part has no field with that key.')
    expect(error('{{title|shout}}').message).toMatch(/line 1: unknown filter "shout"/)
    expect(error('a\nb\n{{#each rows}}x').message).toBe('line 3: {{#each}} is never closed. Add {{/each}}.')
    expect(error('{{/if}}').message).toMatch(/without a matching/)
    expect(error('{{#if on}}{{/each}}').message).toMatch(/closes the wrong tag/)
    expect(error('{{else}}').message).toMatch(/without a matching \{\{#if\}\}/)
    expect(error('{{#if on}}a{{else}}b{{else}}c{{/if}}').message).toMatch(/second \{\{else\}\}/)
    expect(error('{{@exit}}').message).toMatch(/only be used inside \{\{#each\}\}/)
    expect(error('{{@nothing}}').message).toMatch(/unknown \{\{@nothing\}\}/)
    expect(error('{{}}').message).toMatch(/empty/)
    expect(error('{{#each title}}{{/each}}').message).toMatch(/needs a list field/)
    expect(error('{{#unknown x}}').message).toMatch(/unknown tag/)
    expect(error('{{1bad}}').message).toMatch(/is not a key/)
  })
  it('filters that do not fit the field are errors, not crashes', () => {
    expect(error('{{fx}}').message).toMatch(/needs \|effects/)
    expect(error('{{who}}').message).toMatch(/needs \|name/)
    expect(error('{{rows}}').message).toMatch(/needs \{\{#each\}\}/)
    expect(error('{{title|effects}}').message).toMatch(/cannot be used on "title"/)
    expect(error('{{n|lines}}').message).toMatch(/cannot be used/)
    expect(error('{{n|lower}}').message).toMatch(/not text/)
    expect(error('{{title|py|lower}}').message).toMatch(/must come last/)
    expect(error('{{who|name}}', { who: 'missing' }).message).toMatch(/no longer exists/)
    expect(error('{{who|name}}', { who: null }).message).toMatch(/nothing picked/)
    expect(error('{{song|path}}', { song: 'missing' }).message).toMatch(/missing or cannot be used/)
    expect(error('{{song|path}}', { song: null }).message).toMatch(/no file picked/)
  })
  it('checkTemplate finds the same mistakes without rendering', () => {
    expect(() => checkTemplate('{{#each rows}}{{word}}{{/each}}', fields)).not.toThrow()
    expect(() => checkTemplate('{{#each rows}}{{ghost}}{{/each}}', fields)).toThrow(/unknown key "ghost"/)
    expect(() => checkTemplate('{{@index}}', fields)).toThrow(/inside \{\{#each\}\}/)
    expect(() => checkTemplate('{{fx}}', fields)).toThrow(/needs \|effects/)
    expect(() => checkTemplate('{{#if on}}', fields)).toThrow(/never closed/)
  })
  it('works without eval: the source has no eval and no Function constructor', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'shared', 'kits', 'template.ts'), 'utf8')
    expect(src).not.toMatch(/\beval\s*\(|new Function|Function\s*\(/)
  })
  it('summaries use {{key}} only', () => {
    expect(summaryLine('Prints "{{title}}" x{{n}} {{ghost}}', 'Name', fields, params())).toBe('Prints "He said "hi"" x3 ')
    expect(summaryLine(undefined, 'Name', fields, params())).toBe('Name')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('loading kits', () => {
  let work: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'fabula-kits-'))
  })
  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })
  const copyTerminal = (to: string): void => cpSync(join(BUILT_IN_KITS_DIR, 'terminal'), to, { recursive: true })
  const manifestOf = (dir: string): Record<string, any> => JSON.parse(readFileSync(join(dir, 'kit.json'), 'utf8'))
  const writeManifest = (dir: string, m: unknown): void => writeFileSync(join(dir, 'kit.json'), JSON.stringify(m, null, 2))

  it('loads the built-in kit with its templates and files', () => {
    const kit = terminal()
    expect(kit.error).toBeNull()
    expect(kit.source).toBe('built-in')
    expect(Object.keys(kit.templates).sort()).toEqual(['templates/clear.txt', 'templates/print.txt', 'templates/session.txt'])
    expect(kit.files.map((f) => f.to)).toEqual(['terminal.rpy'])
    expect(kit.files[0].content).toContain('screen terminal(')
  })

  it('the built-in folder resolver picks the repository in development and the resources folder when packaged', () => {
    expect(builtInKitsDir({ isPackaged: false, resourcesPath: 'C:/res', appPath: 'C:/app' })).toBe(join('C:/app', 'resources', 'kits'))
    expect(builtInKitsDir({ isPackaged: true, resourcesPath: 'C:/res', appPath: 'C:/app' })).toBe(join('C:/res', 'kits'))
  })

  it('lists built-in kits plus the kits in <story>/kits', () => {
    const story = join(work, 'story')
    copyTerminal(join(story, 'kits', 'mine'))
    const m = manifestOf(join(story, 'kits', 'mine'))
    m.id = 'mine'
    m.name = 'Mine'
    writeManifest(join(story, 'kits', 'mine'), m)
    const kits = listKits(story, BUILT_IN_KITS_DIR)
    expect(kits.map((k) => [k.id, k.source])).toEqual([
      ['mine', 'story'],
      ['terminal', 'built-in']
    ])
    expect(kits[0].folder).toBe(join(story, 'kits', 'mine'))
  })

  it('a story kit with the id of a built-in kit replaces it, with a note', () => {
    const story = join(work, 'story')
    copyTerminal(join(story, 'kits', 'terminal'))
    const kits = listKits(story, BUILT_IN_KITS_DIR)
    expect(kits).toHaveLength(1)
    expect(kits[0].source).toBe('story')
    expect(kits[0].note).toBe(OVERRIDE_NOTE)
  })

  it('a broken kit comes back with its error and does not hide the others', () => {
    const story = join(work, 'story')
    mkdirSync(join(story, 'kits', 'empty'), { recursive: true })
    mkdirSync(join(story, 'kits', 'badjson'), { recursive: true })
    writeFileSync(join(story, 'kits', 'badjson', 'kit.json'), '{ nope')
    copyTerminal(join(story, 'kits', 'notemplate'))
    const m = manifestOf(join(story, 'kits', 'notemplate'))
    m.id = 'notemplate'
    writeManifest(join(story, 'kits', 'notemplate'), m)
    rmSync(join(story, 'kits', 'notemplate', 'templates', 'print.txt'))
    rmSync(join(story, 'kits', 'notemplate', 'files', 'terminal.rpy'))
    copyTerminal(join(story, 'kits', 'badtemplate'))
    const b = manifestOf(join(story, 'kits', 'badtemplate'))
    b.id = 'badtemplate'
    writeManifest(join(story, 'kits', 'badtemplate'), b)
    writeFileSync(join(story, 'kits', 'badtemplate', 'templates', 'print.txt'), '$ x({{missing}})\n')
    const kits = listKits(story, BUILT_IN_KITS_DIR)
    const byId = Object.fromEntries(kits.map((k) => [k.id, k]))
    expect(byId.terminal.error).toBeNull()
    expect(byId.empty.error).toBe('The folder has no kit.json.')
    expect(byId.badjson.error).toMatch(/kit\.json is not valid JSON/)
    expect(byId.notemplate.manifest).toBeNull()
    expect(byId.notemplate.error).toMatch(/uses the template "templates\/print\.txt", but that file is not in the kit folder/)
    expect(byId.notemplate.error).toMatch(/lists the file "files\/terminal\.rpy", but it is not in the kit folder/)
    expect(byId.badtemplate.error).toMatch(/templates\/print\.txt, line 1: unknown key "missing"/)
  })

  it('refuses a manifest that points outside its folder, even when the file exists', () => {
    const story = join(work, 'story')
    copyTerminal(join(story, 'kits', 'sneaky'))
    writeFileSync(join(story, 'kits', 'secret.txt'), 'secret')
    const m = manifestOf(join(story, 'kits', 'sneaky'))
    m.id = 'sneaky'
    m.files[0].from = '../secret.txt'
    writeManifest(join(story, 'kits', 'sneaky'), m)
    const kit = loadKitsIn(join(story, 'kits'), 'story').find((k) => k.id === 'sneaky') as LoadedKit
    expect(kit.manifest).toBeNull()
    expect(kit.error).toMatch(/"\.\."/)
    expect(kit.files).toEqual([])
  })

  it('mergeKits reports a second story kit with a taken id instead of dropping it', () => {
    const a = terminal()
    const dupe = { ...a, source: 'story' as const, folder: 'x' }
    const merged = mergeKits([], [dupe, { ...dupe, folder: 'y' }])
    expect(merged).toHaveLength(2)
    expect(merged.some((k) => k.error?.includes('already uses the id "terminal"'))).toBe(true)
  })

  it('files are normalised to LF and a BOM is dropped', () => {
    const story = join(work, 'story')
    copyTerminal(join(story, 'kits', 'crlf'))
    const m = manifestOf(join(story, 'kits', 'crlf'))
    m.id = 'crlf'
    writeManifest(join(story, 'kits', 'crlf'), m)
    writeFileSync(join(story, 'kits', 'crlf', 'files', 'terminal.rpy'), '\uFEFFa = 1\r\nb = 2\r\n')
    const kit = loadKitsIn(join(story, 'kits'), 'story').find((k) => k.id === 'crlf') as LoadedKit
    expect(kit.files[0].content).toBe('a = 1\nb = 2\n')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('syncKitExits', () => {
  const ending = (commands: Record<string, unknown>[], exits: { id: string; name: string; target: string | null }[] = []) =>
    ({ type: 'kit', kitId: 'terminal', endingType: 'session', params: { commands }, exits }) as Extract<Ending, { type: 'kit' }>

  it('makes one exit per leaving command, named after it, in list order', () => {
    const e = ending([cmd('a', 'help'), cmd('b', 'unlock', { leaves: true }), cmd('c', 'exit', { leaves: true })])
    expect(syncKitExits(e, terminal())).toEqual([
      { id: 'b', name: 'unlock', target: null },
      { id: 'c', name: 'exit', target: null }
    ])
  })
  it('keeps the target of an exit while its item stays, follows renames, and drops what is gone', () => {
    const e = ending(
      [cmd('b', 'unlock2', { leaves: true }), cmd('d', 'new', { leaves: true })],
      [
        { id: 'b', name: 'unlock', target: 's1' },
        { id: 'c', name: 'exit', target: 's2' }
      ]
    )
    expect(syncKitExits(e, terminal())).toEqual([
      { id: 'b', name: 'unlock2', target: 's1' },
      { id: 'd', name: 'new', target: null }
    ])
  })
  it('toggling "leaves" off removes the exit and on again gives a new empty one', () => {
    const on = ending([cmd('b', 'x', { leaves: true })], [{ id: 'b', name: 'x', target: 's1' }])
    const off = { ...on, params: { commands: [cmd('b', 'x', { leaves: false })] } }
    const exits = syncKitExits(off, terminal())
    expect(exits).toEqual([])
    expect(syncKitExits({ ...on, exits }, terminal())).toEqual([{ id: 'b', name: 'x', target: null }])
  })
  it('leaves the exits alone when the kit or ending type is missing, and clears them when the ending has no exits rule', () => {
    const e = ending([cmd('b', 'x', { leaves: true })], [{ id: 'z', name: 'z', target: 's' }])
    expect(syncKitExits(e, undefined)).toBe(e.exits)
    expect(syncKitExits({ ...e, endingType: 'nope' }, terminal())).toBe(e.exits)
    const k = terminal()
    const noRule: LoadedKit = { ...k, manifest: { ...k.manifest!, endings: [{ ...k.manifest!.endings[0], exits: undefined }] } }
    expect(syncKitExits(e, noRule)).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('compiling kit blocks and endings', () => {
  it('a kit block is the template output at its place, and a kit ending the session', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'Booting "x" [y] 100%' }), createKitBlock('terminal', 'clear', {})]
    const e = sessionEnding(w, [cmd('c1', 'go', { leaves: true })])
    e.params = { ...e.params, intro: 'Hi\nthere' }
    e.exits[0].target = w.vault.id
    w.start.ending = e
    const out = compileProject(w.project, ctx())
    const text = out.files[0].content
    expect(text).toContain('label start:\n\n    $ terminal_print("Booting \\"x\\" [[y] 100%%")\n\n    $ terminal_clear()\n\n    $ terminal_open("TERMINAL", ["Hi", "there"], "> ")\n\n    label start_terminal:\n')
    expect(text).toContain('        elif command == "go":\n            $ terminal_print("go reply")\n            $ terminal_close()\n            jump vault\n')
    expect(text).toContain('        else:\n            $ terminal_print("Unknown command.")\n            jump start_terminal\n')
    expect(text).not.toMatch(/^\s*#/m)
  })

  it('effects, conditions and help are written like the built-in blocks write them', () => {
    const w = world()
    const e = sessionEnding(w, [
      cmd('c1', 'Train', { effects: [{ variableId: w.courage, op: 'add', value: 2 }], only: { join: 'and', clauses: [{ id: 'k', variableId: w.courage, op: 'lt', value: 9 }] } }),
      cmd('c2', 'rest')
    ])
    e.params = { ...e.params, help: true }
    w.start.ending = e
    const text = compileProject(w.project, ctx()).files[0].content
    expect(text).toContain('        elif command == "help":\n            $ terminal_help(["train", "rest"])\n')
    expect(text).toContain('        elif command == "train" and (courage < 9):\n            $ terminal_print("Train reply")\n            $ courage += 2\n            jump start_terminal\n')
  })

  it('kit files are copied to the game as ordinary generated files', () => {
    const w = world()
    const out = compileProject(w.project, ctx())
    expect(out.files.map((f) => f.path)).toEqual(['script.rpy', 'terminal.rpy'])
    expect(out.files[1].content).toBe(terminal().files[0].content)
  })

  it('without kits, with the kit switched off, or for a kit that failed, kit parts and files are left out', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'x' })]
    w.start.ending = sessionEnding(w)
    expect(compileProject(w.project).files.map((f) => f.path)).toEqual(['script.rpy'])
    expect(compileProject(w.project).files[0].content).not.toContain('terminal_')
    w.project.kits = []
    const off = compileProject(w.project, ctx())
    expect(off.files.map((f) => f.path)).toEqual(['script.rpy'])
    expect(off.files[0].content).not.toContain('terminal_')
    w.project.kits = ['terminal']
    const broken: LoadedKit = { ...terminal(), manifest: null, error: 'x', files: [], templates: {} }
    const r = compileProject(w.project, { kits: [broken] })
    expect(r.files.map((f) => f.path)).toEqual(['script.rpy'])
  })

  it('a kit with onlyWhenUsed writes its files only when something uses it; otherwise enabled kits always write them', () => {
    const w = world()
    const k = terminal()
    const lazy: LoadedKit = { ...k, manifest: { ...k.manifest!, onlyWhenUsed: true } }
    expect(compileProject(w.project, { kits: [lazy] }).files.map((f) => f.path)).toEqual(['script.rpy'])
    w.start.blocks = [createKitBlock('terminal', 'clear', {})]
    expect(compileProject(w.project, { kits: [lazy] }).files.map((f) => f.path)).toEqual(['script.rpy', 'terminal.rpy'])
    w.start.blocks = []
    expect(compileProject(w.project, { kits: [k] }).files.map((f) => f.path)).toEqual(['script.rpy', 'terminal.rpy'])
  })

  it('a kit file that would land on a chapter file or script file is not written (the validator reports it)', () => {
    const w = world()
    const ch = { id: 'ch', name: 'Terminal', color: '#fff' }
    w.project.chapters.ch = ch
    w.project.chapterOrder.push('ch')
    w.vault.chapterId = 'ch'
    const out = compileProject(w.project, ctx())
    expect(out.files.filter((f) => f.path === 'terminal.rpy')).toHaveLength(1)
    expect(out.files.find((f) => f.path === 'terminal.rpy')?.content).toContain('label vault')
    expect(errorsOf(w.project).join('\n')).toMatch(/The Terminal kit writes "terminal\.rpy", which is the file of the chapter "Terminal"/)
  })

  it('compiling twice gives the same files', () => {
    const w = world()
    w.start.ending = sessionEnding(w, [cmd('c1', 'go', { leaves: true })])
    expect(compileProject(w.project, ctx())).toEqual(compileProject(w.project, ctx()))
  })

  it('asset fields give {{key|path}} and copy the file', () => {
    const w = world()
    w.project.assets.m1 = { id: 'm1', kind: 'music', name: 'Hum', file: 'music/m1.ogg', width: null, height: null, bytes: 1 }
    const k = terminal()
    const custom: LoadedKit = {
      ...k,
      templates: { ...k.templates, 'templates/print.txt': '$ renpy.music.play({{song|path|py}})' },
      manifest: { ...k.manifest!, blocks: [{ ...k.manifest!.blocks[0], fields: [{ key: 'song', label: 'Song', type: 'asset', kind: 'music' }] }, k.manifest!.blocks[1]] }
    }
    custom.templates['templates/print.txt'] = '$ renpy.music.play("{{song|path}}")'
    w.start.blocks = [createKitBlock('terminal', 'print', { song: 'm1' })]
    const out = compileProject(w.project, { kits: [custom] })
    expect(out.files[0].content).toContain('$ renpy.music.play("audio/music/hum.ogg")')
    expect(out.assetCopies.map((c) => c.to)).toEqual(['audio/music/hum.ogg'])
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('validation of kit blocks and endings', () => {
  const only = (p: Project, c = ctx()): string[] => errorsOf(p, c)

  it('a correct story has no errors', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'x' })]
    const e = sessionEnding(w, [cmd('c1', 'go', { leaves: true })])
    e.exits[0].target = w.vault.id
    w.start.ending = e
    expect(only(w.project)).toEqual([])
  })
  it('a kit that is not installed', () => {
    const w = world()
    w.start.blocks = [createKitBlock('ghost', 'x', {})]
    expect(only(w.project)[0]).toMatch(/"Server room": the kit block \(block 1\) uses the kit "ghost", which is not installed/)
    w.start.blocks = []
    w.start.ending = createKitEnding('ghost', 'x', {})
    expect(only(w.project).join('\n')).toMatch(/the kit ending uses the kit "ghost", which is not installed/)
  })
  it('a kit that is installed but off for this story', () => {
    const w = world()
    w.project.kits = []
    w.start.blocks = [createKitBlock('terminal', 'clear', {})]
    expect(only(w.project)[0]).toMatch(/uses the Terminal kit, which is turned off for this story. Turn it on in the Kits view/)
  })
  it('a kit that failed to load, and a kit turned on that is not installed', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'clear', {})]
    const broken: LoadedKit = { ...terminal(), manifest: null, error: 'kit.json is not valid JSON: x', files: [], templates: {} }
    const messages = only(w.project, { kits: [broken] })
    expect(messages.some((m) => /which could not be loaded \(kit\.json is not valid JSON: x\)/.test(m))).toBe(true)
    expect(messages.some((m) => /The kit "terminal" is turned on but could not be loaded/.test(m))).toBe(true)
    expect(only(w.project, { kits: [] }).some((m) => /turned on for this story but is not installed/.test(m))).toBe(true)
  })
  it('an unknown block or ending type', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'nope', {})]
    w.start.ending = createKitEnding('terminal', 'nope', {})
    const messages = only(w.project)
    expect(messages.some((m) => /uses "nope", which the Terminal kit does not have/.test(m))).toBe(true)
    expect(messages.filter((m) => /does not have/.test(m))).toHaveLength(2)
  })
  it('picks that point at things that are gone or of the wrong kind, and effects that do not fit', () => {
    const w = world()
    const k = terminal()
    const custom: LoadedKit = {
      ...k,
      templates: { ...k.templates, 'templates/print.txt': 'pass' },
      manifest: {
        ...k.manifest!,
        blocks: [
          {
            ...k.manifest!.blocks[0],
            fields: [
              { key: 'v', label: 'Counter', type: 'variable', varType: 'boolean' },
              { key: 'c', label: 'Person', type: 'character' },
              { key: 'a', label: 'Song', type: 'asset', kind: 'music' },
              { key: 'fx', label: 'Changes', type: 'effects' }
            ]
          },
          k.manifest!.blocks[1]
        ]
      }
    }
    w.project.assets.bg = { id: 'bg', kind: 'background', name: 'Hall', file: 'b.png', width: 1, height: 1, bytes: 1 }
    w.start.blocks = [
      createKitBlock('terminal', 'print', { v: w.courage, c: 'gone', a: 'bg', fx: [{ variableId: w.courage, op: 'toggle', value: true }] })
    ]
    const messages = only(w.project, { kits: [custom] })
    expect(messages.some((m) => /needs a true\/false variable for Counter, but Courage is not one/.test(m))).toBe(true)
    expect(messages.some((m) => /has a character pick \(Person\) that no longer exists/.test(m))).toBe(true)
    expect(messages.some((m) => /needs a music file for Song, but Hall is not one/.test(m))).toBe(true)
    expect(messages.some((m) => /flips "Courage", which is not a true\/false variable/.test(m))).toBe(true)
    w.start.blocks = [createKitBlock('terminal', 'print', { v: 'zzz' })]
    expect(only(w.project, { kits: [custom] }).some((m) => /variable pick \(Counter\) that no longer exists/.test(m))).toBe(true)
  })
  it('a template problem is shown on the block, not thrown', () => {
    const w = world()
    const k = terminal()
    const broken: LoadedKit = { ...k, templates: { ...k.templates, 'templates/print.txt': 'a\n{{missing}}' } }
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'x' })]
    const found = validateProject(w.project, { kits: [broken] }).find((p) => p.blockId === w.start.blocks[0].id)
    expect(found?.severity).toBe('error')
    expect(found?.message).toMatch(/\(Terminal: print\) has a problem in its kit template: templates\/print\.txt, line 2: unknown key "missing"/)
    expect(() => compileProject(w.project, { kits: [broken] })).not.toThrow()
    const noFile: LoadedKit = { ...k, templates: {} }
    expect(errorsOf(w.project, { kits: [noFile] })[0]).toMatch(/has no template file "templates\/print\.txt"/)
  })
  it('every exit of a kit ending needs a target', () => {
    const w = world()
    const e = sessionEnding(w, [cmd('c1', 'go', { leaves: true })])
    w.start.ending = e
    const found = validateProject(w.project, ctx()).filter((p) => p.exitId === 'x:c1')
    expect(found[0].message).toBe('"Server room": the exit "go" doesn\'t lead anywhere. Drag its dot to a scene.')
    e.exits[0].target = w.vault.id
    expect(validateProject(w.project, ctx()).filter((p) => p.exitId === 'x:c1')).toEqual([])
  })
  it('what a kit form refers to counts as used', () => {
    const w = world()
    const e = sessionEnding(w, [cmd('c1', 'go', { effects: [{ variableId: w.courage, op: 'add', value: 1 }] })])
    w.start.ending = e
    expect(validateProject(w.project, ctx()).some((p) => /"Courage" is never used/.test(p.message))).toBe(false)
    e.params = { ...e.params, commands: [] }
    expect(validateProject(w.project, ctx()).some((p) => /"Courage" is never used/.test(p.message))).toBe(true)
  })
  it('two kits writing the same file are reported', () => {
    const w = world()
    const k = terminal()
    const twin: LoadedKit = { ...k, id: 'twin', manifest: { ...k.manifest!, id: 'twin' } }
    w.project.kits = ['terminal', 'twin']
    expect(errorsOf(w.project, { kits: [k, twin] }).some((m) => /The kits "terminal" and "twin" both write "terminal\.rpy"/.test(m))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('usage and the turn-off guard', () => {
  it('lists the scenes that use a kit, once each', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'a' }), createKitBlock('terminal', 'print', { text: 'b' })]
    w.start.ending = sessionEnding(w)
    w.vault.blocks = [createKitBlock('terminal', 'clear', {})]
    expect(kitUses(w.project, 'terminal')).toHaveLength(4)
    expect(scenesUsingKit(w.project, 'terminal').map((s) => s.name)).toEqual(['Server room', 'Vault'])
    expect(scenesUsingKit(w.project, 'other')).toEqual([])
    expect([...kitsInUse(w.project)]).toEqual(['terminal'])
  })
  it('kit blocks inside nested blocks are found', () => {
    const w = world()
    w.start.blocks = [{ id: 'if1', type: 'if', condition: { join: 'and', clauses: [] }, then: [createKitBlock('terminal', 'clear', {})], otherwise: [] }]
    expect(kitUses(w.project, 'terminal')).toHaveLength(1)
  })
  it('findUsage counts what a kit form refers to', () => {
    const w = world()
    w.start.ending = sessionEnding(w, [cmd('c1', 'go', { effects: [{ variableId: w.courage, op: 'add', value: 1 }] })])
    expect(findUsage(w.project, ctx()).variables[w.courage]).toHaveLength(1)
    expect(findUsage(w.project, ctx()).variables[w.courage][0].description).toBe('Ending: Terminal session')
    expect(findUsage(w.project).variables[w.courage]).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('edges, map rows and the palette', () => {
  it('a kit ending is a set of named exits with the standard x:<id> handles', () => {
    const w = world()
    const e = sessionEnding(w, [cmd('a1', 'unlock', { leaves: true }), cmd('a2', 'exit', { leaves: true })])
    e.exits[0].target = w.vault.id
    w.start.ending = e
    expect(listExits(w.start, w.project).map((x) => [x.handleId, x.kind, x.label, x.target])).toEqual([
      ['x:a1', 'named', 'unlock', w.vault.id],
      ['x:a2', 'named', 'exit', null]
    ])
    expect(deriveEdges(w.project).filter((x) => x.source === w.start.id)).toEqual([
      { id: `${w.start.id}:x:a1`, source: w.start.id, handle: 'x:a1', target: w.vault.id, label: 'unlock', conditional: false }
    ])
    expect(setExitTarget(w.start, 'x:a2', w.out.id)).toBe(true)
    expect(e.exits[1].target).toBe(w.out.id)
    expect(setExitTarget(w.start, 'x:nope', null)).toBe(false)
  })
  it('the map card lists the exits as rows named after the commands and names the kit ending', () => {
    const w = world()
    w.start.ending = sessionEnding(w, [cmd('a1', 'unlock', { leaves: true })])
    const info = sceneCardInfo(w.start, w.project, ctx())
    expect(info.exits.map((r) => [r.handleId, r.text, r.unset, r.named])).toEqual([['x:a1', 'unlock', true, true]])
    expect(info.kitEnding).toEqual({ name: 'Terminal session', icon: 'terminal' })
    expect(sceneCardInfo(w.start, w.project).kitEnding?.name).toBe('Kit "terminal" is not available')
  })
  it('the palette gets one group per enabled, loaded kit', () => {
    const groups = kitPaletteGroups(ctx(), ['terminal'])
    expect(groups).toHaveLength(1)
    expect(groups[0].kitName).toBe('Terminal')
    expect(groups[0].entries.map((e) => [e.key, e.label, e.kit])).toEqual([
      ['kit:terminal:print', 'Terminal: print', { kitId: 'terminal', blockType: 'print' }],
      ['kit:terminal:clear', 'Terminal: clear', { kitId: 'terminal', blockType: 'clear' }]
    ])
    expect(kitPaletteGroups(ctx(), [])).toEqual([])
    expect(kitPaletteGroups({ kits: [] }, ['terminal'])).toEqual([])
  })
  it('block summaries use the manifest template, and say when the kit is missing', () => {
    const w = world()
    const b = createKitBlock('terminal', 'print', { text: 'Hello there' }) as Extract<Block, { type: 'kit' }>
    expect(summarizeBlock(b, w.project, ctx())).toEqual({ title: 'Terminal: print', detail: 'Terminal prints "Hello there"' })
    b.params = { text: 'x'.repeat(200) }
    expect(summarizeBlock(b, w.project, ctx()).detail.length).toBeLessThanOrEqual(60)
    expect(summarizeBlock(b, w.project)).toEqual({ title: 'Kit', detail: 'Kit "terminal" is not available' })
    expect(summarizeBlock(createKitBlock('terminal', 'clear', {}), w.project, ctx()).detail).toBe('Terminal clears the screen')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('Quick play with kits', () => {
  const run = (w: World) => start(w.project, w.start.id)

  it('kit blocks are skipped and the side panel gets the kit id to explain', () => {
    const w = world()
    w.start.blocks = [createKitBlock('terminal', 'print', { text: 'x' }), { id: 's', type: 'say', characterId: null, text: 'after', voiceAssetId: null }]
    const s = run(w)
    expect(s.line?.text).toBe('after')
    expect(s.skippedKits).toEqual(['terminal'])
  })
  it('a kit ending shows a panel with one button per exit and follows the one picked', () => {
    const w = world()
    const e = sessionEnding(w, [cmd('a1', 'unlock', { leaves: true }), cmd('a2', 'exit', { leaves: true })])
    e.exits[0].target = w.vault.id
    e.exits[1].target = w.out.id
    w.start.ending = e
    let s = run(w)
    expect(s.status).toBe('running')
    expect(s.kitEnding).toEqual({ kitId: 'terminal', endingType: 'session', exits: [{ id: 'a1', text: 'unlock' }, { id: 'a2', text: 'exit' }] })
    expect(step(w.project, s, { type: 'advance' })).toBe(s)
    expect(step(w.project, s, { type: 'exit', exitId: 'nope' })).toBe(s)
    s = step(w.project, s, { type: 'exit', exitId: 'a2' })
    expect(s.sceneId).toBe(w.out.id)
    expect(s.kitEnding).toBeNull()
    expect(s.skippedKits).toEqual([])
  })
  it('a kit ending without exits ends the story with a notice', () => {
    const w = world()
    w.start.ending = sessionEnding(w)
    const s = run(w)
    expect(s.status).toBe('ended')
    expect(s.notice).toBe('This kit ending has no exits to follow')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('store actions for kits', () => {
  const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
  let w: World
  beforeEach(() => {
    useKitStore.getState().set([terminal()])
    w = world()
    w.project.kits = []
    S().loadProject('C:/story', w.project)
  })
  afterEach(() => useKitStore.getState().set([]))
  const scene = (id: string): Scene => S().project!.scenes[id]

  it('setKitEnabled turns a kit on and off, and refuses to turn it off while it is used', () => {
    expect(S().setKitEnabled('terminal', true)).toEqual({ ok: true })
    expect(S().project!.kits).toEqual(['terminal'])
    expect(S().setKitEnabled('terminal', true)).toEqual({ ok: true })
    expect(S().project!.kits).toEqual(['terminal'])
    S().addKitBlockAt(w.start.id, 'terminal', 'clear', [{ i: 0 }])
    const refused = S().setKitEnabled('terminal', false)
    expect(refused).toEqual({ ok: false, scenes: [{ id: w.start.id, name: 'Server room' }] })
    expect(S().project!.kits).toEqual(['terminal'])
    S().deleteBlock(w.start.id, scene(w.start.id).blocks[0].id)
    expect(S().setKitEnabled('terminal', false)).toEqual({ ok: true })
    expect(S().project!.kits).toEqual([])
  })
  it('addKitBlockAt adds a block with the default form values, and refuses unknown kits', () => {
    const r = S().addKitBlockAt(w.start.id, 'terminal', 'print', [{ i: 0 }])
    expect(r.ok).toBe(true)
    expect(scene(w.start.id).blocks[0]).toMatchObject({ type: 'kit', kitId: 'terminal', blockType: 'print', params: { text: '' } })
    expect(S().addKitBlockAt(w.start.id, 'ghost', 'print', [{ i: 0 }])).toEqual({ ok: false, error: 'That kit block is not available.' })
    expect(S().addKitBlockAt(w.start.id, 'terminal', 'print', [])).toEqual({ ok: false, error: 'There is nowhere to put the block there.' })
  })
  it('setKitParams on a block stores the values', () => {
    S().addKitBlockAt(w.start.id, 'terminal', 'print', [{ i: 0 }])
    const id = scene(w.start.id).blocks[0].id
    S().setKitParams(w.start.id, id, { text: 'hello' })
    expect((scene(w.start.id).blocks[0] as Extract<Block, { type: 'kit' }>).params).toEqual({ text: 'hello' })
  })
  it('setKitEnding starts with the defaults and carries the first target to the first exit when there is one', () => {
    S().setExitTarget(w.start.id, 'jump', w.vault.id)
    S().setKitEnding(w.start.id, 'terminal', 'session')
    const e = scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>
    expect(e).toMatchObject({ type: 'kit', kitId: 'terminal', endingType: 'session', exits: [], params: { title: 'TERMINAL', unknown: 'Unknown command.', commands: [] } })
    S().setKitParams(w.start.id, null, { ...e.params, commands: [cmd('a', 'go', { leaves: true })] })
    S().setKitEnding(w.start.id, 'terminal', 'nope')
    expect(scene(w.start.id).ending.type).toBe('kit')
  })
  it('setKitParams on the ending keeps the exits in step with the list', () => {
    S().setKitEnding(w.start.id, 'terminal', 'session')
    const params = (commands: Record<string, unknown>[]): Record<string, unknown> => ({ ...(scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>).params, commands })
    const exits = (): { id: string; name: string; target: string | null }[] => (scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>).exits
    S().setKitParams(w.start.id, null, params([cmd('a', 'unlock', { leaves: true }), cmd('b', 'exit', { leaves: true }), cmd('c', 'help')]))
    expect(exits().map((x) => x.name)).toEqual(['unlock', 'exit'])
    S().setExitTarget(w.start.id, 'x:a', w.vault.id)
    S().setExitTarget(w.start.id, 'x:b', w.out.id)
    S().setKitParams(w.start.id, null, params([cmd('a', 'open', { leaves: true }), cmd('b', 'exit', { leaves: true }), cmd('c', 'help')]))
    expect(exits()).toEqual([
      { id: 'a', name: 'open', target: w.vault.id },
      { id: 'b', name: 'exit', target: w.out.id }
    ])
    S().setKitParams(w.start.id, null, params([cmd('b', 'exit', { leaves: true })]))
    expect(exits()).toEqual([{ id: 'b', name: 'exit', target: w.out.id }])
    S().setKitParams(w.start.id, null, params([cmd('b', 'exit', { leaves: false })]))
    expect(exits()).toEqual([])
  })
  it('setEndingType moves a kit ending to another kind and keeps the first target; jump to kit and back', () => {
    S().setKitEnding(w.start.id, 'terminal', 'session')
    const e = scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>
    S().setKitParams(w.start.id, null, { ...e.params, commands: [cmd('a', 'go', { leaves: true })] })
    S().setExitTarget(w.start.id, 'x:a', w.out.id)
    S().setEndingType(w.start.id, 'jump')
    expect(scene(w.start.id).ending).toEqual({ type: 'jump', target: w.out.id })
    S().setEndingType(w.start.id, 'choice')
    S().setKitEnding(w.start.id, 'terminal', 'session')
    expect(scene(w.start.id).ending.type).toBe('kit')
  })
  it('duplicating a scene keeps every exit linked to its list item and its target', () => {
    S().setKitEnding(w.start.id, 'terminal', 'session')
    const e = scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>
    S().setKitParams(w.start.id, null, { ...e.params, commands: [cmd('a', 'go', { leaves: true })] })
    S().setExitTarget(w.start.id, 'x:a', w.out.id)
    const copyId = S().duplicateScene(w.start.id) as string
    const copy = scene(copyId).ending as Extract<Ending, { type: 'kit' }>
    expect(copy.exits).toHaveLength(1)
    expect(copy.exits[0].id).not.toBe('a')
    expect(copy.exits[0].target).toBe(w.out.id)
    expect((copy.params.commands as { id: string }[])[0].id).toBe(copy.exits[0].id)
    expect(syncKitExits(copy, terminal())).toEqual(copy.exits)
  })
  it('cloneWithNewIds maps the same old id to the same new id', () => {
    const c = cloneWithNewIds({ a: { id: 'x' }, b: [{ id: 'x' }, { id: 'y' }] })
    expect(c.a.id).toBe(c.b[0].id)
    expect(c.b[0].id).not.toBe(c.b[1].id)
    expect(c.a.id).not.toBe('x')
  })
  it('undo brings back the exits together with the params', () => {
    S().setKitEnding(w.start.id, 'terminal', 'session')
    useProjectStore.temporal.getState().clear()
    const e = scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>
    S().setKitParams(w.start.id, null, { ...e.params, commands: [cmd('a', 'go', { leaves: true })] })
    expect((scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>).exits).toHaveLength(1)
    useProjectStore.temporal.getState().undo()
    expect((scene(w.start.id).ending as Extract<Ending, { type: 'kit' }>).exits).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('exporting kit files', () => {
  let work: string
  let editor: string
  let renpy: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'fabula-kit-export-'))
    editor = join(work, 'editor')
    renpy = join(work, 'game-project')
    mkdirSync(editor, { recursive: true })
    mkdirSync(join(renpy, 'game'), { recursive: true })
    writeFileSync(join(renpy, 'game', 'options.rpy'), 'define config.name = _("Old")\n')
  })
  afterEach(() => rmSync(work, { recursive: true, force: true }))

  const story = (): Project => {
    const w = world()
    w.project.renpyProjectDir = renpy
    w.start.ending = { type: 'end' }
    w.start.blocks = [createKitBlock('terminal', 'clear', {})]
    return w.project
  }

  it('writes the kit file, lists it in the manifest, and removes it again when the kit is turned off', () => {
    const p = story()
    const r = exportProject(editor, p, { kits: [terminal()] })
    expect(r.ok).toBe(true)
    expect(readFileSync(join(renpy, 'game', 'terminal.rpy'), 'utf8')).toBe(terminal().files[0].content)
    expect(JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')).files).toContain('terminal.rpy')
    writeFileSync(join(renpy, 'game', 'terminal.rpyc'), 'compiled')
    p.scenes[p.startSceneId as string].blocks = []
    p.kits = []
    const again = exportProject(editor, p, { kits: [terminal()] })
    expect(again.ok).toBe(true)
    expect(existsSync(join(renpy, 'game', 'terminal.rpy'))).toBe(false)
    expect(existsSync(join(renpy, 'game', 'terminal.rpyc'))).toBe(false)
    expect(JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')).files).not.toContain('terminal.rpy')
  })
  it('an enabled kit that nothing uses is still exported, unless it says onlyWhenUsed', () => {
    const p = story()
    p.scenes[p.startSceneId as string].blocks = []
    expect(exportProject(editor, p, { kits: [terminal()] }).ok).toBe(true)
    expect(existsSync(join(renpy, 'game', 'terminal.rpy'))).toBe(true)
    const k = terminal()
    const lazy: LoadedKit = { ...k, manifest: { ...k.manifest!, onlyWhenUsed: true } }
    expect(exportProject(editor, p, { kits: [lazy] }).ok).toBe(true)
    expect(existsSync(join(renpy, 'game', 'terminal.rpy'))).toBe(false)
  })
  it('backs up a terminal.rpy the author wrote before replacing it', () => {
    writeFileSync(join(renpy, 'game', 'terminal.rpy'), 'mine = 1\n')
    exportProject(editor, story(), { kits: [terminal()], now: () => new Date(2026, 0, 2, 3, 4, 5) })
    expect(readFileSync(join(editor, 'backups', '20260102-030405', 'terminal.rpy'), 'utf8')).toBe('mine = 1\n')
  })
  it('refuses to export a story that uses a kit that is not installed, and writes nothing', () => {
    const p = story()
    const r = exportProject(editor, p, { kits: [] })
    expect(r.ok).toBe(false)
    expect(existsSync(join(renpy, 'game', 'terminal.rpy'))).toBe(false)
  })
  it('reads the kits itself from the built-in folder and the story kits folder', () => {
    const p = story()
    const r = exportProject(editor, p, { builtInKitsDir: BUILT_IN_KITS_DIR })
    expect(r.ok).toBe(true)
    expect(existsSync(join(renpy, 'game', 'terminal.rpy'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('the kit system is generic', () => {
  let work: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'fabula-generic-'))
  })
  afterEach(() => rmSync(work, { recursive: true, force: true }))

  it('a copy of the Terminal kit with another id and another label is a second working kit', () => {
    const story = join(work, 'story')
    const copy = join(story, 'kits', 'console')
    cpSync(join(BUILT_IN_KITS_DIR, 'terminal'), copy, { recursive: true })
    const manifest = JSON.parse(readFileSync(join(copy, 'kit.json'), 'utf8'))
    manifest.id = 'console'
    manifest.name = 'Console'
    manifest.files[0].to = 'console.rpy'
    manifest.endings[0].name = 'Console session'
    manifest.endings[0].type = 'shell'
    manifest.endings[0].fields.find((f: { key: string }) => f.key === 'commands').label = 'Things to type'
    writeFileSync(join(copy, 'kit.json'), JSON.stringify(manifest, null, 2))
    const session = readFileSync(join(copy, 'templates', 'session.txt'), 'utf8').replaceAll('terminal_', 'console_')
    writeFileSync(join(copy, 'templates', 'session.txt'), session)
    const kits = listKits(story, BUILT_IN_KITS_DIR)
    expect(kits.map((k) => [k.id, k.error])).toEqual([
      ['console', null],
      ['terminal', null]
    ])

    const w = world()
    w.project.kits = ['console']
    const def = findEndingDef(kits[0], 'shell')!
    const e = createKitEnding('console', 'shell', { ...defaultParams(def.fields), commands: [cmd('a1', 'open', { leaves: true })] }) as Extract<Ending, { type: 'kit' }>
    e.exits = syncKitExits(e, kits[0])
    e.exits[0].target = w.vault.id
    w.start.ending = e
    w.start.blocks = [createKitBlock('console', 'print', { text: 'hi' })]
    expect(validateProject(w.project, { kits }).filter((p) => p.severity === 'error')).toEqual([])
    const out = compileProject(w.project, { kits })
    expect(out.files.map((f) => f.path)).toEqual(['script.rpy', 'console.rpy'])
    expect(out.files[0].content).toContain('    $ console_open("TERMINAL", [], "> ")\n')
    expect(out.files[0].content).toContain('        elif command == "open":\n            $ console_print("open reply")\n            $ console_close()\n            jump vault\n')
    expect(listExits(w.start, w.project).map((x) => x.handleId)).toEqual(['x:a1'])
  })

  it('no editor code mentions the Terminal kit by name', () => {
    const hits: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) walk(full)
        else if (/\.(ts|tsx|css|html|json)$/.test(name) && /terminal/i.test(readFileSync(full, 'utf8'))) hits.push(full)
      }
    }
    walk(join(__dirname, '..', 'src'))
    expect(hits).toEqual([])
  })
})

describe('createCompileContext', () => {
  it('renders a part without a compile, for tools that want to look at one template', () => {
    const w = world()
    const base = createCompileContext(w.project, ctx())
    const def = findBlockDef(terminal(), 'print')!
    const r = renderKitPart(terminal(), def.template, def.fields, { text: 'x' }, base)
    expect(r).toEqual({ ok: true, text: '$ terminal_print("x")' })
  })
})
