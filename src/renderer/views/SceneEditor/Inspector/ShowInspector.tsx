import { Upload } from 'lucide-react'
import type { CoreBlock, StagePosition, Transition } from '@shared/model'
import { ALLOWED_EXTENSIONS } from '@shared/assetTypes'
import { importFiles } from '../../../assetImport'
import { AssetThumb } from '../../../components/AssetThumb'
import { useFileInput } from '../../../components/DropZone'
import { CharacterSelect } from '../../../components/EntitySelects'
import { Select } from '../../../components/Select'
import { batch } from '../../../store/batch'
import { useProjectStore } from '../../../store/projectStore'
import { TRANSITION_OPTIONS } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type Show = Extract<CoreBlock, { type: 'show' }>

const POSITIONS: { value: StagePosition; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' }
]

export function ShowInspector({ sceneId, block }: InspectorProps<Show>) {
  const patch = useBlockPatch<Show>(sceneId, block.id)
  const project = useProjectStore((s) => s.project)
  const character = block.characterId === null ? undefined : project?.characters[block.characterId]

  const upload = async (files: File[]): Promise<void> => {
    if (!character) return
    const assets = await importFiles(files, 'sprite')
    if (assets.length === 0) return
    batch(() => {
      const ids = assets.map((a) => useProjectStore.getState().addExpression(character.id, a.name, a.id))
      if (ids[0]) patch({ expressionId: ids[0] })
    })
  }
  const { input, open } = useFileInput(ALLOWED_EXTENSIONS.sprite.join(','), (f) => void upload(f))

  return (
    <>
      <div className="field">
        <span className="field-label">Character</span>
        <CharacterSelect
          value={block.characterId}
          onChange={(characterId) => patch({ characterId, expressionId: null })}
          aria-label="Character"
        />
      </div>
      <div className="field">
        <span className="field-label">Expression</span>
        {character ? (
          <div className="picker picker-grid" role="listbox" aria-label="Choose expression">
            {character.expressions.map((x) => (
              <button
                key={x.id}
                type="button"
                role="option"
                aria-selected={block.expressionId === x.id}
                title={x.name}
                className={`picker-tile ${block.expressionId === x.id ? 'selected' : ''}`}
                onClick={() => patch({ expressionId: x.id })}
              >
                <AssetThumb asset={x.assetId ? project?.assets[x.assetId] : null} missingLabel={x.name} checker />
                <span className="picker-name">{x.name}</span>
              </button>
            ))}
            <button type="button" className="picker-tile picker-upload" onClick={open} title="Upload a new sprite for this character">
              <Upload size={18} />
              <span>Upload new…</span>
            </button>
            {input}
          </div>
        ) : (
          <p className="muted-note">Pick a character to see its expressions.</p>
        )}
      </div>
      <div className="field">
        <span className="field-label">Position</span>
        <div className="seg" role="radiogroup" aria-label="Position">
          {POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={block.position === p.value}
              className={block.position === p.value ? 'active' : ''}
              onClick={() => patch({ position: p.value })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <Select<Transition> label="Transition" value={block.transition} options={TRANSITION_OPTIONS} onChange={(transition) => patch({ transition })} />
    </>
  )
}
