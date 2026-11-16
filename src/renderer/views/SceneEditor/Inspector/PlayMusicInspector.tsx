import type { CoreBlock } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { NumberField } from '../../../components/NumberField'
import { ChannelSelect } from './ChannelSelect'
import { useBlockPatch, type InspectorProps } from './types'

type PlayMusic = Extract<CoreBlock, { type: 'playMusic' }>

export function PlayMusicInspector({ sceneId, block }: InspectorProps<PlayMusic>) {
  const patch = useBlockPatch<PlayMusic>(sceneId, block.id)
  return (
    <>
      <ChannelSelect value={block.channel} onChange={(channel) => patch({ channel, assetId: null })} />
      <div className="field">
        <span className="field-label">{block.channel === 'ambient' ? 'Ambient sound' : 'Track'}</span>
        <AssetPicker
          key={block.channel}
          kind={block.channel === 'ambient' ? 'ambient' : 'music'}
          value={block.assetId}
          onChange={(assetId) => patch({ assetId })}
        />
      </div>
      <NumberField label="Fade in (seconds)" min={0} step={0.5} value={block.fadeIn} onChange={(fadeIn) => patch({ fadeIn })} />
      <label className="check-row">
        <input type="checkbox" checked={block.loop} onChange={(e) => patch({ loop: e.target.checked })} />
        Loop
      </label>
    </>
  )
}
