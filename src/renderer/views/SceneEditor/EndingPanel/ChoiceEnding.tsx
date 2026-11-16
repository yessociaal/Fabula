import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import type { ChoiceOption, CoreEnding, Id } from '@shared/model'
import { Button } from '../../../components/Button'
import { CommitField } from '../../../components/CommitField'
import { ConditionChip } from '../../../components/ConditionChip'
import { EffectsEditor } from '../../../components/EffectsEditor'
import { CharacterSelect, SceneSelect } from '../../../components/EntitySelects'
import { IconButton } from '../../../components/IconButton'
import { Popover } from '../../../components/Popover'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'

type Choice = Extract<CoreEnding, { type: 'choice' }>

interface Props {
  sceneId: Id
  ending: Choice
  problems: Map<string, RowProblem>
}

function OptionRow({ sceneId, option, index, problem }: { sceneId: Id; option: ChoiceOption; index: number; problem: RowProblem | undefined }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: option.id })
  const updateOption = useProjectStore((s) => s.updateOption)
  const deleteOption = useProjectStore((s) => s.deleteOption)
  const setExitTarget = useProjectStore((s) => s.setExitTarget)

  return (
    <div
      ref={setNodeRef}
      data-exit-id={`opt:${option.id}`}
      className={`option-row ${isDragging ? 'dragging' : ''} ${problem ? `problem-${problem.severity}` : ''}`}
      style={{ transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined, transition }}
      title={problem?.message}
    >
      <button type="button" ref={setActivatorNodeRef} className="row-handle" aria-label="Drag to reorder this choice" title="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <span className="option-number">{index + 1}</span>
      <CommitField
        className="option-text"
        aria-label={`Text of choice ${index + 1}`}
        placeholder="What the player picks"
        value={option.text}
        onCommit={(text) => updateOption(sceneId, option.id, { text })}
      />
      <ConditionChip
        value={option.condition}
        onChange={(condition) => updateOption(sceneId, option.id, { condition })}
        title="Show this choice only when…"
        emptyTitle="Show this choice only when a condition is true"
      />
      <Popover
        label="Variable changes"
        className="popover-wide"
        trigger={(props) => (
          <button
            type="button"
            {...props}
            className={`chip-btn ${option.effects.length > 0 ? 'active' : ''}`}
            title="Change variables when the player picks this choice"
          >
            {option.effects.length > 0 ? `Effects (${option.effects.length})` : 'Effects'}
          </button>
        )}
      >
        <div className="popover-body">
          <div className="popover-title">When this choice is picked…</div>
          <EffectsEditor effects={option.effects} onChange={(effects) => updateOption(sceneId, option.id, { effects })} />
        </div>
      </Popover>
      <span className="arrow">→</span>
      <div className="option-target">
        <SceneSelect
          value={option.target}
          nearSceneId={sceneId}
          aria-label={`Scene for choice ${index + 1}`}
          onChange={(target) => setExitTarget(sceneId, `opt:${option.id}`, target)}
        />
      </div>
      <IconButton label="Delete this choice" onClick={() => deleteOption(sceneId, option.id)}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  )
}

export function ChoiceEnding({ sceneId, ending, problems }: Props) {
  const setEnding = useProjectStore((s) => s.setEnding)
  const addOption = useProjectStore((s) => s.addOption)
  const moveOption = useProjectStore((s) => s.moveOption)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = (e: DragEndEvent): void => {
    if (!e.over || e.active.id === e.over.id) return
    const from = ending.options.findIndex((o) => o.id === e.active.id)
    const to = ending.options.findIndex((o) => o.id === e.over!.id)
    if (from >= 0 && to >= 0) moveOption(sceneId, from, to)
  }

  return (
    <div className="ending-body">
      <div className="prompt-row">
        <label className="check-row" title="Show the choices without a line of dialogue before them">
          <input
            type="checkbox"
            checked={ending.prompt === null}
            onChange={(e) => setEnding(sceneId, { ...ending, prompt: e.target.checked ? null : { characterId: null, text: '' } })}
          />
          No prompt
        </label>
        {ending.prompt && (
          <>
            <div className="prompt-speaker">
              <CharacterSelect
                allowNarrator
                value={ending.prompt.characterId}
                aria-label="Prompt speaker"
                onChange={(characterId) => setEnding(sceneId, { ...ending, prompt: { ...ending.prompt!, characterId } })}
              />
            </div>
            <CommitField
              className="prompt-text"
              aria-label="Prompt text"
              placeholder="What is asked, e.g. Which way?"
              value={ending.prompt.text}
              onCommit={(text) => setEnding(sceneId, { ...ending, prompt: { ...ending.prompt!, text } })}
            />
          </>
        )}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ending.options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          {ending.options.map((o, i) => (
            <OptionRow key={o.id} sceneId={sceneId} option={o} index={i} problem={problems.get(`opt:${o.id}`)} />
          ))}
        </SortableContext>
      </DndContext>
      {ending.options.length === 0 && <p className="muted-note">No choices yet. Add the first one.</p>}
      <div>
        <Button icon={<Plus size={14} />} onClick={() => addOption(sceneId)}>
          Add choice
        </Button>
      </div>
    </div>
  )
}
