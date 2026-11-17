import { useMemo, useState } from 'react'
import { useKitStore } from '../../store/kitStore'
import { Plus, Sigma, Trash2 } from 'lucide-react'
import type { Id, Variable } from '@shared/model'
import { countUsage, findUsage } from '@shared/usage'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { InUseModal } from '../../components/InUseModal'
import { NumberField } from '../../components/NumberField'
import { goToScene } from '../../navigation'
import { useProjectStore } from '../../store/projectStore'
import { plural } from '../../util'

const TYPES: { value: Variable['type']; label: string }[] = [
  { value: 'boolean', label: 'True/False' },
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' }
]

export default function Variables() {
  const project = useProjectStore((s) => s.project)
  const store = useProjectStore.getState
  const [retype, setRetype] = useState<{ id: Id; type: Variable['type'] } | null>(null)
  const [deleting, setDeleting] = useState<Id | null>(null)
  const kits = useKitStore((s) => s.kits)
  const usage = useMemo(() => (project ? findUsage(project, { kits }) : null), [project, kits])
  if (!project || !usage) return null

  const retypeVar = retype ? project.variables[retype.id] : null
  const deleteVar = deleting ? project.variables[deleting] : null

  const changeType = (v: Variable, type: Variable['type']): void => {
    if (type === v.type) return
    if (countUsage(usage.variables[v.id]) > 0) setRetype({ id: v.id, type })
    else store().changeVariableType(v.id, type)
  }

  return (
    <div className="pane">
      <div className="pane-row">
        <Button icon={<Plus size={16} />} onClick={() => store().addVariable({ name: 'new_variable' })}>
          Variable
        </Button>
      </div>

      {project.variableOrder.length === 0 ? (
        <EmptyState icon={<Sigma size={20} />} title="Variables">
          A variable remembers something while the game runs, like a number of points or whether a door is open.
        </EmptyState>
      ) : (
        <table className="var-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Starting value</th>
              <th title="Kept between playthroughs, like which endings the player has seen">Remember across playthroughs</th>
              <th>Notes</th>
              <th>Used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {project.variableOrder.map((id) => {
              const v = project.variables[id]
              if (!v) return null
              const used = countUsage(usage.variables[id])
              return (
                <tr key={id}>
                  <td>
                    <CommitField
                      aria-label="Variable name"
                      value={v.name}
                      required
                      onCommit={(name) => store().updateVariable(id, { name })}
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      aria-label="Variable type"
                      value={v.type}
                      onChange={(e) => changeType(v, e.target.value as Variable['type'])}
                    >
                      {TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {v.type === 'boolean' ? (
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={v.defaultValue === true}
                          onChange={(e) => store().updateVariable(id, { defaultValue: e.target.checked })}
                        />
                        {v.defaultValue === true ? 'True' : 'False'}
                      </label>
                    ) : v.type === 'number' ? (
                      <NumberField
                        aria-label="Starting value"
                        value={typeof v.defaultValue === 'number' ? v.defaultValue : 0}
                        onChange={(n) => store().updateVariable(id, { defaultValue: n })}
                      />
                    ) : (
                      <CommitField
                        aria-label="Starting value"
                        value={typeof v.defaultValue === 'string' ? v.defaultValue : ''}
                        onCommit={(t) => store().updateVariable(id, { defaultValue: t })}
                      />
                    )}
                  </td>
                  <td>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        aria-label={`Remember ${v.name} across playthroughs`}
                        checked={v.persistent}
                        onChange={(e) => store().updateVariable(id, { persistent: e.target.checked })}
                      />
                      {v.persistent ? 'Remembered' : 'No'}
                    </label>
                  </td>
                  <td>
                    <CommitField
                      aria-label="Notes"
                      placeholder="Notes (never exported)"
                      value={v.description}
                      onCommit={(description) => store().updateVariable(id, { description })}
                    />
                  </td>
                  <td className="var-used">{used === 0 ? 'unused' : `used ${plural(used, 'time')}`}</td>
                  <td>
                    <IconButton
                      label={`Delete ${v.name}`}
                      onClick={() => (used > 0 ? setDeleting(id) : store().deleteVariable(id))}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {retype && retypeVar && (
        <InUseModal
          title={`Change ${retypeVar.name} to ${TYPES.find((t) => t.value === retype.type)?.label}?`}
          message={`${retypeVar.name} is used in ${plural(usage.variables[retype.id].length, 'place')}. Its starting value and the value in each of these places will be reset.`}
          refs={usage.variables[retype.id]}
          confirmLabel="Change type and reset"
          onOpenScene={(sid) => {
            setRetype(null)
            goToScene(sid)
          }}
          onConfirm={() => {
            store().changeVariableType(retype.id, retype.type)
            setRetype(null)
          }}
          onCancel={() => setRetype(null)}
        />
      )}
      {deleteVar && (
        <InUseModal
          title={`Delete ${deleteVar.name}?`}
          message={`${deleteVar.name} is used in ${plural(usage.variables[deleteVar.id].length, 'place')}. Deleting clears it from all of them.`}
          refs={usage.variables[deleteVar.id]}
          confirmLabel="Clear from all scenes and delete"
          onOpenScene={(sid) => {
            setDeleting(null)
            goToScene(sid)
          }}
          onConfirm={() => {
            store().deleteVariable(deleteVar.id)
            setDeleting(null)
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
