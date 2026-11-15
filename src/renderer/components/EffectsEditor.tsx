import { Plus, Trash2 } from 'lucide-react'
import './editorWidgets.css'
import type { Effect, Id, Scalar } from '@shared/model'
import { createEffect } from '@shared/factory'
import { useProjectStore } from '../store/projectStore'
import { Button } from './Button'
import { CommitField } from './CommitField'
import { IconButton } from './IconButton'
import { NumberField } from './NumberField'
import { Select } from './Select'
import { VariableSelect } from './EntitySelects'
import { EFFECT_OP_LABELS, effectOpsFor, retargetEffect } from './variableOps'

interface ValueInputProps {
  type: 'boolean' | 'number' | 'text'
  value: Scalar
  onChange: (value: Scalar) => void
  label: string
}

/** The value box that matches a variable's type: True/False, a number or text. */
export function ValueInput({ type, value, onChange, label }: ValueInputProps) {
  if (type === 'boolean') {
    return (
      <Select
        value={value === true ? 'true' : 'false'}
        options={[
          { value: 'true', label: 'True' },
          { value: 'false', label: 'False' }
        ]}
        onChange={(v) => onChange(v === 'true')}
      />
    )
  }
  if (type === 'number') {
    return <NumberField value={typeof value === 'number' ? value : 0} onChange={onChange} aria-label={label} />
  }
  return <CommitField value={typeof value === 'string' ? value : ''} aria-label={label} onCommit={onChange} />
}

interface EffectRowProps {
  effect: Effect
  onChange: (effect: Effect) => void
  onDelete?: () => void
}

/** One variable change: [variable] [Set to / Add / Subtract / Flip] [value]. Used by the Variable block and choice effects. */
export function EffectRow({ effect, onChange, onDelete }: EffectRowProps) {
  const variables = useProjectStore((s) => s.project?.variables)
  const variable = effect.variableId === null ? undefined : variables?.[effect.variableId]
  const ops = effectOpsFor(variable?.type ?? null)

  // Read the store now: a variable created a moment ago by "+ New variable…" is not in this render's snapshot yet.
  const pickVariable = (id: Id): void => onChange(retargetEffect(effect, useProjectStore.getState().project?.variables[id]))

  return (
    <div className="effect-row">
      <VariableSelect value={effect.variableId} onChange={pickVariable} aria-label="Variable to change" />
      <Select
        value={effect.op}
        options={ops.map((op) => ({ value: op, label: EFFECT_OP_LABELS[op] }))}
        onChange={(op) => onChange({ ...effect, op })}
      />
      {variable && effect.op !== 'toggle' && (
        <ValueInput
          type={variable.type}
          value={effect.value}
          label="Value"
          onChange={(value) => onChange({ ...effect, value })}
        />
      )}
      {onDelete && (
        <IconButton label="Remove this change" onClick={onDelete}>
          <Trash2 size={15} />
        </IconButton>
      )}
    </div>
  )
}

interface EffectsEditorProps {
  effects: Effect[]
  onChange: (effects: Effect[]) => void
}

/** A list of variable changes, e.g. what happens when the player picks a choice. */
export function EffectsEditor({ effects, onChange }: EffectsEditorProps) {
  return (
    <div className="effects-editor">
      {effects.length === 0 && <p className="muted-note">No changes yet. Picking this choice leaves every variable as it is.</p>}
      {effects.map((e, i) => (
        <EffectRow
          key={i}
          effect={e}
          onChange={(next) => onChange(effects.map((x, j) => (j === i ? next : x)))}
          onDelete={() => onChange(effects.filter((_, j) => j !== i))}
        />
      ))}
      <Button icon={<Plus size={14} />} onClick={() => onChange([...effects, createEffect()])}>
        Add change
      </Button>
    </div>
  )
}
