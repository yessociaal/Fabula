import type { AssetKind } from './model'

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']
export const AUDIO_EXTENSIONS = ['.ogg', '.mp3', '.wav', '.opus', '.flac']
export const MOVIE_EXTENSIONS = ['.webm', '.ogv', '.mkv', '.mp4']
export const FONT_EXTENSIONS = ['.ttf', '.otf']

export const ALLOWED_EXTENSIONS: Record<AssetKind, string[]> = {
  background: IMAGE_EXTENSIONS,
  sprite: IMAGE_EXTENSIONS,
  ui: IMAGE_EXTENSIONS,
  music: AUDIO_EXTENSIONS,
  sound: AUDIO_EXTENSIONS,
  ambient: AUDIO_EXTENSIONS,
  voice: AUDIO_EXTENSIONS,
  movie: MOVIE_EXTENSIONS,
  font: FONT_EXTENSIONS
}

/** Folder under <editorProject>/assets for each kind. */
export const ASSET_FOLDERS: Record<AssetKind, string> = {
  background: 'backgrounds',
  sprite: 'sprites',
  music: 'music',
  sound: 'sounds',
  ambient: 'ambient',
  voice: 'voice',
  movie: 'movies',
  ui: 'ui',
  font: 'fonts'
}

export function isImageKind(kind: AssetKind): boolean {
  return ALLOWED_EXTENSIONS[kind] === IMAGE_EXTENSIONS
}

export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i).toLowerCase()
}

/** Throws an Error naming the allowed types when the file name's extension is not accepted for this kind. */
export function checkAssetExtension(kind: AssetKind, fileName: string): string {
  const ext = fileExtension(fileName)
  if (!ALLOWED_EXTENSIONS[kind].includes(ext)) {
    const base = fileName.split(/[\\/]/).pop() ?? fileName
    throw new Error(`"${base}" can't be used here. Allowed file types for ${kind}: ${ALLOWED_EXTENSIONS[kind].join(' ')}`)
  }
  return ext
}
