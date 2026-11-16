import { Upload } from 'lucide-react'
import type { CoreBlock, Placement, StagePosition, Transition } from '@shared/model'
import { customPlacementFor } from '@shared/placement'
import { ALLOWED_EXTENSIONS } from '@shared/assetTypes'
import { importFiles } from '../../../assetImport'
import { AssetThumb } from '../../../components/AssetThumb'
import { useFileInput } from '../../../components/DropZone'
import { CharacterSelect } from '../../../components/EntitySelects'
import { NumberField } from '../../../components/NumberField'
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
        <span className="field-label">Placement</span>
        <div className="seg" role="radiogroup" aria-label="Placement">
          <button
            type="button"
            role="radio"
            aria-checked={block.placement.mode === 'preset'}
            className={block.placement.mode === 'preset' ? 'active' : ''}
            onClick={() => patch({ placement: { mode: 'preset' } })}
          >
            Preset
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={block.placement.mode === 'custom'}
            className={block.placement.mode === 'custom' ? 'active' : ''}
            onClick={() => patch({ placement: customPlacementFor(block) })}
            title="Place the sprite anywhere. You can also drag it on the stage preview."
          >
            Custom
          </button>
        </div>
      </div>
      {block.placement.mode === 'preset' ? (
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
      ) : (
        <CustomPlacementFields placement={block.placement} onChange={(placement) => patch({ placement })} />
      )}
      <NumberField label="Layer order (higher is in front)" step={1} value={block.zorder} onChange={(zorder) => patch({ zorder: Math.round(zorder) })} />
      <Select<Transition> label="Transition" value={block.transition} options={TRANSITION_OPTIONS} onChange={(transition) => patch({ transition })} />
    </>
  )
}

type Custom = Extract<Placement, { mode: 'custom' }>

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span className="field-label">
        {label}
        <span className="slider-value">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 100) / 100)}
      />
    </div>
  )
}

function CustomPlacementFields({ placement, onChange }: { placement: Custom; onChange: (p: Custom) => void }) {
  const set = (patch: Partial<Custom>): void => onChange({ ...placement, ...patch })
  return (
    <div className="custom-placement">
      <Slider label="X (0 = left edge, 1 = right edge)" value={placement.xalign} onChange={(xalign) => set({ xalign })} />
      <Slider label="Y (0 = top, 1 = bottom)" value={placement.yalign} onChange={(yalign) => set({ yalign })} />
      <div className="pane-row">
        <NumberField label="Zoom" min={0.1} max={10} step={0.1} value={placement.zoom} onChange={(zoom) => set({ zoom })} />
        <NumberField label="Rotation (degrees)" step={5} value={placement.rotate} onChange={(rotate) => set({ rotate })} />
        <NumberField label="Opacity (0 to 1)" min={0} max={1} step={0.1} value={placement.alpha} onChange={(alpha) => set({ alpha })} />
      </div>
    </div>
  )
}
