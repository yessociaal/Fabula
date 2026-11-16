import { Plus, Trash2 } from 'lucide-react'
import { createInlineOption } from '@shared/factory'
import type { ExtraBlock, InlineChoiceOption } from '@shared/model'
import { Button } from '../../../components/Button'
import { CommitField } from '../../../components/CommitField'
import { ConditionChip } from '../../../components/ConditionChip'
import { CharacterSelect } from '../../../components/EntitySelects'
import { IconButton } from '../../../components/IconButton'
import { useBlockPatch, type InspectorProps } from './types'

type InlineChoice = Extract<ExtraBlock, { type: 'inlineChoice' }>

export function InlineChoiceInspector({ sceneId, block }: InspectorProps<InlineChoice>) {
  const patch = useBlockPatch<InlineChoice>(sceneId, block.id)
  const change = (id: string, next: Partial<InlineChoiceOption>): void =>
    patch({ options: block.options.map((o) => (o.id === id ? { ...o, ...next } : o)) })
  return (
    <>
      <div className="field">
        <label className="check-row" title="Show the options without a line of dialogue before them">
          <input
            type="checkbox"
            checked={block.prompt === null}
            onChange={(e) => patch({ prompt: e.target.checked ? null : { characterId: null, text: '' } })}
          />
          No prompt
        </label>
      </div>
      {block.prompt && (
        <>
          <div className="field">
            <span className="field-label">Speaker</span>
            <CharacterSelect
              allowNarrator
              value={block.prompt.characterId}
              aria-label="Prompt speaker"
              onChange={(characterId) => patch({ prompt: { ...block.prompt!, characterId } })}
            />
          </div>
          <div className="field">
            <span className="field-label">Prompt</span>
            <CommitField
              aria-label="Prompt text"
              placeholder="What is asked, e.g. What now?"
              value={block.prompt.text}
              onCommit={(text) => patch({ prompt: { ...block.prompt!, text } })}
            />
          </div>
        </>
      )}
      <div className="field">
        <span className="field-label">Options</span>
        {block.options.map((o, i) => (
          <div className="inline-option-row" key={o.id}>
            <span className="option-number">{i + 1}</span>
            <CommitField
              className="option-text"
              aria-label={`Text of option ${i + 1}`}
              placeholder="What the player picks"
              value={o.text}
              onCommit={(text) => change(o.id, { text })}
            />
            <ConditionChip
              value={o.condition}
              onChange={(condition) => change(o.id, { condition })}
              title="Show this option only when…"
              emptyTitle="Show this option only when a condition is true"
            />
            <IconButton label="Remove this option (and the blocks inside it)" onClick={() => patch({ options: block.options.filter((x) => x.id !== o.id) })}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <div>
          <Button icon={<Plus size={14} />} onClick={() => patch({ options: [...block.options, createInlineOption()] })}>
            Add option
          </Button>
        </div>
      </div>
      <p className="muted-note">The blocks of each option are on the block row. To change a variable when an option is picked, add a Variable block inside it.</p>
    </>
  )
}
