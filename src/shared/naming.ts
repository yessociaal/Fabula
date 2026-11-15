import type { AssetKind, Id, Project, Scene } from './model'

export function slugify(s: string, fallback: string): string {
  let out = s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (out === '') out = fallback
  if (/^[0-9]/.test(out)) out = `${fallback}_${out}`
  return out
}

export const RESERVED_WORDS: ReadonlySet<string> = new Set(
  (
    'and as assert async await break class continue def del elif else except finally for from global if import in is ' +
    'lambda nonlocal not or pass raise return try while with yield none true false ' +
    'start quit main_menu splashscreen after_load before_main_menu after_warp left right center truecenter top bottom ' +
    'topleft topright default reset fade dissolve pixellate move ease hpunch vpunch blinds squares wipeleft wiperight ' +
    'slideleft slideright zoomin zoomout config gui persistent renpy store style layout define narrator centered extend ' +
    'adv nvl menu bg black white say show hide scene play stop pause call jump label init python image transform screen'
  ).split(' ')
)

export interface NameTable {
  /** scene id -> label */
  sceneLabels: Record<Id, string>
  /** character id -> variable name / image tag */
  characters: Record<Id, string>
  /** variable id -> variable name */
  variables: Record<Id, string>
  /** expression id -> attribute name (unique per character) */
  expressions: Record<Id, string>
  /** background asset id -> image name, e.g. "bg forest" */
  backgrounds: Record<Id, string>
  /** asset id (all kinds except backgrounds) -> file stem (unique per kind) */
  stems: Record<Id, string>
  /** chapter id -> file name, e.g. "act_one.rpy" */
  chapterFiles: Record<Id, string>
}

const TAKEN_FILES = ['script', 'gui', 'screens', 'options']

const STEM_FALLBACK: Record<AssetKind, string> = {
  background: 'scene',
  sprite: 'sprite',
  music: 'track',
  sound: 'sound',
  ambient: 'ambient',
  voice: 'voice',
  movie: 'movie',
  ui: 'ui',
  font: 'font'
}

function unique(base: string, taken: Set<string>): string {
  let name = base
  let n = 2
  while (taken.has(name)) name = `${base}_${n++}`
  taken.add(name)
  return name
}

export function sceneOrder(project: Project): Scene[] {
  const chapterIndex = (s: Scene): number => {
    if (s.chapterId === null) return -1
    const i = project.chapterOrder.indexOf(s.chapterId)
    return i === -1 ? project.chapterOrder.length : i
  }
  return Object.values(project.scenes).sort(
    (a, b) =>
      chapterIndex(a) - chapterIndex(b) ||
      a.position.y - b.position.y ||
      a.position.x - b.position.x ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

export function buildNameTable(project: Project): NameTable {
  const table: NameTable = {
    sceneLabels: {},
    characters: {},
    variables: {},
    expressions: {},
    backgrounds: {},
    stems: {},
    chapterFiles: {}
  }

  // Scene labels. Unchaptered scenes first, then by chapter order.
  const labels = new Set<string>()
  if (project.startSceneId && project.scenes[project.startSceneId]) {
    table.sceneLabels[project.startSceneId] = 'start'
    labels.add('start')
  }
  for (const scene of sceneOrder(project)) {
    if (scene.id === project.startSceneId) continue
    let slug = slugify(scene.name, 'scene')
    if (RESERVED_WORDS.has(slug)) slug += '_scene'
    table.sceneLabels[scene.id] = unique(slug, labels)
  }

  // Store namespace: characters, then variables.
  const store = new Set<string>()
  for (const cid of project.characterOrder) {
    const c = project.characters[cid]
    if (!c) continue
    let slug = slugify(c.name, 'character')
    if (RESERVED_WORDS.has(slug)) slug += '_char'
    table.characters[cid] = unique(slug, store)
    const attrs = new Set<string>()
    for (const e of c.expressions) {
      table.expressions[e.id] = unique(slugify(e.name, 'default'), attrs)
    }
  }
  for (const vid of project.variableOrder) {
    const v = project.variables[vid]
    if (!v) continue
    let slug = slugify(v.name, 'value')
    if (RESERVED_WORDS.has(slug)) slug += '_value'
    table.variables[vid] = unique(slug, store)
  }

  // Assets in id-sorted order (assets have no order array), per-kind namespaces.
  const perKind = new Map<AssetKind, Set<string>>()
  const assets = Object.values(project.assets).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const a of assets) {
    let taken = perKind.get(a.kind)
    if (!taken) perKind.set(a.kind, (taken = new Set()))
    const stem = unique(slugify(a.name, STEM_FALLBACK[a.kind]), taken)
    if (a.kind === 'background') table.backgrounds[a.id] = `bg ${stem}`
    else table.stems[a.id] = stem
  }

  // Chapter files.
  const files = new Set<string>(TAKEN_FILES)
  for (const chid of project.chapterOrder) {
    const ch = project.chapters[chid]
    if (!ch) continue
    table.chapterFiles[chid] = `${unique(slugify(ch.name, 'chapter'), files)}.rpy`
  }
  return table
}
