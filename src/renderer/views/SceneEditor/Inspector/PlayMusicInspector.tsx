import type { CoreBlock } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { NumberField } from '../../../components/NumberField'
import { useBlockPatch, type InspectorProps } from './types'

type PlayMusic = Extract<CoreBlock, { type: 'playMusic' }>

export function PlayMusicInspector({ sceneId, block }: InspectorProps<PlayMusic>) {
  const patch = useBlockPatch<PlayMusic>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Track</span>
        <AssetPicker kind="music" value={block.assetId} onChange={(assetId) => patch({ assetId })} />
      </div>
      <NumberField label="Fade in (seconds)" min={0} step={0.5} value={block.fadeIn} onChange={(fadeIn) => patch({ fadeIn })} />
      <label className="check-row">
        <input type="checkbox" checked={block.loop} onChange={(e) => patch({ loop: e.target.checked })} />
        Loop
      </label>
    </>
  )
}
