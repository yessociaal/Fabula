import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { compileSceneScript, sceneScriptFrom } from '@shared/compiler/sceneScript'
import { findCodeRefs, firstCodeLine, mentionsLeaving, replaceCodeRefs } from '@shared/codeRefs'
import { deriveEdges, listExits, sceneSuccessors, setExitTarget } from '@shared/edges'
import { createBlock, createChapter, createNamedExit, createProject, createScene, createVariable } from '@shared/factory'
import { CODE_BLOCK_NOTICE, start, step } from '@shared/interpreter'
import type { Block, Ending, Project, Scene } from '@shared/model'
import { parseProject } from '@shared/schema'
import {
  nextScriptFileName,
  scriptFileNameProblem,
  scriptFilePath,
  scriptFileProblems,
  storyHasCode,
  usableScriptFiles
} from '@shared/scriptFiles'
import { validateProject } from '@shared/validate'
import { exportProject } from '../src/main/exporter'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'
import { summarizeBlock } from '../src/renderer/views/SceneEditor/blockSummaries'
import { buildExitRows, sceneCardInfo } from '../src/renderer/views/StoryMap/mapModel'

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()

/** A story with a start scene, a "Forest" and a "Cellar" scene, and a variable. */
function world(keepJump = false) {
  const project = createProject('T')
  const start = project.scenes[project.startSceneId as string]
  const forest = createScene({ x: 0, y: 100 }, 'Forest')
  const cellar = createScene({ x: 0, y: 200 }, 'Cellar')
  for (const s of [forest, cellar]) {
    s.ending = { type: 'end' }
    project.scenes[s.id] = s
  }
  if (!keepJump) start.ending = { type: 'end' }
  const v = createVariable('Courage', 'number')
  project.variables[v.id] = v
  project.variableOrder.push(v.id)
  return { project, start, forest, cellar }
}

const code = (text: string, id = 'cb'): Block => ({ id, type: 'code', code: text })
const say = (text: string): Block => ({ id: `s_${text}`, type: 'say', characterId: null, text, voiceAssetId: null })

/** The statements of the start scene as lines, without the label line. */
function body(project: Project, scene: Scene): string[] {
  const out = compileProject(project)
  const file = out.files[0].content.split('\n')
  const at = out.sceneLocations[scene.id].line
  const rest = file.slice(at)
  return rest
}

const errors = (p: Project): string[] => validateProject(p).filter((x) => x.severity === 'error').map((x) => x.message)
const warnings = (p: Project): string[] => validateProject(p).filter((x) => x.severity === 'warning').map((x) => x.message)

// ---------------------------------------------------------------------------------------------------------------
describe('@scene() and @exit() references', () => {
  it('finds known and unknown names', () => {
    const refs = findCodeRefs('a @scene(Forest) b @scene(Nope) c @scene(', 'scene', ['Forest', 'Cellar'])
    expect(refs.map((r) => [r.name, r.known])).toEqual([
      ['Forest', true],
      ['Nope', false],
      ['', false]
    ])
  })
  it('a name may contain brackets, and the longest name wins', () => {
    const names = ['Act (1)', 'Act', 'Act (1) tour']
    expect(findCodeRefs('x @scene(Act (1)) y', 'scene', names).map((r) => [r.name, r.known])).toEqual([['Act (1)', true]])
    expect(findCodeRefs('@scene(Act (1) tour)', 'scene', names).map((r) => r.name)).toEqual(['Act (1) tour'])
    expect(findCodeRefs('@scene(Act)', 'scene', names).map((r) => r.name)).toEqual(['Act'])
  })
  it('replaces only known references and leaves the rest of the text alone', () => {
    const text = 'call @scene(Forest)  \n\t@scene(Nope)\n@exit(Forest) @scene(Forest)'
    const out = replaceCodeRefs(text, 'scene', ['Forest'], (n) => (n === 'Forest' ? 'forest_label' : null))
    expect(out).toBe('call forest_label  \n\t@scene(Nope)\n@exit(Forest) forest_label')
  })
  it('text without a reference comes back identical', () => {
    const text = '  $ a = "@scene" + \'@exit\'\t\n\n'
    expect(replaceCodeRefs(text, 'scene', ['A'], () => 'x')).toBe(text)
  })
  it('first line and the leaving heuristic', () => {
    expect(firstCodeLine('\n  \n   $ x = 1   \nmore')).toBe('$ x = 1')
    expect(firstCodeLine('  \n')).toBe('')
    expect(mentionsLeaving('if a:\n    jump b')).toBe(true)
    expect(mentionsLeaving('$ jumpy = 1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('compiler: code block', () => {
  it('emits the lines verbatim with the indentation of the label body', () => {
    const w = world()
    w.start.blocks = [say('before'), code('$ x = 1\n\n$ y = x + 2   \nif x:\n\tpass'), say('after')]
    w.start.ending = { type: 'end' }
    expect(body(w.project, w.start).slice(0, 13)).toEqual([
      '',
      '    "before"',
      '',
      '    $ x = 1',
      '',
      '    $ y = x + 2   ',
      '    if x:',
      '    	pass',
      '',
      '    "after"',
      '',
      '    return',
      ''
    ])
  })

  it('blank lines stay empty (no trailing spaces are added)', () => {
    const w = world()
    w.start.blocks = [code('a\n\nb')]
    w.start.ending = { type: 'end' }
    const lines = body(w.project, w.start)
    expect(lines.slice(0, 5)).toEqual(['', '    a', '', '    b', ''])
    expect(compileProject(w.project).files[0].content).not.toMatch(/ \n\n/)
  })

  it('replaces @scene(Name) by the label of that scene', () => {
    const w = world()
    w.start.blocks = [code('call @scene(Cellar)\n$ x = "@scene(Forest)"')]
    const text = compileProject(w.project).files[0].content
    expect(text).toContain('    call cellar\n    $ x = "forest"\n')
  })

  it('uses a locked label when the scene has one', () => {
    const w = world()
    w.cellar.labelLock = 'after_load'
    w.start.blocks = [code('jump @scene(Cellar)')]
    expect(compileProject(w.project).files[0].content).toContain('    jump after_load\n')
  })

  it('an unknown or ambiguous name stays as typed (the validator blocks the export)', () => {
    const w = world()
    const twin = createScene({ x: 0, y: 300 }, 'Forest')
    twin.ending = { type: 'end' }
    w.project.scenes[twin.id] = twin
    w.start.blocks = [code('jump @scene(Forest)\njump @scene(Nowhere)')]
    const text = compileProject(w.project).files[0].content
    expect(text).toContain('    jump @scene(Forest)\n    jump @scene(Nowhere)\n')
  })

  it('an empty code block emits nothing', () => {
    const w = world()
    w.start.blocks = [code(''), code('   \n  '), say('x')]
    w.start.ending = { type: 'end' }
    expect(body(w.project, w.start).slice(0, 4)).toEqual(['', '    "x"', '', '    return'])
  })

  it('inside an If the lines are indented one level deeper, blank lines still empty', () => {
    const w = world()
    const cond = { join: 'and' as const, clauses: [{ id: 'c1', variableId: Object.keys(w.project.variables)[0], op: 'gt' as const, value: 1 }] }
    const inner: Block = { id: 'if1', type: 'if', condition: cond, then: [code('a\n\n  b   ')], otherwise: [] }
    w.start.blocks = [inner]
    w.start.ending = { type: 'end' }
    const lines = body(w.project, w.start)
    expect(lines.slice(0, 6)).toEqual(['', '    if courage > 1:', '        a', '', '          b   ', ''])
  })

  it('keeps tabs, trailing spaces, unicode and carriage returns exactly', () => {
    const w = world()
    w.start.blocks = [code('\t$ é = "日本語 😀"  \t\r\nx')]
    w.start.ending = { type: 'end' }
    expect(compileProject(w.project).files[0].content).toContain('    \t$ é = "日本語 😀"  \t\r\n    x\n')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('compiler: the verbatim guarantee (property style)', () => {
  /** A small seeded generator so a failure can be replayed. */
  function rng(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const ALPHABET = ['a', 'Z', '0', '_', '$', '=', '(', ')', '"', "'", '#', ':', ' ', ' ', ' ', '\t', '\n', '\n', 'é', 'ß', '日', '本', '😀', '\u00a0', '\\', '@', '{', '[', '%']
  function randomText(next: () => number): string {
    const n = Math.floor(next() * 80)
    let out = ''
    for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(next() * ALPHABET.length)]
    return out
  }
  const pad = (line: string, indent: string): string => (line === '' ? '' : indent + line)

  it('random text survives a code block: every line comes back unchanged minus the indentation', () => {
    const next = rng(12345)
    for (let k = 0; k < 300; k++) {
      let text = randomText(next)
      if (text.trim() === '') text = `x${text}`
      const w = world()
      w.start.blocks = [code(text)]
      w.start.ending = { type: 'end' }
      const lines = compileProject(w.project).files[0].content.split('\n')
      const at = compileProject(w.project).sceneLocations[w.start.id].line
      // label line, blank line, then the code lines
      const out = lines.slice(at + 1, at + 1 + text.split('\n').length)
      expect(out, JSON.stringify(text)).toEqual(text.split('\n').map((l) => pad(l, '    ')))
    }
  })

  it('random text survives a code ending in the same way', () => {
    const next = rng(777)
    for (let k = 0; k < 300; k++) {
      let text = randomText(next)
      if (text.trim() === '') text = `x${text}`
      const w = world()
      w.start.blocks = []
      w.start.ending = { type: 'code', code: text, exits: [] }
      const lines = compileProject(w.project).files[0].content.split('\n')
      const at = compileProject(w.project).sceneLocations[w.start.id].line
      const out = lines.slice(at + 1, at + 1 + text.split('\n').length)
      expect(out, JSON.stringify(text)).toEqual(text.split('\n').map((l) => pad(l, '    ')))
    }
  })

  it('random script files are written byte for byte', () => {
    const next = rng(99)
    for (let k = 0; k < 100; k++) {
      const text = randomText(next)
      const w = world()
      w.project.scriptFiles = [{ id: 'f', name: 'extras', content: text }]
      const written = compileProject(w.project).files.find((f) => f.path === 'extras.rpy')
      expect(written?.content).toBe(text)
    }
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('compiler: code ending', () => {
  it('prints the code verbatim and replaces @exit(name) by the label of its target', () => {
    const w = world()
    w.start.ending = {
      type: 'code',
      code: 'if courage > 0:\n    jump @exit(left)\n\nelse:\n    jump @exit(right)  ',
      exits: [createNamedExit('left', w.forest.id), createNamedExit('right', w.cellar.id)]
    }
    const lines = body(w.project, w.start)
    expect(lines.slice(0, 7)).toEqual(['', '    if courage > 0:', '        jump forest', '', '    else:', '        jump cellar  ', ''])
  })
  it('an exit without a target keeps its @exit() text, and an unknown name stays too', () => {
    const w = world()
    w.start.ending = { type: 'code', code: 'jump @exit(a)\njump @exit(zzz)', exits: [createNamedExit('a', null)] }
    expect(compileProject(w.project).files[0].content).toContain('    jump @exit(a)\n    jump @exit(zzz)\n')
  })
  it('two exits with the same name are not replaced (ambiguous)', () => {
    const w = world()
    w.start.ending = { type: 'code', code: 'jump @exit(a)', exits: [createNamedExit('a', w.forest.id), createNamedExit('a', w.cellar.id)] }
    expect(compileProject(w.project).files[0].content).toContain('    jump @exit(a)\n')
  })
  it('empty code emits nothing and nothing follows the code', () => {
    const w = world()
    w.start.blocks = [say('x')]
    w.start.ending = { type: 'code', code: '', exits: [] }
    expect(body(w.project, w.start).slice(0, 3)).toEqual(['', '    "x"', ''])
  })
  it('compiling twice gives the same bytes', () => {
    const w = world()
    w.start.blocks = [code('$ a = 1  ')]
    w.start.ending = { type: 'code', code: 'jump @exit(f)', exits: [createNamedExit('f', w.forest.id)] }
    expect(compileProject(w.project)).toEqual(compileProject(w.project))
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('compiler: script files', () => {
  it('writes each file unchanged to <name>.rpy and adds .rpy when it is missing', () => {
    const w = world()
    w.project.scriptFiles = [
      { id: 'a', name: 'extras', content: 'screen x():\n    text "hi"' },
      { id: 'b', name: 'more.rpy', content: 'define a = 1\n\n\n' },
      { id: 'c', name: 'Caps.RPY', content: '' }
    ]
    const out = compileProject(w.project)
    expect(out.files.map((f) => f.path)).toEqual(['script.rpy', 'extras.rpy', 'more.rpy', 'Caps.rpy'])
    expect(out.files[1].content).toBe('screen x():\n    text "hi"')
    expect(out.files[2].content).toBe('define a = 1\n\n\n')
    expect(out.files[3].content).toBe('')
  })
  it('does not change the scene locations or the generated files', () => {
    const w = world()
    const before = compileProject(w.project)
    w.project.scriptFiles = [{ id: 'a', name: 'extras', content: 'x' }]
    const after = compileProject(w.project)
    expect(after.sceneLocations).toEqual(before.sceneLocations)
    expect(after.files[0]).toEqual(before.files[0])
  })
  it('skips a file with an illegal name, a reserved name, a chapter file name or a repeated name', () => {
    const w = world()
    const ch = createChapter('Act One')
    w.project.chapters[ch.id] = ch
    w.project.chapterOrder.push(ch.id)
    w.forest.chapterId = ch.id
    w.project.scriptFiles = [
      { id: '1', name: 'screens', content: 'x' },
      { id: '2', name: 'GUI', content: 'x' },
      { id: '3', name: 'options.rpy', content: 'x' },
      { id: '4', name: 'script', content: 'x' },
      { id: '5', name: 'act_one', content: 'x' },
      { id: '6', name: 'bad name', content: 'x' },
      { id: '7', name: '../up', content: 'x' },
      { id: '8', name: 'good', content: 'first' },
      { id: '9', name: 'GOOD', content: 'second' }
    ]
    expect(compileProject(w.project).files.map((f) => f.path)).toEqual(['script.rpy', 'act_one.rpy', 'good.rpy'])
    expect(compileProject(w.project).files[2].content).toBe('first')
    expect(usableScriptFiles(w.project).map((f) => f.id)).toEqual(['8'])
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('script file names', () => {
  it('accepts plain names and refuses the rest, with a reason', () => {
    const w = world()
    expect(scriptFileNameProblem(w.project, 'extras')).toBeNull()
    expect(scriptFileNameProblem(w.project, 'my-file_2.rpy')).toBeNull()
    expect(scriptFileNameProblem(w.project, '')).toMatch(/Type a file name/)
    expect(scriptFileNameProblem(w.project, '.rpy')).toMatch(/Type a file name/)
    for (const bad of ['a b', 'a.b', 'a/b', 'a\\b', '_x', '-x', 'é', 'a:b', 'a*', 'x'.repeat(61)]) {
      expect(scriptFileNameProblem(w.project, bad), bad).not.toBeNull()
    }
    expect(scriptFileNameProblem(w.project, 'NUL')).toMatch(/Windows/)
    expect(scriptFileNameProblem(w.project, 'com1.rpy')).toMatch(/Windows/)
  })
  it('refuses generated files and gui / screens / options / interface in any letter case', () => {
    const w = world()
    const ch = createChapter('Act One')
    w.project.chapters[ch.id] = ch
    w.project.chapterOrder.push(ch.id)
    for (const bad of ['script', 'Script.rpy', 'gui', 'GUI', 'screens', 'Options', 'interface', 'act_one', 'ACT_ONE.rpy']) {
      expect(scriptFileNameProblem(w.project, bad), bad).toMatch(/already uses/)
    }
  })
  it('refuses a name another script file has, but not its own name when renaming', () => {
    const w = world()
    w.project.scriptFiles = [{ id: 'a', name: 'extras', content: '' }]
    expect(scriptFileNameProblem(w.project, 'Extras.rpy')).toMatch(/Another script file/)
    expect(scriptFileNameProblem(w.project, 'Extras.rpy', 'a')).toBeNull()
  })
  it('scriptFilePath and nextScriptFileName', () => {
    const w = world()
    expect(scriptFilePath(' x.RPY ')).toBe('x.rpy')
    expect(nextScriptFileName(w.project)).toBe('my_script')
    w.project.scriptFiles = [{ id: 'a', name: 'my_script', content: '' }]
    expect(nextScriptFileName(w.project)).toBe('my_script_2')
  })
  it('scriptFileProblems reports the later one of two equal names', () => {
    const w = world()
    w.project.scriptFiles = [
      { id: 'a', name: 'x', content: '' },
      { id: 'b', name: 'X.rpy', content: '' }
    ]
    const problems = scriptFileProblems(w.project)
    expect(problems.map((p) => p.file.id)).toEqual(['b'])
    expect(problems[0].message).toMatch(/Two script files are both called "x.rpy"/)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('edges and exits of a code ending', () => {
  function forked() {
    const w = world()
    const left = createNamedExit('left', w.forest.id)
    const right = createNamedExit('right', w.cellar.id)
    w.start.ending = { type: 'code', code: 'if courage > 0:\n    jump @exit(left)\njump @exit(right)', exits: [left, right] }
    return { ...w, left, right }
  }
  it('listExits gives one named exit per exit, handle x:<id>', () => {
    const w = forked()
    expect(listExits(w.start)).toEqual([
      { handleId: `x:${w.left.id}`, kind: 'named', label: 'left', target: w.forest.id, conditional: false },
      { handleId: `x:${w.right.id}`, kind: 'named', label: 'right', target: w.cellar.id, conditional: false }
    ])
  })
  it('deriveEdges draws two solid arrows labelled with the exit names', () => {
    const w = forked()
    const edges = deriveEdges(w.project).filter((e) => e.source === w.start.id)
    expect(edges.map((e) => [e.handle, e.target, e.label, e.conditional])).toEqual([
      [`x:${w.left.id}`, w.forest.id, 'left', false],
      [`x:${w.right.id}`, w.cellar.id, 'right', false]
    ])
  })
  it('an exit without a target draws no arrow', () => {
    const w = forked()
    if (w.start.ending.type === 'code') w.start.ending.exits[1].target = null
    expect(deriveEdges(w.project).filter((e) => e.source === w.start.id)).toHaveLength(1)
  })
  it('setExitTarget works on x:<id> and refuses an unknown exit', () => {
    const w = forked()
    expect(setExitTarget(w.start, `x:${w.left.id}`, w.cellar.id)).toBe(true)
    expect(listExits(w.start)[0].target).toBe(w.cellar.id)
    expect(setExitTarget(w.start, 'x:nope', null)).toBe(false)
  })
  it('exits count for reachability', () => {
    const w = forked()
    expect(sceneSuccessors(w.project, w.start.id)).toEqual([w.forest.id, w.cellar.id])
    expect(warnings(w.project).some((m) => m.includes('no path from the start scene'))).toBe(false)
  })
  it('the map card shows one named row per exit, an unset one in red, and says it is code', () => {
    const w = forked()
    if (w.start.ending.type === 'code') {
      w.start.ending.exits[1].target = null
      w.start.ending.exits.push(createNamedExit('  ', w.forest.id))
    }
    const rows = buildExitRows(w.start, w.project)
    expect(rows.map((r) => [r.text, r.unset, r.named, r.ifTag])).toEqual([
      ['left', false, true, false],
      ['right', true, true, false],
      ['Untitled exit', false, true, false]
    ])
    expect(sceneCardInfo(w.start, w.project)).toMatchObject({ codeEnding: true, isEnd: false })
    expect(sceneCardInfo(w.forest, w.project).codeEnding).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('validation: code block', () => {
  it('@scene() with an unknown name is an error; a known one is fine', () => {
    const w = world()
    w.start.blocks = [code('jump @scene(Nowhere)', 'cb1')]
    w.start.ending = { type: 'end' }
    const found = validateProject(w.project).filter((p) => p.severity === 'error')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ sceneId: w.start.id, blockId: 'cb1' })
    expect(found[0].message).toBe(`"Start": the Ren'Py code block (block 1) mentions @scene(Nowhere), but no scene has that name. Use the exact name of a scene.`)
    ;(w.start.blocks[0] as { code: string }).code = 'jump @scene(Forest)'
    expect(errors(w.project)).toEqual([])
  })
  it('a name shared by two scenes is an error', () => {
    const w = world()
    const twin = createScene({ x: 0, y: 300 }, 'Forest')
    twin.ending = { type: 'end' }
    w.project.scenes[twin.id] = twin
    w.start.blocks = [code('jump @scene(Forest)')]
    expect(errors(w.project)).toEqual([
      `"Start": the Ren'Py code block (block 1) mentions @scene(Forest), but 2 scenes are named "Forest". Rename one so the name is unique.`
    ])
    twin.name = 'Forest 2'
    expect(errors(w.project)).toEqual([])
  })
  it('the scene name must match exactly (case counts)', () => {
    const w = world()
    w.start.blocks = [code('jump @scene(forest)')]
    expect(errors(w.project)).toHaveLength(1)
  })
  it('a code block nested in an If is checked too', () => {
    const w = world()
    w.start.blocks = [
      {
        id: 'if1',
        type: 'if',
        condition: { join: 'and', clauses: [{ id: 'k', variableId: Object.keys(w.project.variables)[0], op: 'eq', value: 1 }] },
        then: [code('@scene(Nope)', 'deep')],
        otherwise: []
      }
    ]
    const found = validateProject(w.project).filter((p) => p.blockId === 'deep')
    expect(found).toHaveLength(1)
    expect(found[0].message).toContain('(block 1.1)')
  })
})

describe('validation: code ending', () => {
  function withEnding(ending: Ending) {
    const w = world()
    w.start.ending = ending
    return w
  }
  it('an exit with no target is an error (and not when it has one)', () => {
    const x = createNamedExit('a', null)
    const w = withEnding({ type: 'code', code: 'jump @exit(a)', exits: [x] })
    const found = validateProject(w.project).filter((p) => p.severity === 'error')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ sceneId: w.start.id, exitId: `x:${x.id}` })
    expect(found[0].message).toBe(`"Start": the exit "a" doesn't lead anywhere. Drag its dot to a scene.`)
    x.target = w.forest.id
    expect(errors(w.project)).toEqual([])
  })
  it('an empty exit name is an error', () => {
    const w = withEnding({ type: 'code', code: 'return', exits: [createNamedExit('  ', null)] })
    expect(errors(w.project)).toContain(`"Start": an exit of the code ending has no name. Give it a name, or delete it.`)
    const x = createNamedExit('ok', null)
    const w2 = withEnding({ type: 'code', code: 'jump @exit(ok)', exits: [x] })
    x.target = w2.forest.id
    expect(errors(w2.project).some((m) => m.includes('no name'))).toBe(false)
  })
  it('two exits with the same name are an error, reported once', () => {
    const a = createNamedExit('same', null)
    const b = createNamedExit('same', null)
    const w = withEnding({ type: 'code', code: 'jump @exit(same)', exits: [a, b] })
    a.target = w.forest.id
    b.target = w.cellar.id
    expect(errors(w.project)).toEqual([`"Start": two exits of the code ending are both called "same". Give each exit its own name.`])
    b.name = 'other'
    expect(errors(w.project)).toEqual([])
  })
  it('@exit(name) that is not defined is an error', () => {
    const x = createNamedExit('a', null)
    const w = withEnding({ type: 'code', code: 'jump @exit(a)\njump @exit(b)', exits: [x] })
    x.target = w.forest.id
    expect(errors(w.project)).toEqual([
      `"Start": the code of the ending uses @exit(b), but the ending has no exit with that name. Add an exit called "b" or fix the name.`
    ])
    ;(w.start.ending as { code: string }).code = 'jump @exit(a)'
    expect(errors(w.project)).toEqual([])
  })
  it('a defined exit that the code never uses is a warning', () => {
    const a = createNamedExit('a', null)
    const b = createNamedExit('b', null)
    const w = withEnding({ type: 'code', code: 'jump @exit(a)', exits: [a, b] })
    a.target = w.forest.id
    b.target = w.cellar.id
    expect(errors(w.project)).toEqual([])
    expect(warnings(w.project).filter((m) => m.includes('never used in the code'))).toEqual([
      `"Start": the exit "b" is never used in the code of the ending, so nothing will follow its arrow. Use @exit(b) in the code or delete the exit.`
    ])
    ;(w.start.ending as { code: string }).code = 'jump @exit(a)\njump @exit(b)'
    expect(warnings(w.project).some((m) => m.includes('never used in the code'))).toBe(false)
  })
  it('no exits and no return or jump is a fall-through warning', () => {
    const w = withEnding({ type: 'code', code: '$ x = 1', exits: [] })
    expect(warnings(w.project)).toContain(
      `"Start": the code of the ending has no exits and no return or jump, so this scene might fall through into whatever comes next.`
    )
    ;(w.start.ending as { code: string }).code = '$ x = 1\nreturn'
    expect(warnings(w.project).some((m) => m.includes('fall through'))).toBe(false)
    ;(w.start.ending as { code: string }).code = 'jump somewhere_of_mine'
    expect(warnings(w.project).some((m) => m.includes('fall through'))).toBe(false)
  })
  it('a splash screen scene may not use a code ending', () => {
    const w = withEnding({ type: 'code', code: 'return', exits: [] })
    w.forest.role = 'splashscreen'
    w.forest.ending = { type: 'code', code: 'return', exits: [] }
    expect(errors(w.project).some((m) => m.includes('splash screen scene must finish'))).toBe(true)
  })
})

describe('validation: script files', () => {
  it('a bad name is an error and a good one is not', () => {
    const w = world()
    w.project.scriptFiles = [{ id: 'a', name: 'my file', content: '' }]
    expect(errors(w.project)).toHaveLength(1)
    expect(errors(w.project)[0]).toMatch(/^The script file "my file" can't be exported: /)
    w.project.scriptFiles[0].name = 'my_file'
    expect(errors(w.project)).toEqual([])
  })
  it('a name that collides with a generated file is an error', () => {
    const w = world()
    w.project.scriptFiles = [{ id: 'a', name: 'script', content: '' }]
    expect(errors(w.project)[0]).toMatch(/already uses/)
    w.project.scriptFiles = [{ id: 'a', name: 'gui.rpy', content: '' }]
    expect(errors(w.project)[0]).toMatch(/already uses/)
    w.project.scriptFiles = [{ id: 'a', name: 'screens', content: '' }]
    expect(errors(w.project)[0]).toMatch(/already uses/)
  })
  it('two script files with the same name are an error', () => {
    const w = world()
    w.project.scriptFiles = [
      { id: 'a', name: 'dup', content: '' },
      { id: 'b', name: 'DUP.rpy', content: '' }
    ]
    expect(errors(w.project)).toEqual([`The script file "DUP.rpy" can't be exported: Two script files are both called "dup.rpy". Rename one of them.`])
    w.project.scriptFiles[1].name = 'other'
    expect(errors(w.project)).toEqual([])
  })
  it('code in a script file is not scanned for variables or assets', () => {
    const w = world()
    w.project.scriptFiles = [{ id: 'a', name: 'uses', content: '$ courage = 1' }]
    expect(warnings(w.project)).toContain('The variable "Courage" is never used in any scene.')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('the demo fixture with the Phase 12 additions', () => {
  function load(): Project {
    const parsed = parseProject(readFileSync(new URL('./fixtures/demo.fabula.json', import.meta.url), 'utf8'))
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.project
  }
  it('validates with only the deliberate error, and nothing new in the warnings about code', () => {
    const p = load()
    expect(validateProject(p).filter((x) => x.severity === 'error').map((x) => [x.sceneId, x.exitId])).toEqual([['s_gate2', 'else']])
    expect(warnings(p).filter((m) => /code|exit|script file/i.test(m))).toEqual([])
  })
  it('the code ending has two exits, hence two arrows to different scenes', () => {
    const p = load()
    const edges = deriveEdges(p).filter((e) => e.source === 's_fork')
    expect(edges.map((e) => [e.label, e.target])).toEqual([
      ['left', 's_left'],
      ['right', 's_end']
    ])
  })
  it('storyHasCode is true for the fixture', () => {
    expect(storyHasCode(load())).toBe(true)
  })
  it('View script extracts exactly the lines of each scene', () => {
    const p = load()
    const out = compileProject(p)
    const golden = readFileSync(new URL('./golden/script.rpy', import.meta.url), 'utf8')
    expect(compileSceneScript(p, 's_fork')).toBe(
      'label fork:\n\n    "Left or right?"\n\n    if courage > 0:\n        jump left_path\n    else:\n        jump the_end'
    )
    expect(golden.endsWith(`${compileSceneScript(p, 's_fork')}\n`)).toBe(true)
    const code = compileSceneScript(p, 's_code') as string
    expect(code.startsWith('label code_room:\n')).toBe(true)
    expect(code.endsWith('    jump fork')).toBe(true)
    expect(code).toContain('    $ total = x + 2   \n')
    // every scene is found, starts with a label line, and holds no other scene's label
    for (const id of Object.keys(p.scenes)) {
      const text = compileSceneScript(p, id) as string
      expect(text, id).toMatch(/^label [a-z_0-9]+:\n/)
      expect(text.match(/^label /gm), id).toHaveLength(1)
    }
    // the scenes of one file, joined with two blank lines, are the file again
    const first = out.files[0]
    const ids = Object.entries(out.sceneLocations)
      .filter(([, loc]) => loc.file === first.path)
      .sort((a, b) => a[1].line - b[1].line)
      .map(([id]) => id)
    const joined = ids.map((id) => sceneScriptFrom(out, id)!.text).join('\n\n\n')
    expect(first.content.endsWith(`${joined}\n`)).toBe(true)
  })
  it('a scene that is not compiled has no script', () => {
    expect(compileSceneScript(load(), 'missing')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('storyHasCode', () => {
  it('is false for an ordinary story and true for each kind of code', () => {
    const w = world()
    expect(storyHasCode(w.project)).toBe(false)
    w.start.blocks = [code('x')]
    expect(storyHasCode(w.project)).toBe(true)
    w.start.blocks = []
    w.start.ending = { type: 'code', code: '', exits: [] }
    expect(storyHasCode(w.project)).toBe(true)
    w.start.ending = { type: 'end' }
    expect(storyHasCode(w.project)).toBe(false)
  })
  it('sees a code block nested inside an If or a Choice', () => {
    const w = world()
    w.start.blocks = [
      {
        id: 'ic',
        type: 'inlineChoice',
        prompt: null,
        options: [{ id: 'o', text: 'x', condition: null, blocks: [code('x')] }]
      }
    ]
    expect(storyHasCode(w.project)).toBe(true)
  })
  it('is true when the only code is a script file', () => {
    const w = world()
    w.project.scriptFiles = [{ id: 'a', name: 'only', content: '' }]
    expect(storyHasCode(w.project)).toBe(true)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('summary of a code block', () => {
  it('shows the first non-empty line, truncated', () => {
    const w = world()
    const long = `$ ${'x'.repeat(80)}`
    expect(summarizeBlock(code('\n\n   $ a = 1  \n$ b = 2'), w.project)).toEqual({ title: "Ren'Py code", detail: '$ a = 1' })
    const detail = summarizeBlock(code(long), w.project).detail
    expect(detail.length).toBeLessThanOrEqual(50)
    expect(detail.endsWith('…')).toBe(true)
    expect(summarizeBlock(code(''), w.project).detail).toBe('(empty)')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('store: code endings and script files', () => {
  let ids: { start: string; forest: string; cellar: string }
  beforeEach(() => {
    const w = world(true)
    S().loadProject('C:/story', w.project)
    ids = { start: w.start.id, forest: w.forest.id, cellar: w.cellar.id }
  })
  const scene = (id: string): Scene => S().project!.scenes[id]

  it('a code block can be added from the palette type and edited', () => {
    const id = S().addBlock(ids.start, 'code')
    expect(id).not.toBeNull()
    expect(scene(ids.start).blocks[0]).toMatchObject({ type: 'code', code: '' })
    S().updateBlock(ids.start, id as string, { code: 'a\n  b ' })
    expect(scene(ids.start).blocks[0]).toMatchObject({ code: 'a\n  b ' })
  })

  it('jump -> code makes one exit "next" with the old target', () => {
    S().setExitTarget(ids.start, 'jump', ids.forest)
    S().setEndingType(ids.start, 'code')
    const e = scene(ids.start).ending
    expect(e.type).toBe('code')
    if (e.type !== 'code') return
    expect(e.exits).toHaveLength(1)
    expect(e.exits[0]).toMatchObject({ name: 'next', target: ids.forest })
    expect(e.code).toBe('jump @exit(next)')
    expect(errors(S().project!)).toEqual([])
  })
  it('jump with no target -> code still makes the "next" exit (unset)', () => {
    S().setEndingType(ids.start, 'code')
    const e = scene(ids.start).ending
    expect(e.type === 'code' && e.exits.map((x) => [x.name, x.target])).toEqual([['next', null]])
  })
  it('end -> code starts empty with no exits', () => {
    S().setEndingType(ids.start, 'end')
    S().setEndingType(ids.start, 'code')
    expect(scene(ids.start).ending).toEqual({ type: 'code', code: '', exits: [] })
  })
  it('code -> jump / choice / if / end keeps the first exit target', () => {
    for (const to of ['jump', 'choice', 'branch'] as const) {
      S().setEndingType(ids.start, 'end')
      S().setEndingType(ids.start, 'code')
      S().addExit(ids.start)
      const first = (scene(ids.start).ending as { exits: { id: string }[] }).exits[0].id
      S().setExitTarget(ids.start, `x:${first}`, ids.cellar)
      S().setEndingType(ids.start, to)
      const e = scene(ids.start).ending
      expect(e.type).toBe(to)
      const target = e.type === 'jump' ? e.target : e.type === 'choice' ? e.options[0].target : e.type === 'branch' ? e.elseTarget : 'x'
      expect(target).toBe(ids.cellar)
    }
    S().setEndingType(ids.start, 'code')
    S().setEndingType(ids.start, 'end')
    expect(scene(ids.start).ending).toEqual({ type: 'end' })
  })
  it('addExit picks free names; updateExit renames; deleteExit removes; setEndingCode keeps the text exactly', () => {
    S().setEndingType(ids.start, 'end')
    S().setEndingType(ids.start, 'code')
    const a = S().addExit(ids.start) as string
    const b = S().addExit(ids.start) as string
    let e = scene(ids.start).ending
    if (e.type !== 'code') throw new Error('not code')
    expect(e.exits.map((x) => x.name)).toEqual(['exit_1', 'exit_2'])
    S().updateExit(ids.start, a, { name: 'left' })
    S().setEndingCode(ids.start, 'jump @exit(left)\t \n')
    e = scene(ids.start).ending
    if (e.type !== 'code') throw new Error('not code')
    expect(e.exits[0].name).toBe('left')
    expect(e.code).toBe('jump @exit(left)\t \n')
    S().deleteExit(ids.start, b)
    e = scene(ids.start).ending
    expect(e.type === 'code' && e.exits.map((x) => x.id)).toEqual([a])
    expect(S().addExit(ids.forest)).toBeNull()
  })
  it('setExitTarget through x:<id> and deleting the target scene clears the exit', () => {
    S().setEndingType(ids.start, 'end')
    S().setEndingType(ids.start, 'code')
    const a = S().addExit(ids.start) as string
    S().setExitTarget(ids.start, `x:${a}`, ids.forest)
    expect(listExits(scene(ids.start))[0].target).toBe(ids.forest)
    S().deleteScenes([ids.forest])
    expect(listExits(scene(ids.start))[0].target).toBeNull()
  })
  it('duplicating a scene with a code ending gives the copy its own exit ids', () => {
    S().setExitTarget(ids.start, 'jump', ids.forest)
    S().setEndingType(ids.start, 'code')
    const copy = S().duplicateScene(ids.start) as string
    const a = scene(ids.start).ending
    const b = scene(copy).ending
    if (a.type !== 'code' || b.type !== 'code') throw new Error('not code')
    expect(b.exits[0].id).not.toBe(a.exits[0].id)
    expect(b.exits[0].target).toBe(ids.forest)
    expect(b.code).toBe(a.code)
  })

  it('addScriptFile / renameScriptFile / updateScriptFile / deleteScriptFile', () => {
    const added = S().addScriptFile()
    expect(added.ok).toBe(true)
    if (!added.ok) return
    expect(S().project!.scriptFiles).toEqual([{ id: added.id, name: 'my_script', content: '' }])
    expect(S().renameScriptFile(added.id, '  extras.rpy ')).toEqual({ ok: true, id: added.id })
    expect(S().project!.scriptFiles[0].name).toBe('extras.rpy')
    S().updateScriptFile(added.id, 'screen a():\n    pass  \n')
    expect(S().project!.scriptFiles[0].content).toBe('screen a():\n    pass  \n')
    S().deleteScriptFile(added.id)
    expect(S().project!.scriptFiles).toEqual([])
  })
  it('refuses names that collide with generated files, other script files, or are illegal', () => {
    const before = JSON.stringify(S().project)
    for (const bad of ['script', 'GUI', 'screens.rpy', 'options', 'interface', 'has space', 'a/b', '', '..']) {
      const r = S().addScriptFile(bad)
      expect(r.ok, bad).toBe(false)
      if (!r.ok) expect(r.error.length).toBeGreaterThan(0)
    }
    expect(JSON.stringify(S().project)).toBe(before)
    const a = S().addScriptFile('one')
    const b = S().addScriptFile('two')
    if (!a.ok || !b.ok) throw new Error('add failed')
    const dup = S().renameScriptFile(b.id, 'ONE')
    expect(dup.ok).toBe(false)
    expect(S().project!.scriptFiles[1].name).toBe('two')
    expect(S().renameScriptFile(a.id, 'one.rpy').ok).toBe(true)
    expect(S().renameScriptFile('missing', 'x').ok).toBe(false)
    const again = S().addScriptFile('one')
    expect(again.ok).toBe(false)
  })
  it('a chapter file name becomes forbidden for script files', () => {
    S().addChapter('Act One')
    expect(S().addScriptFile('act_one').ok).toBe(false)
    expect(S().addScriptFile('act_two').ok).toBe(true)
  })
  it('script file changes can be undone and redone', () => {
    const r = S().addScriptFile('undoable')
    if (!r.ok) throw new Error('add failed')
    S().updateScriptFile(r.id, 'abc')
    undo()
    expect(S().project!.scriptFiles[0].content).toBe('')
    undo()
    expect(S().project!.scriptFiles).toEqual([])
    redo()
    redo()
    expect(S().project!.scriptFiles[0].content).toBe('abc')
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('Quick play and code', () => {
  function played() {
    const w = world()
    return w
  }
  it('a code block is skipped silently and the scene shows a notice flag', () => {
    const w = played()
    w.start.blocks = [code('$ x = 1'), say('after')]
    w.start.ending = { type: 'end' }
    const s = start(w.project, w.start.id)
    expect(s.line?.text).toBe('after')
    expect(s.skippedCode).toBe(true)
    expect(CODE_BLOCK_NOTICE).toBe("This scene runs Ren'Py code that Quick play cannot run")
  })
  it('an empty code block raises no notice, and the flag resets in the next scene', () => {
    const w = played()
    w.start.blocks = [code('  ')]
    w.start.ending = { type: 'end' }
    expect(start(w.project, w.start.id).skippedCode).toBe(false)
    w.start.blocks = [code('x'), say('a')]
    w.start.ending = { type: 'jump', target: w.forest.id }
    w.forest.blocks = [say('b')]
    let s = start(w.project, w.start.id)
    expect(s.skippedCode).toBe(true)
    s = step(w.project, s, { type: 'advance' })
    expect(s.sceneId).toBe(w.forest.id)
    expect(s.skippedCode).toBe(false)
  })
  it('a code ending waits with one button per exit and follows the one that is picked', () => {
    const w = played()
    const left = createNamedExit('left', w.forest.id)
    const right = createNamedExit('right', w.cellar.id)
    w.start.ending = { type: 'code', code: 'jump @exit(left)', exits: [left, right] }
    w.forest.blocks = [say('in the forest')]
    w.cellar.blocks = [say('in the cellar')]
    let s = start(w.project, w.start.id)
    expect(s.status).toBe('running')
    expect(s.codeExits).toEqual([
      { id: left.id, text: 'left' },
      { id: right.id, text: 'right' }
    ])
    expect(step(w.project, s, { type: 'advance' })).toBe(s)
    expect(step(w.project, s, { type: 'exit', exitId: 'nope' })).toBe(s)
    s = step(w.project, s, { type: 'exit', exitId: right.id })
    expect(s.sceneId).toBe(w.cellar.id)
    expect(s.line?.text).toBe('in the cellar')
    expect(s.codeExits).toBeNull()
  })
  it('an exit with no target ends with the usual notice, and a code ending with no exits explains itself', () => {
    const w = played()
    const x = createNamedExit('a', null)
    w.start.ending = { type: 'code', code: 'jump @exit(a)', exits: [x] }
    let s = start(w.project, w.start.id)
    s = step(w.project, s, { type: 'exit', exitId: x.id })
    expect(s.status).toBe('ended')
    expect(s.notice).toBe('This exit goes nowhere')
    w.start.ending = { type: 'code', code: 'return', exits: [] }
    const t = start(w.project, w.start.id)
    expect(t.status).toBe('ended')
    expect(t.notice).toMatch(/no exits/)
  })
  it('an exit input outside a code ending changes nothing', () => {
    const w = played()
    w.start.blocks = [say('a')]
    w.start.ending = { type: 'end' }
    const s = start(w.project, w.start.id)
    expect(step(w.project, s, { type: 'exit', exitId: 'x' })).toBe(s)
  })
})

// ---------------------------------------------------------------------------------------------------------------
describe('schema', () => {
  it('a project with a code block, a code ending and a script file round-trips', () => {
    const w = world()
    w.start.blocks = [code('$ a = 1\n\n  b')]
    w.start.ending = { type: 'code', code: 'jump @exit(a)', exits: [createNamedExit('a', w.forest.id)] }
    w.project.scriptFiles = [{ id: 'f', name: 'extras', content: 'screen a():\n    pass\n' }]
    const parsed = parseProject(JSON.stringify(w.project))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.project).toEqual(w.project)
  })
  it('createBlock("code") is a valid empty code block', () => {
    expect(createBlock('code')).toMatchObject({ type: 'code', code: '' })
  })
})

// ---------------------------------------------------------------------------------------------------------------
const GOOD_OPTIONS = 'define config.name = _("Old Name")\n'

describe('exporter with script files', () => {
  let work: string
  let editor: string
  let renpy: string
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'fabula-p12-'))
    editor = join(work, 'editor')
    renpy = join(work, 'game-project')
    mkdirSync(editor, { recursive: true })
    mkdirSync(join(renpy, 'game', 'gui'), { recursive: true })
    writeFileSync(join(renpy, 'game', 'options.rpy'), GOOD_OPTIONS)
    writeFileSync(join(renpy, 'game', 'gui.rpy'), 'define gui.accent_color = "#7c9cff"\n')
    writeFileSync(join(renpy, 'game', 'screens.rpy'), 'screen say(who, what):\n    text what\n')
  })
  afterEach(() => rmSync(work, { recursive: true, force: true }))

  function story(): Project {
    const w = world()
    w.start.ending = { type: 'end' }
    w.start.blocks = [say('hi')]
    w.project.renpyProjectDir = renpy
    return w.project
  }

  it('writes a script file as an ordinary generated file, byte for byte, and lists it in the manifest', () => {
    const p = story()
    const content = 'screen demo():\n    text "é\t "  \n\n'
    p.scriptFiles = [{ id: 'a', name: 'extras', content }]
    const r = exportProject(editor, p)
    expect(r.ok).toBe(true)
    expect(readFileSync(join(renpy, 'game', 'extras.rpy'), 'utf8')).toBe(content)
    expect(r.changed).toContain('extras.rpy')
    const manifest = JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')) as { files: string[] }
    expect(manifest.files).toEqual(['extras.rpy', 'script.rpy'])
  })

  it('deleting the script file and exporting again removes its .rpy and a stale .rpyc', () => {
    const p = story()
    p.scriptFiles = [{ id: 'a', name: 'extras', content: 'x = 1\n' }]
    exportProject(editor, p)
    writeFileSync(join(renpy, 'game', 'extras.rpyc'), 'compiled')
    p.scriptFiles = []
    const r = exportProject(editor, p)
    expect(r.ok).toBe(true)
    expect(existsSync(join(renpy, 'game', 'extras.rpy'))).toBe(false)
    expect(existsSync(join(renpy, 'game', 'extras.rpyc'))).toBe(false)
    expect(r.changed).toContain('extras.rpy')
    const manifest = JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')) as { files: string[] }
    expect(manifest.files).toEqual(['script.rpy'])
  })

  it('renaming a script file moves it: the old .rpy goes, the new one appears', () => {
    const p = story()
    p.scriptFiles = [{ id: 'a', name: 'before', content: 'x = 1\n' }]
    exportProject(editor, p)
    p.scriptFiles[0].name = 'after'
    exportProject(editor, p)
    expect(existsSync(join(renpy, 'game', 'before.rpy'))).toBe(false)
    expect(readFileSync(join(renpy, 'game', 'after.rpy'), 'utf8')).toBe('x = 1\n')
  })

  it('a second export of an unchanged script file changes nothing', () => {
    const p = story()
    p.scriptFiles = [{ id: 'a', name: 'extras', content: 'x = 1\n' }]
    exportProject(editor, p)
    expect(exportProject(editor, p).changed).toEqual([])
  })

  it('refuses a script file called gui, screens or options (in any case) and leaves the real files untouched', () => {
    const gui = readFileSync(join(renpy, 'game', 'gui.rpy'), 'utf8')
    const screens = readFileSync(join(renpy, 'game', 'screens.rpy'), 'utf8')
    for (const name of ['gui', 'Screens', 'OPTIONS.rpy']) {
      const p = story()
      p.scriptFiles = [{ id: 'a', name, content: 'define gui.hacked = 1\n' }]
      const r = exportProject(editor, p)
      expect(r.ok, name).toBe(false)
      expect(r.problems?.some((x) => x.severity === 'error' && /already uses/.test(x.message))).toBe(true)
    }
    expect(readFileSync(join(renpy, 'game', 'gui.rpy'), 'utf8')).toBe(gui)
    expect(readFileSync(join(renpy, 'game', 'screens.rpy'), 'utf8')).toBe(screens)
    expect(readFileSync(join(renpy, 'game', 'options.rpy'), 'utf8')).toBe(GOOD_OPTIONS)
  })

  it('the compiler never emits a protected name, even for a project that skipped validation', () => {
    const p = story()
    p.scriptFiles = [
      { id: 'a', name: 'Gui', content: 'x' },
      { id: 'b', name: 'screens', content: 'x' },
      { id: 'c', name: 'options', content: 'x' }
    ]
    expect(compileProject(p).files.map((f) => f.path)).toEqual(['script.rpy'])
  })
})
