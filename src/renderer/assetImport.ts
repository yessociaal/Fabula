import type { Asset, AssetKind, Id } from '@shared/model'
import { cleanErrorMessage } from '@shared/ipc'
import { api } from './api'
import { toast } from './components/Toast'
import { useProjectStore } from './store/projectStore'

/**
 * Import dropped or chosen files as assets of `kind`. Each accepted file becomes an Asset (named after the file
 * without its extension). Each rejected file gives ONE toast naming the allowed types. Returns the added assets.
 */
export async function importFiles(files: File[], kind: AssetKind): Promise<Asset[]> {
  const added: Asset[] = []
  for (const file of files) {
    const dir = useProjectStore.getState().dir
    if (!dir) return added
    try {
      const data = await file.arrayBuffer()
      const asset = await api.importAssetData(dir, kind, file.name, data)
      useProjectStore.getState().addAsset(asset)
      added.push(asset)
    } catch (e) {
      toast(cleanErrorMessage(e), 'error')
    }
  }
  return added
}

/** Replace the file behind an existing asset (same id, same name). The old file is deleted afterwards. */
export async function replaceAssetFile(assetId: Id, file: File): Promise<boolean> {
  const { dir, project } = useProjectStore.getState()
  const old = project?.assets[assetId]
  if (!dir || !old) return false
  try {
    const data = await file.arrayBuffer()
    const next = await api.importAssetData(dir, old.kind, file.name, data)
    useProjectStore.getState().replaceAssetFile(assetId, {
      file: next.file,
      width: next.width,
      height: next.height,
      bytes: next.bytes
    })
    await api.deleteAssetFile(dir, old.file).catch(() => undefined)
    return true
  } catch (e) {
    toast(cleanErrorMessage(e), 'error')
    return false
  }
}
