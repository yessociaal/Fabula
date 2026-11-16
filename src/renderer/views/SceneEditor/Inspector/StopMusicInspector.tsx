import type { CoreBlock } from '@shared/model'
import { NumberField } from '../../../components/NumberField'
import { ChannelSelect } from './ChannelSelect'
import { useBlockPatch, type InspectorProps } from './types'

type StopMusic = Extract<CoreBlock, { type: 'stopMusic' }>

export function StopMusicInspector({ sceneId, block }: InspectorProps<StopMusic>) {
  const patch = useBlockPatch<StopMusic>(sceneId, block.id)
  return (
    <>
      <ChannelSelect value={block.channel} onChange={(channel) => patch({ channel })} />
      <NumberField label="Fade out (seconds)" min={0} step={0.5} value={block.fadeOut} onChange={(fadeOut) => patch({ fadeOut })} />
    </>
  )
}
