import { useState } from 'react'
import { slugify } from '@shared/naming'
import type { Id, ScreenAction, ScreenDef, ScreenElement, ScreenElementPatch } from '@shared/model'
import { AssetPicker } from '../../components/AssetPicker'
import { Button } from '../../components/Button'
import { ColorField } from '../../components/ColorField'
import { CommitField } from '../../components/CommitField'
import { EffectRow } from '../../components/EffectsEditor'
import { ScreenSelect, VariableSelect } from '../../components/EntitySelects'
import { NumberField } from '../../components/NumberField'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import { Copy, Trash2 } from 'lucide-react'

const ACTIONS: { type: ScreenAction['type']; label: string }[] = [
  { type: 'leave', label: 'Leave screen' },
  { type: 'setVariable', label: 'Change variable' },
  { type: 'showScreen', label: 'Show screen…' },
  { type: 'hideThis', label: 'Close this screen' }
]

function ImagePick({ value, onChange, noneLabel }: { value: Id | null; onChange: (id: Id | null) => void; noneLabel: string }) {
  const assets = useProjectStore((s) => s.project?.assets)
  const isBackground = value !== null && assets?.[value]?.kind === 'background'
  return (
    <ImageKindPick value={value} onChange={onChange} noneLabel={noneLabel} initialKind={isBackground ? 'background' : 'ui'} />
  )
}


function ImageKindPick({ value, onChange, noneLabel, initialKind }: { value: Id | null; onChange: (id: Id | null) => void; noneLabel: string; initialKind: 'ui' | 'background' }) {
  const [kind, setKind] = useState<'ui' | 'background'>(initialKind)
  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Kind of image">
        {(['ui', 'background'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>
            {k === 'ui' ? 'Interface images' : 'Backgrounds'}
          </button>
        ))}
      </div>
      <AssetPicker kind={kind} value={value} onChange={onChange} noneLabel={noneLabel} />
    </>
  )
}

function ActionFields({ screen, element }: { screen: ScreenDef; element: ScreenElement & { action: ScreenAction } }) {
  const setElementAction = useProjectStore((s) => s.setElementAction)
  const action = element.action
  return (
    <div className="field">
      <span className="field-label">When clicked</span>
      <div className="sd-radios" role="radiogroup" aria-label="When clicked">
        {ACTIONS.map((a) => (
          <label key={a.type} className="sd-radio">
            <input
              type="radio"
              name={`action-${element.id}`}
              checked={action.type === a.type}
              onChange={() => setElementAction(screen.id, element.id, a.type)}
            />
            {a.label}
          </label>
        ))}
      </div>
      {action.type === 'leave' && <p className="muted-note">When the screen is the ending of a scene, this becomes an exit with its own arrow on the map.</p>}
      {action.type === 'setVariable' && (
        <EffectRow effect={action.effect} onChange={(effect) => setElementAction(screen.id, element.id, { type: 'setVariable', effect })} />
      )}
      {action.type === 'showScreen' && (
        <ScreenSelect
          value={action.screenId}
          exclude={screen.id}
          aria-label="Screen to show"
          onChange={(screenId) => setElementAction(screen.id, element.id, { type: 'showScreen', screenId })}
        />
      )}
      {action.type === 'hideThis' && <p className="muted-note">Closes this screen when it was shown with a Show screen block.</p>}
    </div>
  )
}

/** The Properties panel: name, position, size, the fields of the element's type, and "When clicked". */
export function ElementProperties({ screen, element }: { screen: ScreenDef; element: ScreenElement }) {
  const updateElement = useProjectStore((s) => s.updateElement)
  const patch = (p: ScreenElementPatch): void => updateElement(screen.id, element.id, p)
  const assets = useProjectStore((s) => s.project?.assets)
  const clash = screen.elements.some((e) => e.id !== element.id && slugify(e.name, 'element') === slugify(element.name, 'element'))
  const needsName = element.name.trim() === ''

  return (
    <div className="sd-fields" key={element.id}>
      <div className="field">
        <span className="field-label">Name</span>
        <CommitField value={element.name} aria-label="Name" onCommit={(name) => patch({ name })} />
        {(clash || needsName) && (
          <p className="field-error" role="alert">
            {needsName ? 'Give the element a name.' : 'Another element already has this name. Names must differ.'}
          </p>
        )}
      </div>
      <div className="sd-grid2">
        <NumberField label="X" value={element.x} aria-label="X" onChange={(x) => patch({ x: Math.round(x) })} />
        <NumberField label="Y" value={element.y} aria-label="Y" onChange={(y) => patch({ y: Math.round(y) })} />
        <NumberField label="W" value={element.w} min={1} aria-label="W" onChange={(w) => patch({ w: Math.round(w) })} />
        <NumberField label="H" value={element.h} min={1} aria-label="H" onChange={(h) => patch({ h: Math.round(h) })} />
      </div>

      {element.type === 'image' && (
        <div className="field">
          <span className="field-label">Picture</span>
          <ImagePick value={element.assetId} noneLabel="None" onChange={(assetId) => patch({ assetId })} />
        </div>
      )}
      {element.type === 'text' && (
        <>
          <div className="field">
            <span className="field-label">Text</span>
            <CommitField value={element.text} aria-label="Text" onCommit={(text) => patch({ text })} />
          </div>
          <div className="sd-grid2">
            <NumberField label="Size" value={element.size} min={1} aria-label="Size" onChange={(size) => patch({ size: Math.round(size) })} />
            <ColorField label="Colour" value={element.color} onChange={(color) => patch({ color })} />
          </div>
          <div className="field">
            <span className="field-label">Font</span>
            <AssetPicker kind="font" value={element.fontAssetId} noneLabel="Default font" onChange={(fontAssetId) => patch({ fontAssetId })} />
          </div>
        </>
      )}
      {element.type === 'button' && (
        <div className="field">
          <span className="field-label">Text</span>
          <CommitField value={element.text} aria-label="Button text" onCommit={(text) => patch({ text })} />
        </div>
      )}
      {element.type === 'imageButton' && (
        <>
          <div className="field">
            <span className="field-label">Idle picture</span>
            <ImagePick
              value={element.idleAssetId}
              noneLabel="None"
              onChange={(idleAssetId) => {
                const a = idleAssetId ? assets?.[idleAssetId] : undefined
                patch(a && a.width && a.height ? { idleAssetId, w: a.width, h: a.height } : { idleAssetId })
              }}
            />
          </div>
          <div className="field">
            <span className="field-label">Hover picture</span>
            <ImagePick value={element.hoverAssetId} noneLabel="Same as idle" onChange={(hoverAssetId) => patch({ hoverAssetId })} />
          </div>
          <p className="muted-note">In the game an image button is drawn at the picture's own size.</p>
        </>
      )}
      {element.type === 'bar' && (
        <>
          <div className="field">
            <span className="field-label">Variable</span>
            <VariableSelect value={element.variableId} onlyType="number" aria-label="Variable shown by the bar" onChange={(variableId) => patch({ variableId })} />
          </div>
          <NumberField label="Maximum" value={element.max} min={1} aria-label="Maximum" onChange={(max) => patch({ max })} />
        </>
      )}
      {'action' in element && <ActionFields screen={screen} element={element as ScreenElement & { action: ScreenAction }} />}
      <div className="inspector-actions">
        <Button
          icon={<Copy size={15} />}
          title="Duplicate this element (Ctrl+D)"
          onClick={() => {
            const id = useProjectStore.getState().duplicateElement(screen.id, element.id)
            if (id) useUiStore.getState().selectElement(id)
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          icon={<Trash2 size={15} />}
          title="Delete this element (Delete)"
          onClick={() => {
            useProjectStore.getState().deleteElement(screen.id, element.id)
            useUiStore.getState().selectElement(null)
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  )
}
