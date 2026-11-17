import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { newId } from '@shared/factory'
import { asCondition, asEffects, fieldValue, interpolate, listItems, newListItem } from '@shared/kits/fields'
import { selectOptions, type KitField } from '@shared/kits/types'
import type { Condition } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { Button } from '../../../components/Button'
import { CharacterSelect, VariableSelect } from '../../../components/EntitySelects'
import { ColorField } from '../../../components/ColorField'
import { CommitField } from '../../../components/CommitField'
import { ConditionBuilder } from '../../../components/ConditionBuilder'
import { DraftArea } from '../../../components/DraftArea'
import { EffectsEditor } from '../../../components/EffectsEditor'
import { IconButton } from '../../../components/IconButton'
import { NumberField } from '../../../components/NumberField'
import { Select } from '../../../components/Select'

type Params = Record<string, unknown>

interface FieldProps<F extends KitField = KitField> {
  field: F
  value: unknown
  onChange: (value: unknown) => void
}

function TextField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'text' }>>) {
  return <CommitField value={typeof value === 'string' ? value : ''} placeholder={field.placeholder} aria-label={field.label} onCommit={onChange} />
}

function MultilineField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'multiline' }>>) {
  return (
    <DraftArea
      rows={3}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.placeholder}
      aria-label={field.label}
      onCommit={onChange}
    />
  )
}

function NumberKitField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'number' }>>) {
  return (
    <NumberField value={typeof value === 'number' ? value : 0} min={field.min} max={field.max} step={field.step} aria-label={field.label} onChange={onChange} />
  )
}

function BooleanField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'boolean' }>>) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      <span>{field.label}</span>
    </label>
  )
}

function SelectField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'select' }>>) {
  return <Select value={typeof value === 'string' ? value : ''} options={selectOptions(field)} onChange={onChange} />
}

function ColorKitField({ value, onChange }: FieldProps<Extract<KitField, { type: 'color' }>>) {
  return <ColorField value={typeof value === 'string' && value !== '' ? value : '#ffffff'} onChange={onChange} />
}

function VariableField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'variable' }>>) {
  return <VariableSelect value={typeof value === 'string' ? value : null} onlyType={field.varType} aria-label={field.label} onChange={onChange} />
}

function CharacterField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'character' }>>) {
  return (
    <CharacterSelect value={typeof value === 'string' ? value : null} aria-label={field.label} onChange={(id) => onChange(id)} />
  )
}

function AssetField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'asset' }>>) {
  return <AssetPicker kind={field.kind} value={typeof value === 'string' ? value : null} onChange={onChange} />
}

function EffectsField({ value, onChange }: FieldProps<Extract<KitField, { type: 'effects' }>>) {
  return <EffectsEditor effects={asEffects(value)} onChange={onChange} />
}

function ConditionField({ value, onChange }: FieldProps<Extract<KitField, { type: 'condition' }>>) {
  const condition: Condition | null = asCondition(value)
  const has = condition !== null && condition.clauses.length > 0
  return (
    <div className="kit-condition">
      <ConditionBuilder value={condition} onChange={onChange} />
      {has && (
        <Button variant="ghost" onClick={() => onChange(null)} title="Remove the condition">
          No condition
        </Button>
      )}
    </div>
  )
}

function ListField({ field, value, onChange }: FieldProps<Extract<KitField, { type: 'list' }>>) {
  const items = listItems(value)
  const set = (next: Params[]): void => onChange(next)
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    set(next)
  }
  return (
    <div className="kit-list">
      {items.length === 0 && <p className="muted-note">Nothing here yet.</p>}
      {items.map((item, i) => {
        const label = field.itemLabel ? interpolate(field.itemLabel, field.fields, item).trim() : ''
        return (
          <div key={typeof item.id === 'string' ? item.id : i} className="kit-list-item" data-testid="kit-list-item">
            <div className="kit-list-head">
              <strong className="kit-list-title">{label === '' ? `${field.label} ${i + 1}` : label}</strong>
              <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton label="Move down" disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label={`Remove ${label === '' ? `${field.label} ${i + 1}` : label}`} onClick={() => set(items.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
            <KitForm fields={field.fields} params={item} onChange={(next) => set(items.map((x, j) => (j === i ? { ...next, id: item.id } : x)))} />
          </div>
        )
      })}
      <Button icon={<Plus size={14} />} onClick={() => set([...items, newListItem(field, newId())])}>
        Add {field.label.toLowerCase().replace(/s$/, '')}
      </Button>
    </div>
  )
}

function FieldInput(props: FieldProps) {
  const { field } = props
  switch (field.type) {
    case 'text':
      return <TextField {...props} field={field} />
    case 'multiline':
      return <MultilineField {...props} field={field} />
    case 'number':
      return <NumberKitField {...props} field={field} />
    case 'boolean':
      return <BooleanField {...props} field={field} />
    case 'select':
      return <SelectField {...props} field={field} />
    case 'color':
      return <ColorKitField {...props} field={field} />
    case 'variable':
      return <VariableField {...props} field={field} />
    case 'character':
      return <CharacterField {...props} field={field} />
    case 'asset':
      return <AssetField {...props} field={field} />
    case 'effects':
      return <EffectsField {...props} field={field} />
    case 'condition':
      return <ConditionField {...props} field={field} />
    case 'list':
      return <ListField {...props} field={field} />
  }
}

interface KitFormProps {
  fields: readonly KitField[]
  params: Params
  onChange: (params: Params) => void
}

/** The form of a kit block or ending, generated from the `fields` of its manifest. Values live in `params`, keyed by field key. */
export function KitForm({ fields, params, onChange }: KitFormProps) {
  return (
    <div className="kit-form">
      {fields.map((field) => (
        <div key={field.key} className="field kit-field" data-field={field.key}>
          {field.type !== 'boolean' && <span className="field-label">{field.label}</span>}
          <FieldInput field={field} value={fieldValue(field, params)} onChange={(value) => onChange({ ...params, [field.key]: value })} />
          {field.help && <p className="muted-note">{field.help}</p>}
        </div>
      ))}
    </div>
  )
}

