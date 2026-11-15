import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { RecentEntry } from '@shared/ipc'

export const DEFAULT_SDK_DIR = "C:\\Users\\youbl\\Documents\\Software\\Ren'py\\renpy-8.4.1-sdk"
export const MAX_RECENT = 10

/** What is stored in settings.json. */
export interface StoredSettings {
  sdkDir: string | null
  recent: RecentEntry[]
}

const samePath = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/** Newest first, no duplicates (case-insensitive path match), at most MAX_RECENT. */
export function addRecent(recent: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const rest = recent.filter((r) => !samePath(r.path, entry.path))
  return [entry, ...rest].slice(0, MAX_RECENT)
}

export function removeRecent(recent: RecentEntry[], path: string): RecentEntry[] {
  return recent.filter((r) => !samePath(r.path, path))
}

/** Tolerant parse: anything malformed falls back to defaults. */
export function parseStoredSettings(raw: unknown): StoredSettings {
  const out: StoredSettings = { sdkDir: null, recent: [] }
  if (!raw || typeof raw !== 'object') return out
  const obj = raw as Record<string, unknown>
  if (typeof obj.sdkDir === 'string' && obj.sdkDir) out.sdkDir = obj.sdkDir
  if (Array.isArray(obj.recent)) {
    const entries: RecentEntry[] = []
    for (const r of obj.recent) {
      if (!r || typeof r !== 'object') continue
      const e = r as Record<string, unknown>
      if (typeof e.path !== 'string' || !e.path) continue
      entries.push({
        path: e.path,
        title: typeof e.title === 'string' ? e.title : basename(e.path),
        openedAt: typeof e.openedAt === 'number' ? e.openedAt : 0
      })
    }
    out.recent = normaliseRecent(entries)
  }
  return out
}

function normaliseRecent(list: RecentEntry[]): RecentEntry[] {
  const seen = new Set<string>()
  const out: RecentEntry[] = []
  for (const r of [...list].sort((a, b) => b.openedAt - a.openedAt)) {
    const key = r.path.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out.slice(0, MAX_RECENT)
}

/** Version from <sdk>/renpy/vc_version.py (version = '8.4.1.…'), else from a folder name like renpy-8.4.1-sdk. */
export function readSdkVersion(sdkDir: string): string | null {
  try {
    const text = readFileSync(join(sdkDir, 'renpy', 'vc_version.py'), 'utf8')
    const m = /^\s*version\s*=\s*['"](\d+\.\d+(?:\.\d+)?)/m.exec(text)
    if (m) return m[1]
  } catch {
    // fall through to the folder name
  }
  const m = /renpy-(\d+(?:\.\d+)+)/i.exec(basename(sdkDir.replace(/[\\/]+$/, '')))
  return m ? m[1] : null
}

export function checkSdkDir(dir: string): { ok: boolean; version?: string; error?: string } {
  if (!existsSync(join(dir, 'renpy.exe'))) {
    return { ok: false, error: 'renpy.exe was not found in that folder. Pick the folder you unzipped the Ren\'Py SDK into.' }
  }
  return { ok: true, version: readSdkVersion(dir) ?? 'unknown' }
}

// ---------- file access (userDataDir is passed in, so this stays free of electron) ----------

const settingsFile = (userDataDir: string): string => join(userDataDir, 'settings.json')

export function loadSettings(userDataDir: string): StoredSettings {
  const file = settingsFile(userDataDir)
  if (!existsSync(file)) {
    // First run: default to the known SDK location when it exists.
    const first: StoredSettings = { sdkDir: existsSync(join(DEFAULT_SDK_DIR, 'renpy.exe')) ? DEFAULT_SDK_DIR : null, recent: [] }
    return first
  }
  try {
    return parseStoredSettings(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return { sdkDir: null, recent: [] }
  }
}

export function saveSettings(userDataDir: string, settings: StoredSettings): void {
  mkdirSync(userDataDir, { recursive: true })
  const file = settingsFile(userDataDir)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}
