import type { CoreBlock, Transition } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { Select } from '../../../components/Select'
import { TRANSITION_OPTIONS } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type Background = Extract<CoreBlock, { type: 'background' }>

export function BackgroundInspector({ sceneId, block }: InspectorProps<Background>) {
  const patch = useBlockPatch<Background>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Picture</span>
        <AssetPicker kind="background" value={block.assetId} onChange={(assetId) => patch({ assetId })} noneLabel="None (black)" />
      </div>
      <Select<Transition> label="Transition" value={block.transition} options={TRANSITION_OPTIONS} onChange={(transition) => patch({ transition })} />
    </>
  )
}
