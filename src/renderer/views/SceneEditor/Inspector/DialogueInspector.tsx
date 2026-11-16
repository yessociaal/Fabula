import { useRef, useState } from 'react'
import { Bold, Italic, Underline } from 'lucide-react'
import type { CoreBlock } from '@shared/model'
import { buildNameTable } from '@shared/naming'
import { AssetPicker } from '../../../components/AssetPicker'
import { Button } from '../../../components/Button'
import { DraftArea, type DraftAreaHandle } from '../../../components/DraftArea'
import { Dropdown, type DropdownItem } from '../../../components/Dropdown'
import { CharacterSelect, NewVariableModal } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import { insertAtSelection, wrapSelection, type TextEdit } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type Say = Extract<CoreBlock, { type: 'say' }>
type Panel = 'color' | 'size' | 'speed' | null

/** Dialogue and Narration (a Dialogue with no speaker). */
export function DialogueInspector({ sceneId, block }: InspectorProps<Say>) {
  const patch = useBlockPatch<Say>(sceneId, block.id)
  const project = useProjectStore((s) => s.project)
  const area = useRef<DraftAreaHandle>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [color, setColor] = useState('#ff5555')
  const [size, setSize] = useState('36')
  const [speed, setSpeed] = useState('30')

  const edit = (make: (text: string, start: number, end: number) => TextEdit): void => {
    const sel = area.current?.getSelection()
    const text = sel?.text ?? block.text
    const e = make(text, sel?.start ?? text.length, sel?.end ?? text.length)
    area.current?.apply(e.text, e.selStart, e.selEnd)
  }
  const wrap = (open: string, close: string): void => edit((t, a, b) => wrapSelection(t, a, b, open, close))
  const insert = (tag: string): void => edit((t, a, b) => insertAtSelection(t, a, b, tag))

  const variableItems: DropdownItem<string>[] = (project?.variableOrder ?? [])
    .filter((id) => project?.variables[id])
    .map((id) => {
      const v = project!.variables[id]
      return { kind: 'item', value: id, label: v.persistent ? `persistent.${v.name}` : v.name }
    })

  const insertVariable = (id: string): void => {
    const current = useProjectStore.getState().project
    const name = current ? buildNameTable(current).variableRefs[id] : undefined
    if (name) insert(`[${name}]`)
  }

  const [creating, setCreating] = useState(false)

  const items: DropdownItem<string>[] = [
    ...variableItems,
    ...(variableItems.length > 0 ? [{ kind: 'separator' } as const] : []),
    { kind: 'action', label: '+ New variable…', onSelect: () => setCreating(true) }
  ]

  const whole = (n: string, min: number, max: number): number | null => {
    const v = Math.round(Number(n))
    return Number.isFinite(v) && v >= min && v <= max ? v : null
  }
  const sizeValue = whole(size, 1, 999)
  const speedValue = whole(speed, 1, 999)

  const textButton = (label: string, title: string, onClick: () => void, active = false) => (
    <button
      type="button"
      className={`tool-btn tool-btn-text ${active ? 'active' : ''}`}
      title={title}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  )

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
          onClick={() => wrap('{b}', '{/b}')}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className="tool-btn"
          title="Italic: wrap the selected text in {i}…{/i}"
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap('{i}', '{/i}')}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className="tool-btn"
          title="Underline: wrap the selected text in {u}…{/u}"
          aria-label="Underline"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => wrap('{u}', '{/u}')}
        >
          <Underline size={15} />
        </button>
        <div className="insert-variable">
          <Dropdown value={null} placeholder="Insert variable" aria-label="Insert variable" items={items} onChange={insertVariable} />
        </div>
      </div>
      <div className="text-tools text-tools-wrap">
        {textButton('Colour', 'Colour: wrap the selected text in {color=…}', () => setPanel(panel === 'color' ? null : 'color'), panel === 'color')}
        {textButton('Size', 'Size: wrap the selected text in {size=…}', () => setPanel(panel === 'size' ? null : 'size'), panel === 'size')}
        {textButton('Wait for click', 'Insert {w}: the line waits for a click here, then goes on', () => insert('{w}'))}
        {textButton('Pause', 'Insert {p}: the line waits for a click here, then starts a new paragraph', () => insert('{p}'))}
        {textButton('Speed', 'Speed: wrap the selected text in {cps=…} (characters per second)', () => setPanel(panel === 'speed' ? null : 'speed'), panel === 'speed')}
      </div>
      {panel === 'color' && (
        <div className="tool-panel">
          <input type="color" aria-label="Text colour" value={color} onChange={(e) => setColor(e.target.value)} />
          <span className="color-hex">{color}</span>
          <Button
            onClick={() => {
              wrap(`{color=${color.toLowerCase()}}`, '{/color}')
              setPanel(null)
            }}
          >
            Apply colour
          </Button>
        </div>
      )}
      {panel === 'size' && (
        <div className="tool-panel">
          <input className="input" type="number" aria-label="Text size" min={1} max={999} value={size} onChange={(e) => setSize(e.target.value)} />
          <Button
            disabled={sizeValue === null}
            onClick={() => {
              if (sizeValue === null) return
              wrap(`{size=${sizeValue}}`, '{/size}')
              setPanel(null)
            }}
          >
            Apply size
          </Button>
        </div>
      )}
      {panel === 'speed' && (
        <div className="tool-panel">
          <input className="input" type="number" aria-label="Characters per second" min={1} max={999} value={speed} onChange={(e) => setSpeed(e.target.value)} />
          <span className="muted-note">characters per second</span>
          <Button
            disabled={speedValue === null}
            onClick={() => {
              if (speedValue === null) return
              wrap(`{cps=${speedValue}}`, '{/cps}')
              setPanel(null)
            }}
          >
            Apply speed
          </Button>
        </div>
      )}
      <div className="field">
        <span className="field-label">Voice line</span>
        <AssetPicker kind="voice" value={block.voiceAssetId} onChange={(voiceAssetId) => patch({ voiceAssetId })} noneLabel="No voice" />
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
