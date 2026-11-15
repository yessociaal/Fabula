import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_RECENT,
  addRecent,
  checkSdkDir,
  loadSettings,
  parseStoredSettings,
  readSdkVersion,
  removeRecent,
  saveSettings
} from '../src/main/settings'
import type { RecentEntry } from '../src/shared/ipc'

const entry = (path: string, openedAt = 0, title = path): RecentEntry => ({ path, title, openedAt })

describe('recent list', () => {
  it('puts the newest first', () => {
    const list = addRecent(addRecent([], entry('C:\\a', 1)), entry('C:\\b', 2))
    expect(list.map((r) => r.path)).toEqual(['C:\\b', 'C:\\a'])
  })

  it('deduplicates by path (case-insensitive) and moves the entry to the front', () => {
    let list: RecentEntry[] = []
    list = addRecent(list, entry('C:\\a', 1, 'old title'))
    list = addRecent(list, entry('C:\\b', 2))
    list = addRecent(list, entry('c:\\A', 3, 'new title'))
    expect(list.map((r) => r.path)).toEqual(['c:\\A', 'C:\\b'])
    expect(list[0].title).toBe('new title')
  })

  it('keeps at most 10 entries, dropping the oldest', () => {
    let list: RecentEntry[] = []
    for (let i = 0; i < 15; i++) list = addRecent(list, entry(`C:\\s${i}`, i))
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0].path).toBe('C:\\s14')
    expect(list[9].path).toBe('C:\\s5')
  })

  it('removes an entry', () => {
    const list = removeRecent([entry('C:\\a'), entry('C:\\b')], 'c:\\A')
    expect(list.map((r) => r.path)).toEqual(['C:\\b'])
  })

  it('parseStoredSettings tolerates garbage and sorts/limits stored recents', () => {
    expect(parseStoredSettings(null)).toEqual({ sdkDir: null, recent: [] })
    expect(parseStoredSettings({ sdkDir: 5, recent: 'x' })).toEqual({ sdkDir: null, recent: [] })
    const many = Array.from({ length: 14 }, (_, i) => ({ path: `C:\\s${i}`, title: 't', openedAt: i }))
    const parsed = parseStoredSettings({ sdkDir: 'C:\\sdk', recent: [...many, { nope: 1 }, { path: 'C:\\S3', openedAt: 99 }] })
    expect(parsed.sdkDir).toBe('C:\\sdk')
    expect(parsed.recent).toHaveLength(10)
    expect(parsed.recent[0].path).toBe('C:\\S3')
  })
})

describe('SDK and settings file', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fabula-settings-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reads the version from renpy/vc_version.py, else from the folder name', async () => {
    const sdk = join(root, 'renpy-8.4.1-sdk')
    await mkdir(join(sdk, 'renpy'), { recursive: true })
    await writeFile(join(sdk, 'renpy.exe'), '')
    expect(readSdkVersion(sdk)).toBe('8.4.1')
    await writeFile(join(sdk, 'renpy', 'vc_version.py'), "branch = 'fix'\nversion = '8.3.7.25031702'\n")
    expect(readSdkVersion(sdk)).toBe('8.3.7')
    expect(checkSdkDir(sdk)).toEqual({ ok: true, version: '8.3.7' })
  })

  it('checkSdkDir fails when renpy.exe is missing', async () => {
    const r = checkSdkDir(join(root, 'nothing'))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/renpy\.exe/)
  })

  it('saves and loads settings.json', () => {
    const data = { sdkDir: 'C:\\sdk', recent: [entry('C:\\a', 5, 'A')] }
    saveSettings(join(root, 'userData'), data)
    expect(loadSettings(join(root, 'userData'))).toEqual(data)
  })
})
