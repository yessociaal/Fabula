import type { CoreBlock } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { useBlockPatch, type InspectorProps } from './types'

type PlaySound = Extract<CoreBlock, { type: 'playSound' }>

export function PlaySoundInspector({ sceneId, block }: InspectorProps<PlaySound>) {
  const patch = useBlockPatch<PlaySound>(sceneId, block.id)
  return (
    <div className="field">
      <span className="field-label">Sound</span>
      <AssetPicker kind="sound" value={block.assetId} onChange={(assetId) => patch({ assetId })} />
    </div>
  )
}
