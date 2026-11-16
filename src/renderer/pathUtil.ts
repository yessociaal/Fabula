/** Small string helpers for paths shown in the UI (the renderer cannot use node:path). */

export function joinPath(dir: string, name: string): string {
  if (dir.endsWith('\\') || dir.endsWith('/')) return `${dir}${name}`
  return `${dir}${dir.includes('\\') ? '\\' : '/'}${name}`
}

/** The folder that holds `p`. A root or a bare name returns itself. */
export function parentDir(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'))
  if (cut <= 0) return trimmed
  const head = trimmed.slice(0, cut)
  return /^[A-Za-z]:$/.test(head) ? `${head}${trimmed[cut]}` : head
}

/** A story title made safe to use as a folder name on Windows. */
export function safeFolderName(title: string): string {
  const t = title
    .replace(/[<>:"/\\|?*]/g, '')
    .trim()
    .replace(/[. ]+$/, '')
  return t || 'Untitled story'
}

/** `<parent of the story folder>/<Title> (Ren'Py game)` */
export function defaultGameDir(editorDir: string, title: string): string {
  return joinPath(parentDir(editorDir), `${safeFolderName(title)} (Ren'Py game)`)
}
