import type { CoreBlock, Transition } from '@shared/model'
import { Select } from '../../../components/Select'
import { TRANSITION_OPTIONS } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type TransitionBlock = Extract<CoreBlock, { type: 'transition' }>

export function TransitionInspector({ sceneId, block }: InspectorProps<TransitionBlock>) {
  const patch = useBlockPatch<TransitionBlock>(sceneId, block.id)
  return (
    <Select<Transition> label="Transition" value={block.transition} options={TRANSITION_OPTIONS} onChange={(transition) => patch({ transition })} />
  )
}
