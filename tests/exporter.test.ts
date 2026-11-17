import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { compileProject } from '../src/shared/compiler'
import type { Project } from '../src/shared/model'
import { exportProject, setConfigName } from '../src/main/exporter'

const TEMPLATE_OPTIONS = 'define config.name = _("Old Name")\n\ndefine gui.show_name = True\n'
const TEMPLATE_GUI = 'define gui.accent_color = "#7c9cff"\n'
const TEMPLATE_SCREENS = 'screen say(who, what):\n    text what\n'
const TEMPLATE_SCRIPT = 'label start:\n    "Template script."\n    return\n'

function fixture(): Project {
  const project = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'demo.fabula.json'), 'utf8')) as Project
  const gate2 = project.scenes['s_gate2']
  if (gate2.ending.type === 'branch') gate2.ending.elseTarget = 's_end'
  return project
}


/** Delete scenes and point every arrow that led to them at the start scene. */
function removeScenes(project: Project, ids: string[]): Project {
  const next: Project = JSON.parse(JSON.stringify(project))
  for (const id of ids) delete next.scenes[id]
  const fix = (t: string | null): string | null => (t && !next.scenes[t] ? 's_start' : t)
  for (const s of Object.values(next.scenes)) {
    if (s.ending.type === 'jump') s.ending.target = fix(s.ending.target)
    if (s.ending.type === 'choice') for (const o of s.ending.options) o.target = fix(o.target)
    if (s.ending.type === 'branch') {
      for (const c of s.ending.cases) c.target = fix(c.target)
      s.ending.elseTarget = fix(s.ending.elseTarget)
    }
    if (s.ending.type === 'code') for (const x of s.ending.exits) x.target = fix(x.target)
  }
  return next
}

let work: string
let editor: string
let renpy: string

function listFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base))
    else out.push(full.slice(base.length + 1).replace(/\\/g, '/'))
  }
  return out.sort()
}

function snapshot(dir: string): Record<string, { content: string; mtime: number }> {
  const out: Record<string, { content: string; mtime: number }> = {}
  for (const rel of listFiles(dir)) {
    const full = join(dir, ...rel.split('/'))
    out[rel] = { content: readFileSync(full).toString('base64'), mtime: statSync(full).mtimeMs }
  }
  return out
}

function ready(project: Project): Project {
  for (const asset of Object.values(project.assets)) {
    const full = join(editor, 'assets', ...asset.file.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, `bytes of ${asset.id}`)
  }
  return { ...project, renpyProjectDir: renpy }
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'fabula-export-'))
  editor = join(work, 'editor')
  renpy = join(work, 'game-project')
  mkdirSync(editor, { recursive: true })
  mkdirSync(join(renpy, 'game', 'gui'), { recursive: true })
  writeFileSync(join(renpy, 'game', 'options.rpy'), TEMPLATE_OPTIONS)
  writeFileSync(join(renpy, 'game', 'gui.rpy'), TEMPLATE_GUI)
  writeFileSync(join(renpy, 'game', 'screens.rpy'), TEMPLATE_SCREENS)
  writeFileSync(join(renpy, 'game', 'script.rpy'), TEMPLATE_SCRIPT)
  writeFileSync(join(renpy, 'game', 'gui', 'button.png'), 'png')
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

describe('exportProject', () => {
  it('refuses to export a story with errors and returns the problems', () => {
    const project = ready(fixture())
    project.startSceneId = null
    const result = exportProject(editor, project)
    expect(result.ok).toBe(false)
    expect(result.problems?.some((p) => p.severity === 'error')).toBe(true)
    expect(existsSync(join(editor, 'export-manifest.json'))).toBe(false)
    expect(readFileSync(join(renpy, 'game', 'script.rpy'), 'utf8')).toBe(TEMPLATE_SCRIPT)
  })

  it("needs a linked Ren'Py game", () => {
    const project = ready(fixture())
    project.renpyProjectDir = null
    expect(exportProject(editor, project).ok).toBe(false)
    project.renpyProjectDir = join(work, 'nowhere')
    expect(exportProject(editor, project).ok).toBe(false)
  })

  it('writes the compiled files and assets, and the manifest in the editor folder', () => {
    const project = ready(fixture())
    const result = exportProject(editor, project)
    expect(result.ok).toBe(true)
    const compiled = compileProject(project)
    for (const f of compiled.files) {
      expect(readFileSync(join(renpy, 'game', f.path), 'utf8')).toBe(f.content)
    }
    for (const a of compiled.assetCopies) {
      expect(readFileSync(join(renpy, 'game', ...a.to.split('/')), 'utf8')).toBe(`bytes of ${a.assetId}`)
    }
    const manifest = JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')) as { files: string[] }
    expect(manifest.files).toContain('act_one.rpy')
    expect(manifest.files).toContain('images/bg/bg forest.png')
    expect(result.sceneLocations).toEqual(compiled.sceneLocations)
    expect(readFileSync(join(renpy, 'game', 'options.rpy'), 'utf8')).toContain('define config.name = _("Demo Story")')
  })

  it("exports nothing but game files into the Ren'Py project", () => {
    const project = ready(fixture())
    const before = listFiles(renpy)
    exportProject(editor, project)
    const added = listFiles(renpy).filter((f) => !before.includes(f))
    expect(added.length).toBeGreaterThan(0)
    for (const f of added) expect(f.startsWith('game/')).toBe(true)
    expect(added.some((f) => /manifest|fabula|backup/i.test(f))).toBe(false)
  })

  it('a second export changes no file', async () => {
    const project = ready(fixture())
    exportProject(editor, project)
    const first = snapshot(renpy)
    const manifestFirst = statSync(join(editor, 'export-manifest.json')).mtimeMs
    await new Promise((r) => setTimeout(r, 30))
    const second = exportProject(editor, project)
    expect(second.ok).toBe(true)
    expect(second.changed).toEqual([])
    expect(snapshot(renpy)).toEqual(first)
    expect(statSync(join(editor, 'export-manifest.json')).mtimeMs).toBe(manifestFirst)
  })

  it('re-copies an asset whose source changed', () => {
    const project = ready(fixture())
    exportProject(editor, project)
    const asset = project.assets['a_forest']
    const src = join(editor, 'assets', ...asset.file.split('/'))
    writeFileSync(src, 'new picture, different size')
    utimesSync(src, new Date(), new Date(Date.now() + 5000))
    const result = exportProject(editor, project)
    expect(result.changed).toEqual(['images/bg/bg forest.png'])
    expect(readFileSync(join(renpy, 'game', 'images', 'bg', 'bg forest.png'), 'utf8')).toBe('new picture, different size')
  })

  it("removes a deleted chapter's file with its .rpyc, and its labels", () => {
    const project = ready(fixture())
    exportProject(editor, project)
    const actTwo = join(renpy, 'game', 'act_two.rpy')
    expect(readFileSync(actTwo, 'utf8')).toContain('label ')
    writeFileSync(`${actTwo}c`, 'compiled')

    const trimmed = removeScenes(project, ['s_gate2', 's_door', 's_end'])
    const result = exportProject(editor, trimmed)
    expect(result.error).toBeUndefined()
    expect(result.ok).toBe(true)
    expect(existsSync(actTwo)).toBe(false)
    expect(existsSync(`${actTwo}c`)).toBe(false)
    const all = listFiles(join(renpy, 'game'))
      .filter((f) => f.endsWith('.rpy'))
      .map((f) => readFileSync(join(renpy, 'game', f), 'utf8'))
      .join('\n')
    expect(all).not.toContain('label locked_door')
    const manifest = JSON.parse(readFileSync(join(editor, 'export-manifest.json'), 'utf8')) as { files: string[] }
    expect(manifest.files).not.toContain('act_two.rpy')
  })

  it('deletes a scene label from a file that remains', () => {
    const project = ready(fixture())
    exportProject(editor, project)
    expect(readFileSync(join(renpy, 'game', 'script.rpy'), 'utf8')).toMatch(/label secret:/)
    const trimmed = removeScenes(project, ['s_secret'])
    exportProject(editor, trimmed)
    const script = readFileSync(join(renpy, 'game', 'script.rpy'), 'utf8')
    expect(script).not.toMatch(/label secret:/)
    expect(script).toContain('label start:')
  })

  it('backs up a script.rpy that is not in the manifest before replacing it, once', () => {
    const project = ready(fixture())
    exportProject(editor, project, { now: () => new Date(2026, 0, 2, 3, 4, 5) })
    const backup = join(editor, 'backups', '20260102-030405', 'script.rpy')
    expect(readFileSync(backup, 'utf8')).toBe(TEMPLATE_SCRIPT)
    // now it is in the manifest, so a changed export does not back it up again
    const changed: Project = JSON.parse(JSON.stringify(project))
    changed.scenes['s_secret'].name = 'Hidden'
    exportProject(editor, changed, { now: () => new Date(2026, 0, 2, 3, 4, 9) })
    expect(readdirSync(join(editor, 'backups'))).toEqual(['20260102-030405'])
  })

  it('leaves gui.rpy, screens.rpy and gui/ byte-identical', () => {
    const project = ready(fixture())
    const guarded = ['game/gui.rpy', 'game/screens.rpy', 'game/gui/button.png']
    const before = guarded.map((f) => readFileSync(join(renpy, f)))
    exportProject(editor, project)
    exportProject(editor, project)
    guarded.forEach((f, i) => expect(readFileSync(join(renpy, f)).equals(before[i])).toBe(true))
  })

  it('leaves options.rpy alone when the name line is not there', () => {
    writeFileSync(join(renpy, 'game', 'options.rpy'), 'define gui.something = 1\n')
    exportProject(editor, ready(fixture()))
    expect(readFileSync(join(renpy, 'game', 'options.rpy'), 'utf8')).toBe('define gui.something = 1\n')
  })

  it('fails with a readable message when an uploaded file is missing, before touching the game', () => {
    const project = ready(fixture())
    rmSync(join(editor, 'assets', 'backgrounds', 'a_forest.png'))
    const result = exportProject(editor, project)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('backgrounds/a_forest.png')
    expect(readFileSync(join(renpy, 'game', 'script.rpy'), 'utf8')).toBe(TEMPLATE_SCRIPT)
  })

  it('writes no comment and no tool name into the exported scripts', () => {
    const project = ready(fixture())
    exportProject(editor, project)
    const ours = ['script.rpy', 'act_one.rpy', 'act_two.rpy']
    for (const f of ours) {
      const text = readFileSync(join(renpy, 'game', f), 'utf8')
      expect(text).not.toMatch(/^s*#/m)
      expect(text).not.toMatch(/fabula|generated/i)
    }
  })

  it('never writes outside game/ even if the old manifest was tampered with', () => {
    const victim = join(work, 'victim.txt')
    writeFileSync(victim, 'keep me')
    writeFileSync(join(editor, 'export-manifest.json'), JSON.stringify({ files: ['../victim.txt', '../../victim.txt', 'gui.rpy'] }))
    exportProject(editor, ready(fixture()))
    expect(readFileSync(victim, 'utf8')).toBe('keep me')
    expect(readFileSync(join(renpy, 'game', 'gui.rpy'), 'utf8')).toBe(TEMPLATE_GUI)
  })
})

describe('setConfigName', () => {
  it('replaces only the value of the name line', () => {
    expect(setConfigName(TEMPLATE_OPTIONS, 'My "Story"')).toBe('define config.name = _("My \\"Story\\"")\n\ndefine gui.show_name = True\n')
  })
  it('keeps a dollar sign in the title literal', () => {
    expect(setConfigName(TEMPLATE_OPTIONS, 'Cash $& more')).toContain('_("Cash $& more")')
  })
  it('returns null when there is no such line', () => {
    expect(setConfigName('define x = 1\n', 'T')).toBeNull()
  })
})
