import { useRef, useState } from 'react'
import { Bold, Italic } from 'lucide-react'
import type { CoreBlock } from '@shared/model'
import { buildNameTable } from '@shared/naming'
import { DraftArea, type DraftAreaHandle } from '../../../components/DraftArea'
import { Dropdown, type DropdownItem } from '../../../components/Dropdown'
import { CharacterSelect, NewVariableModal } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import { insertAtSelection, wrapSelection, type TextEdit } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type Say = Extract<CoreBlock, { type: 'say' }>

/** Dialogue and Narration (a Dialogue with no speaker). */
export function DialogueInspector({ sceneId, block }: InspectorProps<Say>) {
  const patch = useBlockPatch<Say>(sceneId, block.id)
  const project = useProjectStore((s) => s.project)
  const area = useRef<DraftAreaHandle>(null)

  const edit = (make: (text: string, start: number, end: number) => TextEdit): void => {
    const sel = area.current?.getSelection()
    const text = sel?.text ?? block.text
    const e = make(text, sel?.start ?? text.length, sel?.end ?? text.length)
    area.current?.apply(e.text, e.selStart, e.selEnd)
  }

  const variableItems: DropdownItem<string>[] = (project?.variableOrder ?? [])
    .filter((id) => project?.variables[id])
    .map((id) => ({ kind: 'item', value: id, label: project!.variables[id].name }))

  const insertVariable = (id: string): void => {
    const current = useProjectStore.getState().project
    const name = current ? buildNameTable(current).variables[id] : undefined
    if (name) edit((t, a, b) => insertAtSelection(t, a, b, `[${name}]`))
  }

  const [creating, setCreating] = useState(false)

  const items: DropdownItem<string>[] = [
    ...variableItems,
    ...(variableItems.length > 0 ? [{ kind: 'separator' } as const] : []),
    { kind: 'action', label: '+ New variable…', onSelect: () => setCreating(true) }
  ]

  return (
    <>
      <div className="field">
        <span className="field-label">Speaker</span>
        <CharacterSelect allowNarrator value={block.characterId} onChange={(characterId) => patch({ characterId })} aria-label="Speaker" />
      </div>
      <div className="field">
        <span className="field-label">Text</span>
        <DraftArea
          handle={area}
          rows={5}
          aria-label="Text"
          placeholder="Type what is said…"
          value={block.text}
          onCommit={(text) => patch({ text })}
        />
      </div>
      <div className="text-tools">
        <button
          type="button"
          className="tool-btn"
          title="Bold: wrap the selected text in {b}…{/b}"
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => edit((t, a, b) => wrapSelection(t, a, b, '{b}', '{/b}'))}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="tool-btn"
          title="Italic: wrap the selected text in {i}…{/i}"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => edit((t, a, b) => wrapSelection(t, a, b, '{i}', '{/i}'))}
        >
          <Italic size={15} />
        </button>
        <div className="insert-variable">
          <Dropdown value={null} placeholder="Insert variable" aria-label="Insert variable" items={items} onChange={insertVariable} />
        </div>
      </div>
      {creating && (
        <NewVariableModal
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            insertVariable(id)
          }}
        />
      )}
    </>
  )
}
