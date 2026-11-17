import { useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ExtraEnding, Id } from '@shared/model'
import { Button } from '../../../components/Button'
import { CommitField } from '../../../components/CommitField'
import { insertIntoCode, tabAsSpaces } from '../../../components/CodeEditing'
import { DraftArea, type DraftAreaHandle } from '../../../components/DraftArea'
import { Dropdown, type DropdownItem } from '../../../components/Dropdown'
import { SceneSelect } from '../../../components/EntitySelects'
import { IconButton } from '../../../components/IconButton'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'

type Code = Extract<ExtraEnding, { type: 'code' }>

interface Props {
  sceneId: Id
  ending: Code
  problems: Map<string, RowProblem>
}

/** A Ren'Py code ending: the code is the way out of the scene, and each named exit becomes an arrow on the map. */
export function CodeEnding({ sceneId, ending, problems }: Props) {
  const setEndingCode = useProjectStore((s) => s.setEndingCode)
  const addExit = useProjectStore((s) => s.addExit)
  const updateExit = useProjectStore((s) => s.updateExit)
  const deleteExit = useProjectStore((s) => s.deleteExit)
  const setExitTarget = useProjectStore((s) => s.setExitTarget)
  const area = useRef<DraftAreaHandle>(null)

  const exitItems: DropdownItem<string>[] = ending.exits
    .filter((x) => x.name.trim() !== '')
    .map((x) => ({ kind: 'item' as const, value: x.id, label: x.name }))

  const insertExit = (id: string): void => {
    const x = ending.exits.find((e) => e.id === id)
    if (x) insertIntoCode(area.current, ending.code, `jump @exit(${x.name})`)
  }

  return (
    <div className="ending-body">
      <div className="field">
        <span className="field-label">Code</span>
        <DraftArea
          handle={area}
          className="code-area"
          rows={7}
          aria-label="Ren'Py code of the ending"
          placeholder={'if courage > 2:\n    jump @exit(brave)\njump @exit(timid)'}
          value={ending.code}
          onCommit={(code) => setEndingCode(sceneId, code)}
          onKeyDown={(e) => tabAsSpaces(e, area.current)}
        />
      </div>
      <p className="muted-note">
        Exported exactly as written. <code>@exit(name)</code> becomes the label of the scene that exit leads to.
      </p>
      <div className="code-exits-head">
        <span className="field-label">Exits</span>
        <div className="code-insert">
          <Dropdown value={null} items={exitItems} onChange={insertExit} placeholder="Insert exit" aria-label="Insert exit" disabled={exitItems.length === 0} />
        </div>
      </div>
      {ending.exits.map((x, i) => {
        const problem = problems.get(`x:${x.id}`)
        return (
          <div
            key={x.id}
            data-exit-id={`x:${x.id}`}
            className={`case-row exit-row-edit ${problem ? `problem-${problem.severity}` : ''}`}
            title={problem?.message}
          >
            <CommitField
              className="exit-name"
              aria-label={`Name of exit ${i + 1}`}
              placeholder="Exit name"
              value={x.name}
              onCommit={(name) => updateExit(sceneId, x.id, { name })}
            />
            <span className="arrow">→</span>
            <div className="option-target">
              <SceneSelect
                value={x.target}
                nearSceneId={sceneId}
                aria-label={`Scene for exit ${i + 1}`}
                onChange={(target) => setExitTarget(sceneId, `x:${x.id}`, target)}
              />
            </div>
            <IconButton label={`Delete exit ${x.name || i + 1}`} onClick={() => deleteExit(sceneId, x.id)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        )
      })}
      {ending.exits.length === 0 && <p className="muted-note">No exits yet. Every exit you add is an arrow on the Story Map.</p>}
      <div>
        <Button icon={<Plus size={14} />} onClick={() => addExit(sceneId)}>
          Add exit
        </Button>
      </div>
    </div>
  )
}
