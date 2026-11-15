import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { buildAssetUrl } from '@shared/ipc'
import { resolveAssetPath } from './projectFiles'

export const ASSET_SCHEME = 'vnasset'

/** Must run before app.whenReady(). */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ASSET_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}

/** Parse vnasset://p/<encoded dir>/<file> into its parts, or null if malformed. */
export function parseAssetUrl(rawUrl: string): { dir: string; file: string } | null {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }
  const parts = url.pathname.split('/').filter((_, i) => i > 0)
  if (parts.length < 2) return null
  try {
    return { dir: decodeURIComponent(parts[0]), file: parts.slice(1).map(decodeURIComponent).join('/') }
  } catch {
    return null
  }
}

/** Must run after app.whenReady(). */
export function registerAssetProtocolHandler(): void {
  protocol.handle(ASSET_SCHEME, (request) => {
    const parsed = parseAssetUrl(request.url)
    const target = parsed ? resolveAssetPath(parsed.dir, parsed.file) : null
    if (!target) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

export function assetUrl(dir: string, file: string): string {
  return buildAssetUrl(dir, file)
}
