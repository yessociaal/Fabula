import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  STORY_FILE,
  createEditorProject,
  deleteAssetFile,
  importAsset,
  importAssetData,
  openEditorProject,
  resolveAssetPath,
  sanitiseFolderName,
  saveProject
} from '../src/main/projectFiles'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fabula-test-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const fakeReader = () => ({ width: 640, height: 480 })
const exists = (p: string) => stat(p).then(() => true, () => false)

describe('createEditorProject / openEditorProject', () => {
  it('creates a folder named after the title with one scene called Start', async () => {
    const { dir, project } = await createEditorProject(root, 'My Story')
    expect(dir).toBe(join(root, 'My Story'))
    expect(Object.values(project.scenes).map((s) => s.name)).toEqual(['Start'])
    expect(project.startSceneId).toBe(Object.keys(project.scenes)[0])
    expect(await exists(join(dir, STORY_FILE))).toBe(true)
    expect(await exists(join(dir, 'assets'))).toBe(true)
  })

  it('sanitises illegal characters in the folder name', async () => {
    const { dir } = await createEditorProject(root, 'What: a "story"? <1>')
    expect(dir).toBe(join(root, 'What a story 1'))
    expect(sanitiseFolderName('...')).toBe('Untitled story')
    expect(sanitiseFolderName('CON')).toBe('Untitled story')
  })

  it('fails clearly when the folder exists and is not empty, but accepts an empty one', async () => {
    await mkdir(join(root, 'Taken'))
    await writeFile(join(root, 'Taken', 'x.txt'), 'x')
    await expect(createEditorProject(root, 'Taken')).rejects.toThrow(/already exists and is not empty/)
    await mkdir(join(root, 'Empty'))
    await expect(createEditorProject(root, 'Empty')).resolves.toBeTruthy()
  })

  it('round-trips through open', async () => {
    const created = await createEditorProject(root, 'Round Trip')
    const opened = await openEditorProject(created.dir)
    expect(opened.project).toEqual(created.project)
  })

  it('gives a readable error for a missing folder, a missing file, corrupt JSON and an invalid story', async () => {
    await expect(openEditorProject(join(root, 'nope'))).rejects.toThrow(/could not be found/)

    const dir = join(root, 'broken')
    await mkdir(dir)
    await expect(openEditorProject(dir)).rejects.toThrow(/no story/i)

    await writeFile(join(dir, STORY_FILE), '{ not json', 'utf8')
    await expect(openEditorProject(dir)).rejects.toThrow(/damaged.*not valid JSON/s)

    await writeFile(join(dir, STORY_FILE), JSON.stringify({ formatVersion: 1 }), 'utf8')
    await expect(openEditorProject(dir)).rejects.toThrow(/damaged/)
  })
})

describe('saveProject', () => {
  it('writes the story as 2-space JSON and leaves no temp file behind', async () => {
    const { dir, project } = await createEditorProject(root, 'Save Me')
    project.meta.title = 'Renamed'
    await saveProject(dir, project)
    const text = await readFile(join(dir, STORY_FILE), 'utf8')
    expect(text).toBe(JSON.stringify(project, null, 2) + '\n')
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })

  it('keeps the old file intact when the write cannot complete (atomic)', async () => {
    const { dir, project } = await createEditorProject(root, 'Atomic')
    const before = await readFile(join(dir, STORY_FILE), 'utf8')
    // A circular structure makes serialisation throw before anything is written.
    const bad = { ...project } as Record<string, unknown>
    bad.self = bad
    await expect(saveProject(dir, bad as never)).rejects.toThrow()
    expect(await readFile(join(dir, STORY_FILE), 'utf8')).toBe(before)
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([])
  })
})

describe('assets', () => {
  it('importAssetData writes assets/<kind>s/<id>.<ext> and reads image size with the injected reader', async () => {
    const { dir } = await createEditorProject(root, 'Assets')
    const asset = await importAssetData(dir, 'background', 'Forest Day.PNG', new Uint8Array([1, 2, 3, 4]).buffer, fakeReader)
    expect(asset.kind).toBe('background')
    expect(asset.name).toBe('Forest Day')
    expect(asset.width).toBe(640)
    expect(asset.height).toBe(480)
    expect(asset.bytes).toBe(4)
    expect(asset.file).toBe(`backgrounds/${asset.id}.png`)
    expect(asset.id).toHaveLength(10)
    expect([...(await readFile(join(dir, 'assets', asset.file)))]).toEqual([1, 2, 3, 4])
  })

  it('importAsset copies the source file and leaves it in place', async () => {
    const { dir } = await createEditorProject(root, 'Copy')
    const src = join(root, 'theme.ogg')
    await writeFile(src, 'audio-bytes')
    const asset = await importAsset(dir, 'music', src, fakeReader)
    expect(asset.file).toBe(`music/${asset.id}.ogg`)
    expect(asset.width).toBeNull()
    expect(asset.height).toBeNull()
    expect(asset.bytes).toBe('audio-bytes'.length)
    expect(await readFile(join(dir, 'assets', asset.file), 'utf8')).toBe('audio-bytes')
    expect(await exists(src)).toBe(true)
  })

  it('rejects unsupported extensions with a message naming the allowed types', async () => {
    const { dir } = await createEditorProject(root, 'Reject')
    await expect(importAssetData(dir, 'sprite', 'virus.exe', new ArrayBuffer(1))).rejects.toThrow(/\.png \.jpg \.jpeg \.webp/)
    await expect(importAssetData(dir, 'music', 'pic.png', new ArrayBuffer(1))).rejects.toThrow(/\.ogg \.mp3 \.wav \.opus \.flac/)
    const src = join(root, 'a.txt')
    await writeFile(src, 'x')
    await expect(importAsset(dir, 'sound', src)).rejects.toThrow(/Allowed file types/)
    expect(await exists(join(dir, 'assets', 'sprites'))).toBe(false)
  })

  it('deleteAssetFile removes the file and refuses paths outside assets/', async () => {
    const { dir } = await createEditorProject(root, 'Delete')
    const asset = await importAssetData(dir, 'sound', 'door.wav', new ArrayBuffer(2))
    await deleteAssetFile(dir, asset.file)
    expect(await exists(join(dir, 'assets', asset.file))).toBe(false)
    await expect(deleteAssetFile(dir, '../story.fabula.json')).rejects.toThrow(/not inside/)
    await expect(deleteAssetFile(dir, '..\\story.fabula.json')).rejects.toThrow(/not inside/)
    expect(await exists(join(dir, STORY_FILE))).toBe(true)
  })
})

describe('resolveAssetPath (path guard)', () => {
  const dir = join(tmpdir(), 'fabula-guard-story')
  const assets = join(dir, 'assets')

  it('accepts files inside assets', () => {
    expect(resolveAssetPath(dir, 'sprites/abc.png')).toBe(join(assets, 'sprites', 'abc.png'))
    expect(resolveAssetPath(dir, 'sprites/../music/a.ogg')).toBe(join(assets, 'music', 'a.ogg'))
  })

  it.each([
    '../story.fabula.json',
    '../../etc/passwd',
    'sprites/../../story.fabula.json',
    '..\\story.fabula.json',
    'sprites\\..\\..\\story.fabula.json',
    '..',
    '.',
    '',
    '/etc/passwd',
    '\\windows\\system32',
    'C:\\windows\\win.ini',
    'C:/windows/win.ini',
    'a\0b.png'
  ])('rejects %j', (file) => {
    expect(resolveAssetPath(dir, file)).toBeNull()
  })

  it('rejects a sibling folder that merely starts with "assets"', () => {
    expect(resolveAssetPath(dir, '../assets-evil/x.png')).toBeNull()
  })
})
