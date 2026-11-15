import type { CoreBlock } from '@shared/model'
import { NumberField } from '../../../components/NumberField'
import { useBlockPatch, type InspectorProps } from './types'

type Pause = Extract<CoreBlock, { type: 'pause' }>

export function PauseInspector({ sceneId, block }: InspectorProps<Pause>) {
  const patch = useBlockPatch<Pause>(sceneId, block.id)
  const timed = block.seconds !== null
  return (
    <div className="field">
      <span className="field-label">Wait</span>
      <label className="check-row">
        <input type="radio" name={`pause-${block.id}`} checked={!timed} onChange={() => patch({ seconds: null })} />
        Until click
      </label>
      <div className="pause-for">
        <label className="check-row">
          <input type="radio" name={`pause-${block.id}`} checked={timed} onChange={() => patch({ seconds: 1 })} />
          For
        </label>
        <NumberField min={0} step={0.5} aria-label="Seconds to wait" value={block.seconds ?? 1} onChange={(seconds) => patch({ seconds })} />
        <span>seconds</span>
      </div>
    </div>
  )
}
