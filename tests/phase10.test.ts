import { beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '@shared/compiler'
import { escapeSayText } from '@shared/compiler/text'
import {
  createAsset,
  createBlock,
  createCharacter,
  createExpression,
  createProject,
  createScene,
  createVariable
} from '@shared/factory'
import { applyBlockToStage } from '@shared/stage'
import { computeStage } from '@shared/stage'
import { resolveSprites, variableResolver } from '@shared/stageView'
import { start, step } from '@shared/interpreter'
import { LIFECYCLE_LABELS, buildNameTable, labelLockProblem } from '@shared/naming'
import { customPlacementFor } from '@shared/placement'
import { parseRichText } from '@shared/richText'
import { blockSchema, parseProject } from '@shared/schema'
import { findUsage } from '@shared/usage'
import { validateProject } from '@shared/validate'
import type { Block, Project, Scene } from '@shared/model'
import { useProjectStore, pauseHistory, resumeHistory, undo } from '../src/renderer/store/projectStore'
import { MORE_PALETTE } from '../src/renderer/views/SceneEditor/paletteEntries'
import { summarizeBlock } from '../src/renderer/views/SceneEditor/blockSummaries'

type Of<T extends Block['type']> = Extract<Block, { type: T }>
const make = <T extends Block['type']>(type: T, patch: Partial<Of<T>> = {}): Of<T> =>
  ({ ...createBlock(type as never), ...patch }) as Of<T>

interface World {
  project: Project
  start: Scene
  anna: string
  happy: string
  nick: string
  seen: string
  count: string
  rain: string
  music: string
  voice: string
  movie: string
  side: string
  font: string
}

function world(): World {
  const project = createProject('T')
  const start = project.scenes[project.startSceneId as string]
  const sprite = createAsset('sprite', 'Anna happy', 'sprites/s.png')
  const sideSprite = createAsset('sprite', 'Anna side', 'sprites/side.PNG')
  const rain = createAsset('ambient', 'Rain', 'ambient/r.ogg')
  const music = createAsset('music', 'Morning', 'music/m.ogg')
  const voice = createAsset('voice', 'Anna line 1', 'voice/v.ogg')
  const movie = createAsset('movie', 'Intro', 'movies/i.webm')
  const font = createAsset('font', 'Hand', 'fonts/h.ttf')
  for (const a of [sprite, sideSprite, rain, music, voice, movie, font]) project.assets[a.id] = a
  const anna = createCharacter('Anna', '#e86a92')
  const happy = createExpression('Happy', sprite.id)
  anna.expressions.push(happy)
  project.characters[anna.id] = anna
  project.characterOrder.push(anna.id)
  const nick = createVariable('Nickname', 'text')
  const seen = createVariable('Seen Ending', 'boolean')
  seen.persistent = true
  const count = createVariable('Count', 'number')
  for (const v of [nick, seen, count]) {
    project.variables[v.id] = v
    project.variableOrder.push(v.id)
  }
  return {
    project,
    start,
    anna: anna.id,
    happy: happy.id,
    nick: nick.id,
    seen: seen.id,
    count: count.id,
    rain: rain.id,
    music: music.id,
    voice: voice.id,
    movie: movie.id,
    side: sideSprite.id,
    font: font.id
  }
}

function body(w: World, blocks: Block[]): string[] {
  w.start.blocks = blocks
  w.start.ending = { type: 'end' }
  const script = compileProject(w.project).files[0].content
  const from = script.indexOf('label start:\n\n') + 'label start:\n\n'.length
  return script.slice(from).trimEnd().split('\n\n')
}

function script(w: World): string {
  return compileProject(w.project).files[0].content
}

const errors = (p: Project): string[] => validateProject(p).filter((x) => x.severity === 'error').map((x) => x.message)

describe('compiler: say with voice', () => {
  it('writes a voice line before the dialogue line and copies the file', () => {
    const w = world()
    const out = body(w, [make('say', { characterId: w.anna, text: 'Hi.', voiceAssetId: w.voice })])
    expect(out[0]).toBe('    voice "audio/voice/anna_line_1.ogg"\n    anna "Hi."')
    expect(compileProject(w.project).assetCopies.map((c) => c.to)).toContain('audio/voice/anna_line_1.ogg')
  })
  it('a voice file of the wrong kind is ignored', () => {
    const w = world()
    const out = body(w, [make('say', { characterId: w.anna, text: 'Hi.', voiceAssetId: w.music })])
    expect(out[0]).toBe('    anna "Hi."')
  })
  it('narration can be voiced too', () => {
    const w = world()
    expect(body(w, [make('say', { text: 'Rain.', voiceAssetId: w.voice })])[0]).toBe(
      '    voice "audio/voice/anna_line_1.ogg"\n    "Rain."'
    )
  })
})

describe('compiler: characters', () => {
  it('NVL mode -> kind=nvl, and the narrator joins NVL', () => {
    const w = world()
    w.project.characters[w.anna].mode = 'nvl'
    const out = script(w)
    expect(out).toContain('define anna = Character("Anna", kind=nvl, color="#e86a92")\ndefine narrator = nvl_narrator\n')
  })
  it('ADV characters never define the narrator', () => {
    const w = world()
    expect(script(w)).not.toContain('narrator')
  })
  it('side image -> file and image= tag', () => {
    const w = world()
    w.project.characters[w.anna].sideAssetId = w.side
    const result = compileProject(w.project)
    expect(result.files[0].content).toContain('define anna = Character("Anna", color="#e86a92", image="anna")')
    expect(result.assetCopies.find((c) => c.assetId === w.side)?.to).toBe('images/characters/side anna.png')
  })
  it('NVL and side image together', () => {
    const w = world()
    Object.assign(w.project.characters[w.anna], { mode: 'nvl', sideAssetId: w.side })
    expect(script(w)).toContain('define anna = Character("Anna", kind=nvl, color="#e86a92", image="anna")')
  })
})

describe('compiler: persistent variables', () => {
  it('default, set, toggle, condition, interpolation and ask all use persistent.name', () => {
    const w = world()
    const p = w.project
    expect(script(w)).toContain('default persistent.seen_ending = False\n')
    const out = body(w, [
      make('setVariable', { effect: { variableId: w.seen, op: 'set', value: true } }),
      make('setVariable', { effect: { variableId: w.seen, op: 'toggle', value: true } }),
      make('say', { text: 'Seen: [persistent.seen_ending] and [seen_ending].' })
    ])
    expect(out[0]).toBe('    $ persistent.seen_ending = True')
    expect(out[1]).toBe('    $ persistent.seen_ending = not persistent.seen_ending')
    expect(out[2]).toBe('    "Seen: [persistent.seen_ending] and [[seen_ending]."')
    w.start.ending = {
      type: 'branch',
      cases: [
        {
          id: 'c1',
          condition: { join: 'and', clauses: [{ id: 'k1', variableId: w.seen, op: 'eq', value: true }] },
          target: w.start.id
        }
      ],
      elseTarget: w.start.id
    }
    expect(compileProject(p).files[0].content).toContain('    if persistent.seen_ending:\n        jump start')
  })
  it('a persistent text variable receives the answer of an Ask block', () => {
    const w = world()
    w.project.variables[w.nick].persistent = true
    expect(body(w, [make('ask', { variableId: w.nick, prompt: 'Name?', defaultText: '', maxLength: 10 })])[0]).toBe(
      '    $ persistent.nickname = renpy.input("Name?", default="", length=10).strip()'
    )
  })
  it('persistent variables of every type compile', () => {
    const w = world()
    for (const v of Object.values(w.project.variables)) v.persistent = true
    const out = script(w)
    expect(out).toContain('default persistent.nickname = ""')
    expect(out).toContain('default persistent.seen_ending = False')
    expect(out).toContain('default persistent.count = 0')
  })
})

describe('compiler: ambient channel', () => {
  it('play and stop ambient, and the channel is registered once at the top of script.rpy', () => {
    const w = world()
    const out = body(w, [
      make('playMusic', { assetId: w.rain, channel: 'ambient', fadeIn: 1, loop: true }),
      make('playMusic', { assetId: w.rain, channel: 'ambient', fadeIn: 0, loop: false }),
      make('stopMusic', { channel: 'ambient', fadeOut: 2 }),
      make('stopMusic', { channel: 'ambient', fadeOut: 0 })
    ])
    expect(out).toEqual([
      '    play ambient "audio/ambient/rain.ogg" fadein 1.0',
      '    play ambient "audio/ambient/rain.ogg" noloop',
      '    stop ambient fadeout 2.0',
      '    stop ambient',
      '    return'
    ])
    const text = script(w)
    expect(text.startsWith('init python:\n    renpy.music.register_channel("ambient", "sfx", loop=True)\n\n')).toBe(true)
    expect(text.split('register_channel').length - 1).toBe(1)
  })
  it('no init block when ambient is not used', () => {
    const w = world()
    body(w, [make('playMusic', { assetId: w.music })])
    expect(script(w)).not.toContain('init python')
    expect(script(w)).not.toContain('ambient')
  })
  it('music-channel blocks are unchanged', () => {
    const w = world()
    expect(body(w, [make('playMusic', { assetId: w.music, fadeIn: 1, loop: true })])[0]).toBe(
      '    play music "audio/music/morning.ogg" fadein 1.0'
    )
    expect(body(w, [make('stopMusic', { fadeOut: 1 })])[0]).toBe('    stop music fadeout 1.0')
  })
})

describe('compiler: custom placement and zorder', () => {
  const show = (w: World, patch: Partial<Of<'show'>>): Of<'show'> =>
    make('show', { characterId: w.anna, expressionId: w.happy, ...patch })

  it('custom placement writes an ATL block with only the non-default extras', () => {
    const w = world()
    const out = body(w, [
      show(w, { placement: { mode: 'custom', xalign: 0.3, yalign: 1, zoom: 1, rotate: 0, alpha: 1 } }),
      show(w, { placement: { mode: 'custom', xalign: 0.5, yalign: 0.9, zoom: 1.5, rotate: 10, alpha: 0.5 } })
    ])
    expect(out[0]).toBe('    show anna happy:\n        xalign 0.3\n        yalign 1.0')
    expect(out[1]).toBe('    show anna happy:\n        xalign 0.5\n        yalign 0.9\n        zoom 1.5\n        rotate 10\n        alpha 0.5')
  })
  it('the transition becomes a separate with line after the block', () => {
    const w = world()
    const out = body(w, [
      show(w, { transition: 'dissolve', placement: { mode: 'custom', xalign: 0.3, yalign: 1, zoom: 1, rotate: 0, alpha: 1 } })
    ])
    expect(out[0]).toBe('    show anna happy:\n        xalign 0.3\n        yalign 1.0\n    with dissolve')
  })
  it('zorder is appended, on presets and on custom placement', () => {
    const w = world()
    const out = body(w, [
      show(w, { position: 'left', zorder: 2 }),
      show(w, { zorder: -1, placement: { mode: 'custom', xalign: 0, yalign: 1, zoom: 1, rotate: 0, alpha: 1 } })
    ])
    expect(out[0]).toBe('    show anna happy at left zorder 2')
    expect(out[1]).toBe('    show anna happy zorder -1:\n        xalign 0.0\n        yalign 1.0')
  })
  it('preset placement with zorder 0 is unchanged', () => {
    const w = world()
    expect(body(w, [show(w, { position: 'right', transition: 'fade' })])[0]).toBe('    show anna happy at right with fade')
  })
})

describe('compiler: ask, movie, window, clearPage', () => {
  it('ask -> renpy.input with default, length and strip', () => {
    const w = world()
    const out = body(w, [make('ask', { variableId: w.nick, prompt: 'What is your name?', defaultText: 'Alex', maxLength: 20 })])
    expect(out[0]).toBe('    $ nickname = renpy.input("What is your name?", default="Alex", length=20).strip()')
  })
  it('ask escapes the prompt like dialogue and the default like a string', () => {
    const w = world()
    const out = body(w, [make('ask', { variableId: w.nick, prompt: '"Name" [x] 100%', defaultText: 'A "B"', maxLength: 5 })])
    expect(out[0]).toBe('    $ nickname = renpy.input("\\"Name\\" [[x] 100%%", default="A \\"B\\"", length=5).strip()')
  })
  it('ask without a text variable is skipped', () => {
    const w = world()
    expect(body(w, [make('ask', { variableId: null })])).toEqual(['    return'])
    expect(body(w, [make('ask', { variableId: w.count })])).toEqual(['    return'])
  })
  it('movie -> movie_cutscene and the file goes to movies/', () => {
    const w = world()
    expect(body(w, [make('movie', { assetId: w.movie })])[0]).toBe('    $ renpy.movie_cutscene("movies/intro.webm")')
    expect(compileProject(w.project).assetCopies.map((c) => c.to)).toContain('movies/intro.webm')
    expect(body(w, [make('movie', { assetId: null })])).toEqual(['    return'])
  })
  it('window show and hide', () => {
    const w = world()
    expect(body(w, [make('window', { action: 'show' }), make('window', { action: 'hide' })])).toEqual([
      '    window show',
      '    window hide',
      '    return'
    ])
  })
  it('clearPage -> nvl clear', () => {
    const w = world()
    expect(body(w, [make('clearPage')])[0]).toBe('    nvl clear')
  })
})

describe('compiler: scene role and label lock', () => {
  it('a splash screen scene is the label splashscreen', () => {
    const w = world()
    const splash = createScene({ x: 0, y: 100 }, 'Intro card')
    splash.role = 'splashscreen'
    splash.ending = { type: 'end' }
    w.project.scenes[splash.id] = splash
    const out = script(w)
    expect(out).toContain('label splashscreen:')
    expect(buildNameTable(w.project).sceneLabels[splash.id]).toBe('splashscreen')
  })
  it('a locked label is used exactly and nothing else can take it', () => {
    const w = world()
    const a = createScene({ x: 0, y: 100 }, 'After load')
    a.labelLock = 'after_load'
    const b = createScene({ x: 0, y: 200 }, 'Chosen')
    b.labelLock = 'chosen'
    const c = createScene({ x: 0, y: 50 }, 'Chosen')
    for (const s of [a, b, c]) w.project.scenes[s.id] = s
    const table = buildNameTable(w.project).sceneLabels
    expect(table[a.id]).toBe('after_load')
    expect(table[b.id]).toBe('chosen')
    expect(table[c.id]).toBe('chosen_2')
    expect(compileProject(w.project).files[0].content).toContain('label after_load:')
  })
  it('the start scene is always start, even when it has a lock', () => {
    const w = world()
    w.start.labelLock = 'begin'
    expect(buildNameTable(w.project).sceneLabels[w.start.id]).toBe('start')
  })
})

describe('escaping the text tags (6.4)', () => {
  const say = (s: string): string => escapeSayText(s, [])
  it('keeps every whitelisted tag', () => {
    const all = '{b}{/b}{i}{/i}{u}{/u}{color=#a1B2c3}{/color}{size=24}{/size}{w}{p}{cps=30}{/cps}'
    expect(say(all)).toBe(all)
  })
  it('colour must be #rrggbb', () => {
    expect(say('{color=red}')).toBe('{{color=red}')
    expect(say('{color=#fff}')).toBe('{{color=#fff}')
    expect(say('{color=#12345g}')).toBe('{{color=#12345g}')
    expect(say('{color=#1234567}')).toBe('{{color=#1234567}')
  })
  it('size and speed must be whole numbers', () => {
    expect(say('{size=big}')).toBe('{{size=big}')
    expect(say('{size=+5}')).toBe('{{size=+5}')
    expect(say('{size=}')).toBe('{{size=}')
    expect(say('{size=1.5}')).toBe('{{size=1.5}')
    expect(say('{cps=fast}')).toBe('{{cps=fast}')
    expect(say('{cps=*2}')).toBe('{{cps=*2}')
  })
  it('waits and pauses take no arguments, and nothing else is kept', () => {
    expect(say('{w=1}')).toBe('{{w=1}')
    expect(say('{p=2}')).toBe('{{p=2}')
    expect(say('{nw}{clear}{a=x}{font=y}{image=z}')).toBe('{{nw}{{clear}{{a=x}{{font=y}{{image=z}')
    expect(say('{W}{COLOR=#ffffff}')).toBe('{{W}{{COLOR=#ffffff}')
  })
  it('combines with the other rules', () => {
    expect(escapeSayText('{color=#ff0000}[x] 50%{/color}', ['x'])).toBe('{color=#ff0000}[x] 50%%{/color}')
  })
})

describe('validation of the new rules', () => {
  const base = (): World => {
    const w = world()
    const end = createScene({ x: 0, y: 100 }, 'End')
    end.blocks = [make('say', { text: 'x' })]
    end.ending = { type: 'end' }
    w.project.scenes[end.id] = end
    w.start.blocks = [make('say', { text: 'x' })]
    w.start.ending = { type: 'jump', target: end.id }
    return w
  }

  it('ask without a variable is an error', () => {
    const w = base()
    w.start.blocks = [make('ask', { variableId: null, prompt: 'x' })]
    expect(errors(w.project).join('\n')).toContain('Ask the player block (block 1) has no variable')
  })
  it('ask with a non-text variable is an error, with a text variable it is fine', () => {
    const w = base()
    w.start.blocks = [make('ask', { variableId: w.count, prompt: 'x' })]
    expect(errors(w.project).join('\n')).toContain('"Count", which is not a text variable')
    w.start.blocks = [make('ask', { variableId: w.nick, prompt: 'x' })]
    expect(errors(w.project)).toEqual([])
  })
  it('movie without an asset is an error', () => {
    const w = base()
    w.start.blocks = [make('movie', { assetId: null })]
    expect(errors(w.project).join('\n')).toContain('Movie block (block 1) has no movie')
    w.start.blocks = [make('movie', { assetId: w.movie })]
    expect(errors(w.project)).toEqual([])
  })
  it('label lock: illegal, reserved and duplicate are errors, a fine one is not', () => {
    const w = base()
    const other = createScene({ x: 0, y: 300 }, 'Other')
    other.blocks = [make('say', { text: 'x' })]
    other.ending = { type: 'end' }
    w.project.scenes[other.id] = other
    const end = Object.values(w.project.scenes).find((s) => s.name === 'End')!
    for (const bad of ['my label', '9lives', 'if', 'jump', 'start', 'splashscreen', 'naïve']) {
      end.labelLock = bad
      expect(errors(w.project).join('\n'), bad).toContain(`the locked label "${bad}" can't be used`)
    }
    end.labelLock = 'the_vault'
    other.labelLock = 'the_vault'
    expect(errors(w.project).join('\n')).toContain('already uses the label "the_vault"')
    other.labelLock = 'after_load'
    expect(errors(w.project)).toEqual([])
  })
  it('labelLockProblem explains each failure in words', () => {
    const w = base()
    const id = w.start.id
    expect(labelLockProblem(w.project, id, 'ok_label')).toBeNull()
    expect(labelLockProblem(w.project, id, 'a b')).toMatch(/letters, numbers and underscores/)
    expect(labelLockProblem(w.project, id, 'while')).toMatch(/already uses/)
    for (const l of LIFECYCLE_LABELS) expect(labelLockProblem(w.project, id, l)).toBeNull()
  })
  it('splash screen must end with End', () => {
    const w = base()
    const splash = createScene({ x: 0, y: 400 }, 'Splash')
    splash.role = 'splashscreen'
    splash.blocks = [make('say', { text: 'x' })]
    splash.ending = { type: 'jump', target: w.start.id }
    w.project.scenes[splash.id] = splash
    expect(errors(w.project).join('\n')).toContain('must finish with "End of story"')
    splash.ending = { type: 'end' }
    expect(errors(w.project)).toEqual([])
    expect(validateProject(w.project).filter((p) => p.message.includes('no path from the start'))).toEqual([])
  })
  it('the start scene cannot be the splash screen, and only one splash screen is allowed', () => {
    const w = base()
    w.start.role = 'splashscreen'
    expect(errors(w.project).join('\n')).toContain("start scene can't also be the splash screen")
    w.start.role = 'normal'
    const s1 = createScene({ x: 0, y: 400 }, 'S1')
    const s2 = createScene({ x: 0, y: 500 }, 'S2')
    for (const s of [s1, s2]) {
      s.role = 'splashscreen'
      s.blocks = [make('say', { text: 'x' })]
      s.ending = { type: 'end' }
      w.project.scenes[s.id] = s
    }
    expect(errors(w.project).join('\n')).toContain('only one scene can be the splash screen')
  })
  it('persistent variables of every type are allowed', () => {
    const w = base()
    for (const v of Object.values(w.project.variables)) v.persistent = true
    w.start.blocks = [
      make('setVariable', { effect: { variableId: w.count, op: 'add', value: 1 } }),
      make('setVariable', { effect: { variableId: w.seen, op: 'toggle', value: true } }),
      make('ask', { variableId: w.nick, prompt: 'x' })
    ]
    expect(errors(w.project)).toEqual([])
  })
  it('a voice asset of the wrong kind is ignored, a voice asset counts as used', () => {
    const w = base()
    w.start.blocks = [make('say', { text: 'x', voiceAssetId: w.music })]
    expect(errors(w.project)).toEqual([])
    const unused = (): string[] => validateProject(w.project).filter((p) => p.message.includes('is not used anywhere')).map((p) => p.message)
    expect(unused()).toContain('The file "Anna line 1" is not used anywhere.')
    w.start.blocks = [make('say', { text: 'x', voiceAssetId: w.voice })]
    expect(unused()).not.toContain('The file "Anna line 1" is not used anywhere.')
  })
  it('the demo fixture still has the single deliberate error', async () => {
    const { readFileSync } = await import('node:fs')
    const parsed = parseProject(readFileSync(new URL('./fixtures/demo.fabula.json', import.meta.url), 'utf8'))
    if (!parsed.ok) throw new Error(parsed.error)
    expect(errors(parsed.project)).toHaveLength(1)
  })
})

describe('Quick play interpreter', () => {
  const run = (w: World, blocks: Block[]) => {
    w.start.blocks = blocks
    w.start.ending = { type: 'end' }
    return start(w.project, w.start.id)
  }

  it('an ask block waits for text, stores the trimmed answer and goes on', () => {
    const w = world()
    let s = run(w, [make('ask', { variableId: w.nick, prompt: 'Name?', defaultText: 'Alex', maxLength: 20 }), make('say', { text: 'after' })])
    expect(s.ask).toEqual({ variableId: w.nick, prompt: 'Name?', defaultText: 'Alex', maxLength: 20 })
    expect(step(w.project, s, { type: 'advance' })).toBe(s)
    s = step(w.project, s, { type: 'answer', text: '  Bo  ' })
    expect(s.variables[w.nick]).toBe('Bo')
    expect(s.ask).toBeNull()
    expect(s.line?.text).toBe('after')
  })
  it('the answer is cut to the longest allowed length', () => {
    const w = world()
    const s = step(w.project, run(w, [make('ask', { variableId: w.nick, maxLength: 3 })]), { type: 'answer', text: 'Bobby' })
    expect(s.variables[w.nick]).toBe('Bob')
  })
  it('an answer when nothing was asked changes nothing', () => {
    const w = world()
    const s = run(w, [make('say', { text: 'x' })])
    expect(step(w.project, s, { type: 'answer', text: 'y' })).toBe(s)
  })
  it('a movie block waits for a click, then continues', () => {
    const w = world()
    let s = run(w, [make('movie', { assetId: w.movie }), make('say', { text: 'after' })])
    expect(s.movie).toEqual({ assetId: w.movie })
    s = step(w.project, s, { type: 'advance' })
    expect(s.movie).toBeNull()
    expect(s.line?.text).toBe('after')
  })
  it('window and clearPage blocks are ignored', () => {
    const w = world()
    const s = run(w, [make('window', { action: 'hide' }), make('clearPage'), make('say', { text: 'hi' })])
    expect(s.line?.text).toBe('hi')
  })
  it('a voiced line sets the voice and counts it', () => {
    const w = world()
    let s = run(w, [make('say', { text: 'a', voiceAssetId: w.voice }), make('say', { text: 'b' })])
    expect([s.voiceSeq, s.voice]).toEqual([1, w.voice])
    s = step(w.project, s, { type: 'advance' })
    expect(s.voiceSeq).toBe(1)
  })
  it('ambient music is tracked apart from the music', () => {
    const w = world()
    let s = run(w, [
      make('playMusic', { assetId: w.music, channel: 'music' }),
      make('playMusic', { assetId: w.rain, channel: 'ambient', loop: false }),
      make('pause', { seconds: null }),
      make('stopMusic', { channel: 'ambient' }),
      make('pause', { seconds: null })
    ])
    expect([s.stage.music, s.ambient, s.ambientLoop]).toEqual([w.music, w.rain, false])
    s = step(w.project, s, { type: 'advance' })
    expect([s.stage.music, s.ambient]).toEqual([w.music, null])
  })
  it('persistent variables behave like normal ones', () => {
    const w = world()
    const s = run(w, [make('setVariable', { effect: { variableId: w.seen, op: 'set', value: true } }), make('say', { text: 'x' })])
    expect(s.variables[w.seen]).toBe(true)
  })
  it('[persistent.name] resolves in dialogue text', () => {
    const w = world()
    const resolve = variableResolver(w.project, { [w.seen]: true, [w.nick]: 'Bo' })
    expect(resolve('persistent.seen_ending')).toBe('True')
    expect(resolve('nickname')).toBe('Bo')
    expect(resolve('seen_ending')).toBeUndefined()
  })
})

describe('stage with placement', () => {
  it('custom placement and zorder are carried to the sprite; presets add nothing', () => {
    const w = world()
    const custom = { mode: 'custom', xalign: 0.2, yalign: 0.7, zoom: 1.1, rotate: 5, alpha: 0.9 } as const
    w.start.blocks = [
      make('show', { characterId: w.anna, expressionId: w.happy, placement: custom, zorder: 3 }),
      make('show', { characterId: w.anna, expressionId: w.happy })
    ]
    const first = computeStage(w.project, w.start.id, 0).sprites[0]
    expect(first.placement).toEqual(custom)
    expect(first.zorder).toBe(3)
    const second = computeStage(w.project, w.start.id, 1).sprites[0]
    expect(second).toEqual({ characterId: w.anna, expressionId: w.happy, position: 'center' })
    const resolved = resolveSprites(w.project.characters, w.project.assets, [first])
    expect(resolved[0].placement).toEqual(custom)
    expect(resolved[0].zorder).toBe(3)
  })
  it('ambient blocks do not touch the stage', () => {
    const w = world()
    const state = { background: null, sprites: [], music: null }
    applyBlockToStage(state, make('playMusic', { assetId: w.rain, channel: 'ambient' }))
    expect(state.music).toBeNull()
  })
  it('a custom placement starts where the preset was', () => {
    expect(customPlacementFor({ position: 'left' })).toEqual({ mode: 'custom', xalign: 0, yalign: 1, zoom: 1, rotate: 0, alpha: 1 })
    expect(customPlacementFor({ position: 'right' }).xalign).toBe(1)
  })
})

describe('rich text', () => {
  it('colour spans carry the colour and end at {/color}', () => {
    const spans = parseRichText('a {color=#ff0000}b{/color} c {size=20}d{/size}')
    expect(spans).toEqual([
      { kind: 'text', text: 'a ', bold: false, italic: false, underline: false },
      { kind: 'text', text: 'b', bold: false, italic: false, underline: false, color: '#ff0000' },
      { kind: 'text', text: ' c d', bold: false, italic: false, underline: false }
    ])
  })
})

describe('usage of the new references', () => {
  it('counts voice, movie and side image uses', () => {
    const w = world()
    w.project.characters[w.anna].sideAssetId = w.side
    w.start.blocks = [make('say', { text: 'x', voiceAssetId: w.voice }), make('movie', { assetId: w.movie }), make('ask', { variableId: w.nick })]
    const usage = findUsage(w.project)
    expect(usage.assets[w.voice].map((r) => r.description)).toEqual(['Voice line'])
    expect(usage.assets[w.movie].map((r) => r.description)).toEqual(['Movie block'])
    expect(usage.assets[w.side].map((r) => r.description)).toEqual(['Anna: side image'])
    expect(usage.variables[w.nick]).toHaveLength(1)
    expect(usage.assets[w.font]).toBeUndefined()
  })
})

describe('factory, schema and palette', () => {
  it('creates sane defaults for the four new blocks', () => {
    expect(createBlock('ask')).toMatchObject({ type: 'ask', variableId: null, prompt: '', defaultText: '', maxLength: 20 })
    expect(createBlock('movie')).toMatchObject({ type: 'movie', assetId: null })
    expect(createBlock('window')).toMatchObject({ type: 'window', action: 'hide' })
    expect(createBlock('clearPage')).toMatchObject({ type: 'clearPage' })
    for (const t of ['ask', 'movie', 'window', 'clearPage'] as const) {
      expect(blockSchema.safeParse(createBlock(t)).success, t).toBe(true)
    }
  })
  it('the More group offers the Phase 10 blocks in order (Phase 11 put Visit, If and Choice before them; Phase 12 adds the code block at the end)', () => {
    expect(MORE_PALETTE.map((e) => [e.label, e.type])).toEqual([
      ['Visit scene', 'visit'],
      ['If', 'if'],
      ['Choice (stay in scene)', 'inlineChoice'],
      ['Ask the player', 'ask'],
      ['Movie', 'movie'],
      ['Text box show/hide', 'window'],
      ['Clear page', 'clearPage'],
      ["Ren'Py code", 'code']
    ])
  })
  it('summaries read well', () => {
    const w = world()
    expect(summarizeBlock(make('ask', { variableId: w.nick, prompt: 'Name?' }), w.project)).toEqual({
      title: 'Ask the player',
      detail: '"Name?" → Nickname'
    })
    expect(summarizeBlock(make('movie', { assetId: w.movie }), w.project)).toEqual({ title: 'Movie', detail: 'Intro' })
    expect(summarizeBlock(make('window', { action: 'show' }), w.project)).toEqual({ title: 'Text box', detail: 'Show' })
    expect(summarizeBlock(make('clearPage'), w.project).title).toBe('Clear page')
    expect(summarizeBlock(make('playMusic', { assetId: w.rain, channel: 'ambient' }), w.project).title).toBe('Play ambient')
  })
})

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const P = (): Project => S().project!

describe('store actions', () => {
  beforeEach(() => {
    S().loadProject('C:/story', createProject('Test'))
  })

  it('addBlock creates the new block types', () => {
    const sceneId = P().startSceneId as string
    for (const t of ['ask', 'movie', 'window', 'clearPage'] as const) {
      const id = S().addBlock(sceneId, t)
      expect(P().scenes[sceneId].blocks.find((b) => b.id === id)?.type).toBe(t)
    }
  })
  it('setSceneRole and setLabelLock are undoable', () => {
    const sceneId = P().startSceneId as string
    S().setSceneRole(sceneId, 'splashscreen')
    S().setLabelLock(sceneId, 'my_label')
    expect(P().scenes[sceneId]).toMatchObject({ role: 'splashscreen', labelLock: 'my_label' })
    S().setLabelLock(sceneId, '')
    expect(P().scenes[sceneId].labelLock).toBeNull()
    undo()
    expect(P().scenes[sceneId].labelLock).toBe('my_label')
    undo()
    undo()
    expect(P().scenes[sceneId]).toMatchObject({ role: 'normal', labelLock: null })
  })
  it('character mode, side image and persistent variable can be set and survive the schema', () => {
    const c = S().addCharacter({ name: 'Nova' })
    const v = S().addVariable({ name: 'seen', type: 'boolean' })
    S().updateCharacter(c, { mode: 'nvl', sideAssetId: null })
    S().updateVariable(v, { persistent: true })
    expect(P().characters[c].mode).toBe('nvl')
    expect(P().variables[v].persistent).toBe(true)
    expect(parseProject(JSON.parse(JSON.stringify(P()))).ok).toBe(true)
  })
  it('deleting an asset clears voice, movie and side image references', () => {
    const sceneId = P().startSceneId as string
    const voice = createAsset('voice', 'v', 'voice/v.ogg')
    const movie = createAsset('movie', 'm', 'movies/m.webm')
    S().addAsset(voice)
    S().addAsset(movie)
    const sayId = S().addBlock(sceneId, 'say') as string
    S().updateBlock(sceneId, sayId, { voiceAssetId: voice.id })
    const movieId = S().addBlock(sceneId, 'movie') as string
    S().updateBlock(sceneId, movieId, { assetId: movie.id })
    S().deleteAsset(voice.id)
    S().deleteAsset(movie.id)
    const blocks = P().scenes[sceneId].blocks
    expect(blocks.find((b) => b.id === sayId)).toMatchObject({ voiceAssetId: null })
    expect(blocks.find((b) => b.id === movieId)).toMatchObject({ assetId: null })
  })
  it('deleting the text variable of an Ask block clears the pick', () => {
    const sceneId = P().startSceneId as string
    const v = S().addVariable({ name: 'nick', type: 'text' })
    const id = S().addBlock(sceneId, 'ask') as string
    S().updateBlock(sceneId, id, { variableId: v })
    S().deleteVariable(v)
    expect(P().scenes[sceneId].blocks.find((b) => b.id === id)).toMatchObject({ variableId: null })
  })
  it('dragging a sprite on the stage is one undo step', () => {
    const sceneId = P().startSceneId as string
    const id = S().addBlock(sceneId, 'show') as string
    const before = JSON.stringify(P())
    pauseHistory()
    S().updateBlock(sceneId, id, { placement: customPlacementFor({ position: 'center' }) })
    for (const x of [0.4, 0.3, 0.2]) {
      const b = P().scenes[sceneId].blocks.find((blk) => blk.id === id) as Of<'show'>
      if (b.placement.mode === 'custom') S().updateBlock(sceneId, id, { placement: { ...b.placement, xalign: x, yalign: 0.8 } })
    }
    resumeHistory()
    const moved = P().scenes[sceneId].blocks.find((b) => b.id === id) as Of<'show'>
    expect(moved.placement).toMatchObject({ mode: 'custom', xalign: 0.2, yalign: 0.8 })
    undo()
    expect(JSON.stringify(P())).toBe(before)
  })
})
