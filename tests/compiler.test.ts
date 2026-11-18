import { readFileSync } from 'node:fs'
import { kitContext } from './helpers/kits'
import { describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { parseProject } from '@shared/schema'
import {
  createAsset,
  createBlock,
  createCase,
  createChapter,
  createCharacter,
  createExpression,
  createOption,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import type { Block, Ending, Project, Scene } from '@shared/model'

const fixturePath = new URL('./fixtures/demo.fabula.json', import.meta.url)
const goldenPath = (name: string): URL => new URL(`./golden/${name}`, import.meta.url)

function loadFixture(): Project {
  const parsed = parseProject(readFileSync(fixturePath, 'utf8'))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.project
}

interface Kit {
  project: Project
  start: Scene
  other: Scene
  anna: string
  happy: string
  courage: string
  hasKey: string
  nick: string
  bg: string
  music: string
  sound: string
}

function kit(): Kit {
  const project = createProject('T')
  const start = project.scenes[project.startSceneId as string]
  const other = createScene({ x: 0, y: 200 }, 'Forest')
  project.scenes[other.id] = other
  const bg = createAsset('background', 'Forest', 'backgrounds/f.png')
  const sprite = createAsset('sprite', 'Anna happy', 'sprites/s.PNG')
  const music = createAsset('music', 'Morning', 'music/m.ogg')
  const sound = createAsset('sound', 'Door', 'sounds/d.ogg')
  for (const a of [bg, sprite, music, sound]) project.assets[a.id] = a
  const anna = createCharacter('Anna', '#e86a92')
  const happy = createExpression('Happy', sprite.id)
  anna.expressions.push(happy)
  project.characters[anna.id] = anna
  project.characterOrder.push(anna.id)
  const vars = [createVariable('Courage', 'number'), createVariable('Has Key', 'boolean'), createVariable('Nickname', 'text')]
  vars[2].defaultValue = 'Stranger'
  for (const v of vars) {
    project.variables[v.id] = v
    project.variableOrder.push(v.id)
  }
  return {
    project,
    start,
    other,
    anna: anna.id,
    happy: happy.id,
    courage: vars[0].id,
    hasKey: vars[1].id,
    nick: vars[2].id,
    bg: bg.id,
    music: music.id,
    sound: sound.id
  }
}

function block<K extends Block['type']>(type: K, patch: Partial<Extract<Block, { type: K }>>): Extract<Block, { type: K }> {
  return { ...createBlock(type as never), ...patch } as Extract<Block, { type: K }>
}

/** The statements of the start label, without the label line, as an array (blank-line separated). */
function startBody(k: Kit, blocks: Block[], ending?: Ending): string[] {
  k.start.blocks = blocks
  k.start.ending = ending ?? { type: 'end' }
  const script = compileProject(k.project).files[0].content
  const from = script.indexOf('label start:\n\n') + 'label start:\n\n'.length
  const next = script.indexOf('\n\n\nlabel ', from)
  return script
    .slice(from, next === -1 ? undefined : next)
    .trimEnd()
    .split('\n\n')
}

function one(k: Kit, b: Block): string | undefined {
  return startBody(k, [b])[0]
}

describe('mapping table (6.3)', () => {
  it('Character -> define', () => {
    const k = kit()
    expect(compileProject(k.project).files[0].content).toContain('define anna = Character("Anna", color="#e86a92")\n')
  })

  it('Variable -> default for number, boolean, text', () => {
    const k = kit()
    k.project.variables[k.courage].defaultValue = 0
    const out = compileProject(k.project).files[0].content
    expect(out).toContain('default courage = 0\ndefault has_key = False\ndefault nickname = "Stranger"\n')
  })

  it('say narrator', () => {
    const k = kit()
    expect(one(k, block('say', { text: 'Text.' }))).toBe('    "Text."')
  })

  it('say character', () => {
    const k = kit()
    expect(one(k, block('say', { characterId: k.anna, text: 'Text.' }))).toBe('    anna "Text."')
  })

  it('background asset with and without a transition', () => {
    const k = kit()
    expect(one(k, block('background', { assetId: k.bg, transition: 'fade' }))).toBe('    scene bg forest with fade')
    expect(one(k, block('background', { assetId: k.bg, transition: 'none' }))).toBe('    scene bg forest')
  })

  it('background null -> scene black', () => {
    const k = kit()
    expect(one(k, block('background', { assetId: null, transition: 'none' }))).toBe('    scene black')
    expect(one(k, block('background', { assetId: null, transition: 'dissolve' }))).toBe(
      '    scene black with dissolve'
    )
  })

  it('show always emits at <position>, plus the transition', () => {
    const k = kit()
    const show = block('show', { characterId: k.anna, expressionId: k.happy, position: 'left', transition: 'none' })
    expect(one(k, show)).toBe('    show anna happy at left')
    expect(one(k, { ...show, position: 'center', transition: 'dissolve' })).toBe(
      '    show anna happy at center with dissolve'
    )
  })

  it('hide with and without a transition', () => {
    const k = kit()
    expect(one(k, block('hide', { characterId: k.anna, transition: 'none' }))).toBe('    hide anna')
    expect(one(k, block('hide', { characterId: k.anna, transition: 'fade' }))).toBe('    hide anna with fade')
  })

  it('playMusic: fadein only when > 0, noloop only when loop is false', () => {
    const k = kit()
    const play = (fadeIn: number, loop: boolean) =>
      one(k, block('playMusic', { assetId: k.music, fadeIn, loop }))
    expect(play(0, true)).toBe('    play music "audio/music/morning.ogg"')
    expect(play(1, true)).toBe('    play music "audio/music/morning.ogg" fadein 1.0')
    expect(play(0, false)).toBe('    play music "audio/music/morning.ogg" noloop')
    expect(play(1.5, false)).toBe('    play music "audio/music/morning.ogg" fadein 1.5 noloop')
  })

  it('stopMusic: fadeout only when > 0', () => {
    const k = kit()
    expect(one(k, block('stopMusic', { fadeOut: 0 }))).toBe('    stop music')
    expect(one(k, block('stopMusic', { fadeOut: 2 }))).toBe('    stop music fadeout 2.0')
  })

  it('playSound', () => {
    const k = kit()
    expect(one(k, block('playSound', { assetId: k.sound }))).toBe('    play sound "audio/sfx/door.ogg"')
  })

  it('setVariable set / add / subtract / toggle', () => {
    const k = kit()
    const eff = (variableId: string, op: 'set' | 'add' | 'subtract' | 'toggle', value: boolean | number | string) =>
      one(k, block('setVariable', { effect: { variableId, op, value } }))
    expect(eff(k.courage, 'set', 5)).toBe('    $ courage = 5')
    expect(eff(k.hasKey, 'set', true)).toBe('    $ has_key = True')
    expect(eff(k.nick, 'set', 'Bob')).toBe('    $ nickname = "Bob"')
    expect(eff(k.courage, 'add', 2)).toBe('    $ courage += 2')
    expect(eff(k.courage, 'subtract', 1.5)).toBe('    $ courage -= 1.5')
    expect(eff(k.hasKey, 'toggle', true)).toBe('    $ has_key = not has_key')
  })

  it('pause with and without seconds', () => {
    const k = kit()
    expect(one(k, block('pause', { seconds: null }))).toBe('    pause')
    expect(one(k, block('pause', { seconds: 1.5 }))).toBe('    pause 1.5')
    expect(one(k, block('pause', { seconds: 2 }))).toBe('    pause 2.0')
  })

  it('transition is emitted, and skipped entirely when none', () => {
    const k = kit()
    expect(one(k, block('transition', { transition: 'fade' }))).toBe('    with fade')
    expect(startBody(k, [block('transition', { transition: 'none' })])).toEqual(['    return'])
  })

  it('ending jump', () => {
    const k = kit()
    expect(startBody(k, [], { type: 'jump', target: k.other.id })).toEqual(['    jump forest'])
  })

  it('ending end', () => {
    const k = kit()
    expect(startBody(k, [], { type: 'end' })).toEqual(['    return'])
  })

  it('ending choice with prompt, effects and a condition', () => {
    const k = kit()
    const a = { ...createOption('Take the left path'), effects: [{ variableId: k.courage, op: 'add' as const, value: 1 }], target: k.other.id }
    const b = {
      ...createOption('Use the key'),
      condition: { join: 'and' as const, clauses: [{ id: 'c', variableId: k.hasKey, op: 'eq' as const, value: true }] },
      target: k.start.id
    }
    const body = startBody(k, [], {
      type: 'choice',
      prompt: { characterId: k.anna, text: 'Which way?' },
      options: [a, b]
    })
    expect(body).toEqual([
      '    menu:',
      '        anna "Which way?"',
      '        "Take the left path":\n            $ courage += 1\n            jump forest',
      '        "Use the key" if has_key:\n            jump start'
    ])
  })

  it('ending choice without a prompt omits the prompt line; narrator prompt has no speaker', () => {
    const k = kit()
    const option = { ...createOption('Go'), target: k.other.id }
    expect(startBody(k, [], { type: 'choice', prompt: null, options: [option] })).toEqual([
      '    menu:',
      '        "Go":\n            jump forest'
    ])
    expect(startBody(k, [], { type: 'choice', prompt: { characterId: null, text: 'Hm?' }, options: [option] })[1]).toBe(
      '        "Hm?"'
    )
  })

  it('ending choice: return after the menu only when every option has a condition', () => {
    const k = kit()
    const cond = { join: 'and' as const, clauses: [{ id: 'c', variableId: k.courage, op: 'gt' as const, value: 0 }] }
    const plain = { ...createOption('A'), target: k.other.id }
    const guarded = { ...createOption('B'), condition: cond, target: k.other.id }
    expect(startBody(k, [], { type: 'choice', prompt: null, options: [plain, guarded] }).at(-1)).not.toBe('    return')
    expect(startBody(k, [], { type: 'choice', prompt: null, options: [guarded] }).at(-1)).toBe('    return')
  })

  it('ending branch: if / elif / else with one jump each', () => {
    const k = kit()
    const c1 = { ...createCase(), target: k.other.id }
    c1.condition = { join: 'and', clauses: [{ id: 'a', variableId: k.hasKey, op: 'eq', value: true }] }
    const c2 = { ...createCase(), target: k.start.id }
    c2.condition = { join: 'and', clauses: [{ id: 'b', variableId: k.courage, op: 'gte', value: 3 }] }
    expect(startBody(k, [], { type: 'branch', cases: [c1, c2], elseTarget: k.other.id })).toEqual([
      '    if has_key:\n        jump forest\n    elif courage >= 3:\n        jump start\n    else:\n        jump forest'
    ])
  })

  it('ending branch: null exits emit return', () => {
    const k = kit()
    const c1 = { ...createCase(), target: null }
    c1.condition = { join: 'and', clauses: [{ id: 'a', variableId: k.hasKey, op: 'eq', value: false }] }
    expect(startBody(k, [], { type: 'branch', cases: [c1], elseTarget: null })).toEqual([
      '    if not has_key:\n        return\n    else:\n        return'
    ])
  })

  it('jump with a null or deleted target emits return', () => {
    const k = kit()
    expect(startBody(k, [], { type: 'jump', target: null })).toEqual(['    return'])
    expect(startBody(k, [], { type: 'jump', target: 'gone' })).toEqual(['    return'])
  })
})

describe('conditions in output', () => {
  it('every operator and the boolean shortcuts', () => {
    const k = kit()
    const ops = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'] as const
    const cases = ops.map((op) => {
      const c = { ...createCase(), target: k.other.id }
      c.condition = { join: 'and', clauses: [{ id: op, variableId: k.courage, op, value: 3 }] }
      return c
    })
    const body = startBody(k, [], { type: 'branch', cases, elseTarget: null })[0]
    expect(body).toContain('if courage == 3:')
    expect(body).toContain('elif courage != 3:')
    expect(body).toContain('elif courage > 3:')
    expect(body).toContain('elif courage >= 3:')
    expect(body).toContain('elif courage < 3:')
    expect(body).toContain('elif courage <= 3:')
  })

  it('and / or joins, text values quoted, empty clause list is True', () => {
    const k = kit()
    const a = { ...createCase(), target: k.other.id }
    a.condition = {
      join: 'or',
      clauses: [
        { id: '1', variableId: k.nick, op: 'eq', value: 'Bob "B"' },
        { id: '2', variableId: k.hasKey, op: 'eq', value: false }
      ]
    }
    const b = { ...createCase(), target: k.other.id }
    b.condition = { join: 'and', clauses: [] }
    const body = startBody(k, [], { type: 'branch', cases: [a, b], elseTarget: null })[0]
    expect(body).toContain('if nickname == "Bob \\"B\\"" or not has_key:')
    expect(body).toContain('elif True:')
  })
})

describe('defensive rules and extended features', () => {
  it('blocks pointing at missing things are skipped', () => {
    const k = kit()
    const body = startBody(k, [
      block('say', { characterId: 'gone', text: 'x' }),
      block('background', { assetId: 'gone', transition: 'none' }),
      block('show', { characterId: k.anna, expressionId: null }),
      block('show', { characterId: 'gone', expressionId: 'gone' }),
      block('hide', { characterId: null }),
      block('hide', { characterId: 'gone' }),
      block('playMusic', { assetId: null }),
      block('playMusic', { assetId: k.sound }),
      block('playSound', { assetId: 'gone' }),
      block('setVariable', {}),
      block('setVariable', { effect: { variableId: 'gone', op: 'set', value: 1 } })
    ])
    expect(body).toEqual(['    return'])
  })

  it('a show whose expression has no image is skipped', () => {
    const k = kit()
    const noImage = createExpression('Blank', null)
    k.project.characters[k.anna].expressions.push(noImage)
    expect(startBody(k, [block('show', { characterId: k.anna, expressionId: noImage.id })])).toEqual(['    return'])
  })

  it('extended blocks and endings are skipped without crashing (an empty code block emits nothing)', () => {
    const k = kit()
    const extra = [
      { id: 'x1', type: 'code', code: '' },
      { id: 'x2', type: 'visit', sceneId: null },
      { id: 'x3', type: 'screen', action: 'show', screenId: null }
    ] as unknown as Block[]
    expect(startBody(k, extra)).toEqual(['    return'])
    k.start.ending = { type: 'code', code: '', exits: [] }
    expect(() => compileProject(k.project)).not.toThrow()
  })

  it('ambient music is skipped for now', () => {
    const k = kit()
    expect(startBody(k, [block('playMusic', { assetId: k.music, channel: 'ambient' })])).toEqual(['    return'])
  })

  it('a choice with no options emits return', () => {
    const k = kit()
    expect(startBody(k, [], { type: 'choice', prompt: null, options: [] })).toEqual(['    return'])
  })
})

describe('files, assets and locations', () => {
  it('only assets in use are copied, with their export paths', () => {
    const k = kit()
    k.start.blocks = [
      block('background', { assetId: k.bg, transition: 'none' }),
      block('show', { characterId: k.anna, expressionId: k.happy }),
      block('playMusic', { assetId: k.music }),
      block('playSound', { assetId: k.sound })
    ]
    const unused = createAsset('background', 'Spare', 'backgrounds/spare.png')
    k.project.assets[unused.id] = unused
    const copies = compileProject(k.project).assetCopies
    expect(copies.map((c) => [c.from, c.to])).toEqual([
      ['sprites/s.PNG', 'images/characters/anna happy.png'],
      ['backgrounds/f.png', 'images/bg/bg forest.png'],
      ['music/m.ogg', 'audio/music/morning.ogg'],
      ['sounds/d.ogg', 'audio/sfx/door.ogg']
    ].sort((a, b) => (a[1] < b[1] ? -1 : 1)))
    expect(copies.find((c) => c.assetId === unused.id)).toBeUndefined()
  })

  it('no asset is copied when no block uses it', () => {
    expect(compileProject(kit().project).assetCopies).toEqual([])
  })

  it('no image statements are emitted', () => {
    const k = kit()
    k.start.blocks = [block('background', { assetId: k.bg, transition: 'none' })]
    expect(compileProject(k.project).files[0].content).not.toMatch(/^image /m)
  })

  it('unchaptered scenes go in script.rpy with the start scene first; chapters get their own file', () => {
    const k = kit()
    k.project.scenes[k.start.id].position = { x: 0, y: 900 }
    const chapter = createChapter('Act One')
    k.project.chapters[chapter.id] = chapter
    k.project.chapterOrder.push(chapter.id)
    const inChapter = createScene({ x: 0, y: 0 }, 'In chapter')
    inChapter.chapterId = chapter.id
    k.project.scenes[inChapter.id] = inChapter
    const result = compileProject(k.project)
    expect(result.files.map((f) => f.path)).toEqual(['script.rpy', 'act_one.rpy'])
    const script = result.files[0].content
    expect(script.indexOf('label start:')).toBeLessThan(script.indexOf('label forest:'))
    expect(result.files[1].content).toContain('label in_chapter:')
  })

  it('a start scene inside a chapter is first in that chapter file', () => {
    const k = kit()
    const chapter = createChapter('Act One')
    k.project.chapters[chapter.id] = chapter
    k.project.chapterOrder.push(chapter.id)
    k.project.scenes[k.start.id].chapterId = chapter.id
    k.project.scenes[k.start.id].position = { x: 0, y: 900 }
    const early = createScene({ x: 0, y: 0 }, 'Early')
    early.chapterId = chapter.id
    k.project.scenes[early.id] = early
    const chapterFile = compileProject(k.project).files[1].content
    expect(chapterFile.indexOf('label start:')).toBeLessThan(chapterFile.indexOf('label early:'))
  })

  it('an empty chapter writes no file', () => {
    const k = kit()
    const chapter = createChapter('Empty')
    k.project.chapters[chapter.id] = chapter
    k.project.chapterOrder.push(chapter.id)
    expect(compileProject(k.project).files.map((f) => f.path)).toEqual(['script.rpy'])
  })

  it('layout: 4-space indent, blank lines, two blank lines before labels, one final newline', () => {
    const k = kit()
    k.start.blocks = [block('say', { text: 'a' }), block('say', { text: 'b' })]
    k.start.ending = { type: 'jump', target: k.other.id }
    const out = compileProject(k.project).files[0].content
    expect(out).toContain('label start:\n\n    "a"\n\n    "b"\n\n    jump forest\n\n\nlabel forest:\n\n    return\n')
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
    expect(out).not.toContain('\r')
  })

  it('sceneLocations point at the 1-based label line', () => {
    const k = kit()
    const result = compileProject(k.project)
    const lines = result.files[0].content.split('\n')
    expect(result.sceneLocations[k.start.id]).toEqual({
      file: 'script.rpy',
      line: lines.indexOf('label start:') + 1
    })
    expect(result.sceneLocations[k.other.id]).toEqual({
      file: 'script.rpy',
      line: lines.indexOf('label forest:') + 1
    })
  })
})

describe('golden files and global rules', () => {
  const fixture = loadFixture()
  const result = compileProject(fixture, kitContext())

  it('the fixture passes parseProject', () => {
    expect(parseProject(readFileSync(fixturePath, 'utf8')).ok).toBe(true)
  })

  it('writes exactly the golden files', () => {
    expect(result.files.map((f) => f.path)).toEqual(['script.rpy', 'act_one.rpy', 'act_two.rpy', 'interface.rpy', 'extras.rpy', 'terminal.rpy'])
  })

  for (const name of ['script.rpy', 'act_one.rpy', 'act_two.rpy', 'interface.rpy', 'extras.rpy']) {
    it(`${name} matches the golden file byte for byte`, () => {
      const expected = readFileSync(goldenPath(name), 'utf8')
      expect(result.files.find((f) => f.path === name)?.content).toBe(expected)
    })
  }

  it('the kit file is the Terminal kit file, byte for byte', () => {
    expect(result.files.find((f) => f.path === 'terminal.rpy')?.content).toBe(readFileSync(new URL('../resources/kits/terminal/files/terminal.rpy', import.meta.url), 'utf8'))
  })

  it('asset copies for the fixture', () => {
    expect(result.assetCopies.map((c) => c.to)).toEqual([
      'audio/ambient/rain.wav',
      'audio/music/morning.wav',
      'audio/music/night_theme.wav',
      'audio/sfx/door.wav',
      'audio/voice/anna_01.wav',
      'fonts/handwriting.ttf',
      'images/bg/bg forest.png',
      'images/bg/bg gate.png',
      'images/characters/anna happy.png',
      'images/characters/anna sad.png',
      'images/characters/left_char smile.png',
      'images/characters/nova calm.png',
      'images/characters/side nova.png',
      'images/ui/desk.png',
      'movies/intro.webm'
    ])
  })

  it('scene locations for the fixture match the label lines', () => {
    const labels: Record<string, string> = {
      s_start: 'start',
      s_secret: 'secret',
      s_left: 'left_path',
      s_gate: 'gate',
      s_gate2: 'gate_2',
      s_door: 'locked_door',
      s_end: 'the_end',
      s_extras: 'extras',
      s_cutscene: 'cutscene_intro',
      s_splash: 'splashscreen',
      s_terminal: 'server_room',
      s_vault: 'vault'
    }
    for (const [id, label] of Object.entries(labels)) {
      const loc = result.sceneLocations[id]
      const lines = result.files.find((f) => f.path === loc.file)?.content.split('\n') ?? []
      expect(lines[loc.line - 1]).toBe(`label ${label}:`)
    }
  })

  it('compiling twice gives identical output', () => {
    expect(compileProject(loadFixture(), kitContext())).toEqual(result)
  })

  it('output has no comments and never names the tool', () => {
    const all = result.files.map((f) => f.content).join('\n')
    for (const line of all.split('\n')) {
      let inString = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (inString) {
          if (ch === '\\') i++
          else if (ch === '"') inString = false
        } else if (ch === '"') inString = true
        else expect(ch, `comment in: ${line}`).not.toBe('#')
      }
    }
    expect(all).not.toMatch(/fabula|generated|\bAI\b/i)
    expect(result.assetCopies.map((c) => c.to).join('\n')).not.toMatch(/fabula|generated|\bAI\b/i)
    expect(all).not.toContain('Private note')
  })
})
