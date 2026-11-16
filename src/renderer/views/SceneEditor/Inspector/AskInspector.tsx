import type { ExtraBlock } from '@shared/model'
import { CommitField } from '../../../components/CommitField'
import { VariableSelect } from '../../../components/EntitySelects'
import { NumberField } from '../../../components/NumberField'
import { useBlockPatch, type InspectorProps } from './types'

type Ask = Extract<ExtraBlock, { type: 'ask' }>

export function AskInspector({ sceneId, block }: InspectorProps<Ask>) {
  const patch = useBlockPatch<Ask>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Store the answer in</span>
        <VariableSelect
          onlyType="text"
          value={block.variableId}
          onChange={(variableId) => patch({ variableId })}
          placeholder="Choose a text variable…"
          aria-label="Text variable"
        />
      </div>
      <div className="field">
        <span className="field-label">Question</span>
        <CommitField aria-label="Question" placeholder="What is your name?" value={block.prompt} onCommit={(prompt) => patch({ prompt })} />
      </div>
      <div className="field">
        <span className="field-label">Starting text</span>
        <CommitField aria-label="Starting text" placeholder="Shown in the box before the player types" value={block.defaultText} onCommit={(defaultText) => patch({ defaultText })} />
      </div>
      <NumberField label="Longest answer (characters)" min={1} step={1} value={block.maxLength} onChange={(maxLength) => patch({ maxLength: Math.round(maxLength) })} />
    </>
  )
}
