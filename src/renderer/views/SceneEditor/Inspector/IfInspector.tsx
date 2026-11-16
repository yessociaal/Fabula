import type { ExtraBlock } from '@shared/model'
import { ConditionBuilder } from '../../../components/ConditionBuilder'
import { useBlockPatch, type InspectorProps } from './types'

type If = Extract<ExtraBlock, { type: 'if' }>

export function IfInspector({ sceneId, block }: InspectorProps<If>) {
  const patch = useBlockPatch<If>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Run the Then blocks when</span>
        <ConditionBuilder value={block.condition} onChange={(condition) => patch({ condition })} />
      </div>
      <p className="muted-note">The Then and Otherwise blocks are on the block row. Drag blocks into them.</p>
    </>
  )
}
