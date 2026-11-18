import { useMemo, useState } from 'react'
import type { Id, Variable } from '@shared/model'
import { sceneOrder } from '@shared/naming'
import { useProjectStore } from '../store/projectStore'
import { batch } from '../store/batch'
import { Button } from './Button'
import { Dropdown, type DropdownItem } from './Dropdown'
import { Modal } from './Modal'
import { Select } from './Select'
import { TextField } from './TextField'
import { freeSpotNear, uniqueName } from './entityHelpers'

const NEW_COLORS = ['#e86a92', '#4a90d9', '#5fd08a', '#f2b84b', '#b07cff', '#ff8a5c']

// ---------- Scenes ----------

interface SceneSelectProps {
  value: Id | null
  onChange: (sceneId: Id | null) => void
  /** New scenes are placed on the map near this scene. */
  nearSceneId: Id
  placeholder?: string
  'aria-label': string
}

/** Pick a scene; the last entry creates a new one near `nearSceneId` and selects it. */
export function SceneSelect({ value, onChange, nearSceneId, placeholder = 'Choose a scene…', ...rest }: SceneSelectProps) {
  const project = useProjectStore((s) => s.project)
  const items = useMemo<DropdownItem<string>[]>(() => {
    if (!project) return []
    const scenes = sceneOrder(project).map<DropdownItem<string>>((s) => ({
      kind: 'item',
      value: s.id,
      label: s.name || 'Untitled scene'
    }))
    return [
      ...scenes,
      { kind: 'separator' },
      {
        kind: 'action',
        label: '+ New scene…',
        onSelect: () => {
          const state = useProjectStore.getState()
          const p = state.project
          if (!p) return
          const from = p.scenes[nearSceneId]?.position ?? { x: 0, y: 0 }
          const name = uniqueName('New scene', Object.values(p.scenes).map((s) => s.name))
          batch(() => {
            const id = state.addScene(freeSpotNear(p, from), name)
            onChange(id)
          })
        }
      }
    ]
  }, [project, nearSceneId, onChange])
  return <Dropdown value={value} items={items} onChange={onChange} placeholder={placeholder} aria-label={rest['aria-label']} />
}

// ---------- Screens ----------

interface ScreenSelectProps {
  value: Id | null
  onChange: (screenId: Id | null) => void
  placeholder?: string
  /** Screens listed (for example, leave out the screen that is being edited). */
  exclude?: Id
  'aria-label': string
}

/** Pick a designed screen; the last entry creates a new, empty one and selects it (open it in the Screen Designer to fill it). */
export function ScreenSelect({ value, onChange, placeholder = 'Choose a screen…', exclude, ...rest }: ScreenSelectProps) {
  const project = useProjectStore((s) => s.project)
  const [creating, setCreating] = useState(false)
  const items = useMemo<DropdownItem<string>[]>(() => {
    if (!project) return []
    const list: DropdownItem<string>[] = project.screenOrder
      .filter((id) => project.screens[id] && id !== exclude)
      .map((id) => ({ kind: 'item', value: id, label: project.screens[id].name || 'Untitled screen' }))
    list.push({ kind: 'separator' }, { kind: 'action', label: '+ New screen…', onSelect: () => setCreating(true) })
    return list
  }, [project, exclude])
  return (
    <>
      <Dropdown value={value} items={items} onChange={onChange} placeholder={placeholder} aria-label={rest['aria-label']} />
      {creating && (
        <NewItemModal
          title="New screen"
          initialName={uniqueName('New screen', Object.values(project?.screens ?? {}).map((s) => s.name))}
          confirmLabel="Create screen"
          onCancel={() => setCreating(false)}
          onCreate={(name) => {
            setCreating(false)
            batch(() => onChange(useProjectStore.getState().addScreen(name)))
          }}
        />
      )}
    </>
  )
}

// ---------- Characters ----------

interface CharacterSelectProps {
  value: Id | null
  onChange: (characterId: Id | null) => void
  /** Adds a "Narrator" entry that means "no character" (value null). */
  allowNarrator?: boolean
  /** Characters listed first under a header (e.g. those on stage), then the rest. */
  firstGroup?: { label: string; ids: Id[]; restLabel: string }
  placeholder?: string
  'aria-label': string
}

export function CharacterSelect({ value, onChange, allowNarrator, firstGroup, placeholder = 'Choose a character…', ...rest }: CharacterSelectProps) {
  const project = useProjectStore((s) => s.project)
  const [creating, setCreating] = useState(false)

  const items = useMemo<DropdownItem<string>[]>(() => {
    if (!project) return []
    const all = project.characterOrder.filter((id) => project.characters[id])
    const entry = (id: Id): DropdownItem<string> => ({
      kind: 'item',
      value: id,
      label: project.characters[id].name || 'Unnamed character',
      color: project.characters[id].color
    })
    const list: DropdownItem<string>[] = []
    if (allowNarrator) list.push({ kind: 'item', value: '', label: 'Narrator' })
    if (firstGroup && firstGroup.ids.length > 0) {
      list.push({ kind: 'header', label: firstGroup.label })
      list.push(...firstGroup.ids.filter((id) => project.characters[id]).map(entry))
      const rest = all.filter((id) => !firstGroup.ids.includes(id))
      if (rest.length > 0) {
        list.push({ kind: 'header', label: firstGroup.restLabel })
        list.push(...rest.map(entry))
      }
    } else {
      list.push(...all.map(entry))
    }
    list.push({ kind: 'separator' }, { kind: 'action', label: '+ New character…', onSelect: () => setCreating(true) })
    return list
  }, [project, allowNarrator, firstGroup])

  return (
    <>
      <Dropdown
        value={value === null ? (allowNarrator ? '' : null) : value}
        items={items}
        onChange={(v) => onChange(v === '' ? null : v)}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
      />
      {creating && (
        <NewItemModal
          title="New character"
          initialName={uniqueName('New character', Object.values(project?.characters ?? {}).map((c) => c.name))}
          confirmLabel="Create character"
          onCancel={() => setCreating(false)}
          onCreate={(name) => {
            setCreating(false)
            const count = project?.characterOrder.length ?? 0
            batch(() => {
              const id = useProjectStore.getState().addCharacter({ name, color: NEW_COLORS[count % NEW_COLORS.length] })
              onChange(id)
            })
          }}
        />
      )}
    </>
  )
}

// ---------- Variables ----------

interface VariableSelectProps {
  value: Id | null
  onChange: (variableId: Id) => void
  placeholder?: string
  /** List (and create) only variables of this type. */
  onlyType?: Variable['type']
  'aria-label': string
}

const TYPE_OPTIONS: { value: Variable['type']; label: string }[] = [
  { value: 'boolean', label: 'True / False' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' }
]

export function VariableSelect({ value, onChange, placeholder = 'Choose a variable…', onlyType, ...rest }: VariableSelectProps) {
  const project = useProjectStore((s) => s.project)
  const [creating, setCreating] = useState(false)

  const items = useMemo<DropdownItem<string>[]>(() => {
    if (!project) return []
    const list: DropdownItem<string>[] = project.variableOrder
      .filter((id) => project.variables[id] && (!onlyType || project.variables[id].type === onlyType))
      .map((id) => ({ kind: 'item', value: id, label: project.variables[id].name || 'Unnamed variable' }))
    list.push({ kind: 'separator' }, { kind: 'action', label: '+ New variable…', onSelect: () => setCreating(true) })
    return list
  }, [project, onlyType])

  return (
    <>
      <Dropdown value={value} items={items} onChange={onChange} placeholder={placeholder} aria-label={rest['aria-label']} />
      {creating && <NewVariableModal onlyType={onlyType} onCancel={() => setCreating(false)} onCreated={(id) => { setCreating(false); onChange(id) }} />}
    </>
  )
}

/** Asks for a name and a type, creates the variable and reports its id. */
export function NewVariableModal({
  onCancel,
  onCreated,
  onlyType
}: {
  onCancel: () => void
  onCreated: (variableId: Id) => void
  onlyType?: Variable['type']
}) {
  const variables = useProjectStore((s) => s.project?.variables)
  return (
    <NewItemModal
      title="New variable"
      initialName={uniqueName('New variable', Object.values(variables ?? {}).map((v) => v.name))}
      confirmLabel="Create variable"
      typeOptions={onlyType ? TYPE_OPTIONS.filter((t) => t.value === onlyType) : TYPE_OPTIONS}
      onCancel={onCancel}
      onCreate={(name, type) => onCreated(useProjectStore.getState().addVariable({ name, type: (type as Variable['type']) ?? 'number' }))}
    />
  )
}

// ---------- the small "name it" dialog ----------

interface NewItemModalProps {
  title: string
  initialName: string
  confirmLabel: string
  typeOptions?: { value: string; label: string }[]
  onCancel: () => void
  onCreate: (name: string, type?: string) => void
}

function NewItemModal({ title, initialName, confirmLabel, typeOptions, onCancel, onCreate }: NewItemModalProps) {
  const [name, setName] = useState(initialName)
  const [type, setType] = useState(typeOptions?.[0]?.value ?? '')
  const ok = name.trim() !== ''
  const submit = (): void => {
    if (ok) onCreate(name.trim(), typeOptions ? type : undefined)
  }
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={submit}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div onKeyDown={(e) => e.key === 'Enter' && submit()}>
        <TextField label="Name" value={name} onChange={setName} autoFocus aria-label={`${title} name`} />
        {typeOptions && (
          <div className="new-item-type">
            <Select label="Type" value={type} options={typeOptions} onChange={setType} />
          </div>
        )}
      </div>
    </Modal>
  )
}
