import type { CoreBlock } from '@shared/model'
import { EffectRow } from '../../../components/EffectsEditor'
import { useBlockPatch, type InspectorProps } from './types'

type SetVariable = Extract<CoreBlock, { type: 'setVariable' }>

export function VariableInspector({ sceneId, block }: InspectorProps<SetVariable>) {
  const patch = useBlockPatch<SetVariable>(sceneId, block.id)
  return (
    <div className="field">
      <span className="field-label">Change</span>
      <EffectRow effect={block.effect} onChange={(effect) => patch({ effect })} />
    </div>
  )
}
