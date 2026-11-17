import { findBlockDef, findKit } from '@shared/kits/types'
import type { Block, Id } from '@shared/model'
import { useKitStore } from '../../../store/kitStore'
import { useProjectStore } from '../../../store/projectStore'
import { KitForm } from './KitForm'

type KitBlock = Extract<Block, { type: 'kit' }>

/** The form of a kit block, generated from the kit's manifest. */
export function KitInspector({ sceneId, block }: { sceneId: Id; block: KitBlock }) {
  const kit = useKitStore((s) => findKit(s, block.kitId))
  const enabled = useProjectStore((s) => s.project?.kits.includes(block.kitId) ?? false)
  const setKitParams = useProjectStore((s) => s.setKitParams)
  const def = findBlockDef(kit, block.blockType)
  if (!kit || kit.manifest === null || !def) {
    return <p className="muted-note">{`Kit "${block.kitId}" is not available.${kit?.error ? ` ${kit.error}` : ''}`}</p>
  }
  return (
    <>
      {!enabled && <p className="muted-note">{`The ${kit.manifest.name} kit is turned off for this story. Turn it on in the Kits view.`}</p>}
      <KitForm fields={def.fields} params={block.params} onChange={(params) => setKitParams(sceneId, block.id, params)} />
    </>
  )
}
