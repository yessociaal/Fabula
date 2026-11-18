import { mkdtemp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectUnusedAssetFiles, createEditorProject, importAssetData, referencedAssetFiles } from '../src/main/projectFiles'
import { addDismissedHint, parseStoredSettings } from '../src/main/settings'
import { SHORTCUT_GROUPS } from '../src/renderer/shortcuts'
import { redo, undo, useProjectStore } from '../src/renderer/store/projectStore'
import { nextChapter, sameExceptPositions } from '../src/renderer/views/StoryMap/mapModel'
import { createAsset, createBlock, createKitBlock, createKitEnding, createProject } from '../src/shared/factory'
import type { Project } from '../src/shared/model'

const S = (): ReturnType<typeof useProjectStore.getState> => useProjectStore.getState()
const P = (): Project => S().project!
const exists = (p: string) => stat(p).then(() => true, () => false)

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'fabula-p16-'))
  S().loadProject('C:/story', createProject('Test'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('asset files that nothing points at', () => {
  it('collectUnusedAssetFiles removes unreferenced files and keeps the referenced ones', async () => {
    const { dir, project } = await createEditorProject(root, 'GC')
    const keep = await importAssetData(dir, 'background', 'keep.png', new ArrayBuffer(4))
    const old = await importAssetData(dir, 'background', 'old.png', new ArrayBuffer(4))
    const music = await importAssetData(dir, 'music', 'tune.ogg', new ArrayBuffer(4))
    project.assets[keep.id] = keep
    project.assets[music.id] = music
    // a file that is not an asset folder file stays untouched
    await mkdir(join(dir, 'assets', 'notes'), { recursive: true })
    await writeFile(join(dir, 'assets', 'notes', 'readme.txt'), 'mine')

    const removed = await collectUnusedAssetFiles(dir, project)
    expect(removed).toEqual([old.file])
    expect(await exists(join(dir, 'assets', keep.file))).toBe(true)
    expect(await exists(join(dir, 'assets', music.file))).toBe(true)
    expect(await exists(join(dir, 'assets', old.file))).toBe(false)
    expect(await exists(join(dir, 'assets', 'notes', 'readme.txt'))).toBe(true)
    expect(await readdir(join(dir, 'assets', 'backgrounds'))).toHaveLength(1)
    // nothing left to collect the second time
    expect(await collectUnusedAssetFiles(dir, project)).toEqual([])
  })

  it('matches file names without caring about case or slash direction', () => {
    const p = createProject('x')
    const a = createAsset('background', 'a', 'Backgrounds\\ABC.PNG')
    p.assets[a.id] = a
    expect(referencedAssetFiles(p).has('backgrounds/abc.png')).toBe(true)
  })

  it('replacing an asset file can be undone: the record points at the old file again', () => {
    const a = createAsset('background', 'Forest', 'backgrounds/old.png')
    S().addAsset(a)
    S().replaceAssetFile(a.id, { file: 'backgrounds/new.png', width: 1, height: 1, bytes: 1 })
    expect(P().assets[a.id].file).toBe('backgrounds/new.png')
    undo()
    expect(P().assets[a.id].file).toBe('backgrounds/old.png')
    redo()
    expect(P().assets[a.id].file).toBe('backgrounds/new.png')
  })

  it('deleting an asset leaves no reference to it, kit forms included', () => {
    const a = createAsset('sprite', 'Face', 'sprites/face.png')
    S().addAsset(a)
    const sceneId = P().startSceneId!
    const bg = createBlock('background')
    if (bg.type === 'background') bg.assetId = a.id
    S().addBlock(sceneId, 'background')
    const kitBlock = createKitBlock('k', 'b', { picture: a.id, other: 'x', list: [{ id: 'i1', image: a.id, keep: 'y' }] })
    useProjectStore.setState((s) => {
      s.project!.scenes[sceneId].blocks.push(kitBlock)
      s.project!.scenes[sceneId].ending = createKitEnding('k', 'e', { image: a.id })
    })
    S().deleteAsset(a.id)
    const text = JSON.stringify(P())
    expect(text).not.toContain(a.id)
    const blocks = P().scenes[sceneId].blocks
    const kb = blocks.find((b) => b.type === 'kit')
    expect(kb && kb.type === 'kit' ? kb.params : null).toEqual({ picture: '', other: 'x', list: [{ id: 'i1', image: '', keep: 'y' }] })
  })
})

describe('hints, chapters and shortcuts', () => {
  it('remembers closed hint cards in the settings (and leaves them out while there are none)', () => {
    expect(parseStoredSettings({ sdkDir: null, recent: [] })).toEqual({ sdkDir: null, recent: [] })
    expect(addDismissedHint(undefined, 'map')).toEqual(['map'])
    expect(addDismissedHint(['map'], 'map')).toEqual(['map'])
    expect(addDismissedHint(['map'], 'scene')).toEqual(['map', 'scene'])
    expect(parseStoredSettings({ dismissedHints: ['map', 'map', 3, '', 'scene'] }).dismissedHints).toEqual(['map', 'scene'])
    expect(parseStoredSettings({ dismissedHints: 'x' }).dismissedHints).toBeUndefined()
  })

  it('a new chapter never reuses the name of an existing one', () => {
    const a = S().addChapter('Chapter 1', '#fff')
    S().addChapter('Chapter 2', '#fff')
    S().deleteChapter(a)
    expect(nextChapter(P()).name).toBe('Chapter 3')
    const c = S().addChapter('Chapter 3', '#fff')
    expect(P().chapters[c].name).toBe('Chapter 3')
  })

  it('deleting a chapter leaves its scenes uncategorised', () => {
    const c = S().addChapter('One', '#fff')
    const s = S().addScene({ x: 0, y: 0 }, 'In chapter')
    S().setSceneChapter(s, c)
    S().deleteChapter(c)
    expect(P().scenes[s].chapterId).toBeNull()
    expect(P().chapterOrder).toEqual([])
  })

  it('the shortcut list has no duplicate entries and every key text is filled in', () => {
    const lines = SHORTCUT_GROUPS.flatMap((g) => g.items.map((i) => `${g.title}|${i.keys}`))
    expect(new Set(lines).size).toBe(lines.length)
    for (const g of SHORTCUT_GROUPS) for (const i of g.items) expect(i.keys && i.does).toBeTruthy()
  })
})

describe('saving before the window closes', () => {
  it('saves when there is something unsaved, reports a failed save, and does nothing when everything is saved', async () => {
    const { vi } = await import('vitest')
    const saveProject = vi.fn(async () => undefined)
    vi.stubGlobal('window', { api: { saveProject } })
    try {
      // loaded through a variable: this module pulls in React code that the node type-check cannot read
      const autosavePath = '../src/renderer/store/autosave'
      const { saveBeforeQuit, useSaveStatus } = (await import(/* @vite-ignore */ autosavePath)) as {
        saveBeforeQuit: () => Promise<boolean>
        useSaveStatus: { getState: () => { status: string } }
      }
      // nothing changed since the story was loaded
      expect(await saveBeforeQuit()).toBe(true)
      expect(saveProject).not.toHaveBeenCalled()
      // an unsaved change is written, and the answer is yes
      S().renameScene(P().startSceneId!, 'Changed')
      expect(S().dirty).toBe(true)
      expect(await saveBeforeQuit()).toBe(true)
      expect(saveProject).toHaveBeenCalledTimes(1)
      expect(S().dirty).toBe(false)
      expect(useSaveStatus.getState().status).toBe('saved')
      // a failing save is reported
      S().renameScene(P().startSceneId!, 'Changed again')
      saveProject.mockRejectedValueOnce(new Error('disk full'))
      expect(await saveBeforeQuit()).toBe(false)
      expect(S().dirty).toBe(true)
      // and the next try (after the disk has room again) works
      expect(await saveBeforeQuit()).toBe(true)
      expect(S().dirty).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('map performance helper', () => {
  it('sameExceptPositions ignores card moves and nothing else', () => {
    const a = S().addScene({ x: 0, y: 0 }, 'A')
    S().addScene({ x: 100, y: 0 }, 'B')
    const before = P()
    S().moveScenes({ [a]: { x: 50, y: 60 } })
    const moved = P()
    expect(moved).not.toBe(before)
    expect(sameExceptPositions(before, moved)).toBe(true)
    S().renameScene(a, 'A2')
    expect(sameExceptPositions(moved, P())).toBe(false)
    const renamed = P()
    S().addBlock(a, 'say')
    expect(sameExceptPositions(renamed, P())).toBe(false)
    const withBlock = P()
    S().addScene({ x: 1, y: 1 }, 'C')
    expect(sameExceptPositions(withBlock, P())).toBe(false)
    const withC = P()
    S().updateMeta({ title: 'Other' })
    expect(sameExceptPositions(withC, P())).toBe(false)
  })
})
