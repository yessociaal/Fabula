import { join } from 'node:path'
import { listKits } from '../../src/main/kits'
import type { LoadedKit } from '../../src/shared/kits/types'

export const BUILT_IN_KITS_DIR = join(__dirname, '..', '..', 'resources', 'kits')

/** The kits that come with the app, loaded from the repository's resources folder. */
export function builtInKits(): LoadedKit[] {
  return listKits('', BUILT_IN_KITS_DIR)
}

export const kitContext = (): { kits: LoadedKit[] } => ({ kits: builtInKits() })
