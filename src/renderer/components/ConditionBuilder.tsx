import { Plus, Trash2 } from 'lucide-react'
import './editorWidgets.css'
import type { Clause, Condition } from '@shared/model'
import { createClause } from '@shared/factory'
import { useProjectStore } from '../store/projectStore'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Select } from './Select'
import { VariableSelect } from './EntitySelects'
import { ValueInput } from './EffectsEditor'
import { CLAUSE_OP_LABELS, clauseOpsFor, retargetClause } from './variableOps'

interface ConditionBuilderProps {
  /** null means "no condition yet": only the "+ Add condition" button shows. */
  value: Condition | null
  onChange: (condition: Condition) => void
}

function ClauseRow({ clause, onChange, onDelete }: { clause: Clause; onChange: (c: Clause) => void; onDelete: () => void }) {
  const variables = useProjectStore((s) => s.project?.variables)
  const variable = clause.variableId === null ? undefined : variables?.[clause.variableId]
  const ops = clauseOpsFor(variable?.type ?? null)
  return (
    <div className="condition-row">
      <VariableSelect
        value={clause.variableId}
        onChange={(id) => onChange(retargetClause(clause, useProjectStore.getState().project?.variables[id]))}
        aria-label="Variable to check"
      />
      <Select
        value={clause.op}
        options={ops.map((op) => ({ value: op, label: CLAUSE_OP_LABELS[op] }))}
        onChange={(op) => onChange({ ...clause, op })}
      />
      {variable && (
        <ValueInput type={variable.type} value={clause.value} label="Value to compare with" onChange={(value) => onChange({ ...clause, value })} />
      )}
      <IconButton label="Remove this condition" onClick={onDelete}>
        <Trash2 size={15} />
      </IconButton>
    </div>
  )
}

/** Rows of [variable] [is / is not / > …] [value], with an All / Any toggle once there are two or more. */
export function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
  const add = (): void => {
    const base: Condition = value ?? { join: 'and', clauses: [] }
    onChange({ ...base, clauses: [...base.clauses, createClause()] })
  }

  return (
    <div className="condition-builder">
      {value && value.clauses.length >= 2 && (
        <div className="join-toggle" role="radiogroup" aria-label="How the conditions combine">
          {(['and', 'or'] as const).map((j) => (
            <button
              key={j}
              type="button"
              role="radio"
              aria-checked={value.join === j}
              className={value.join === j ? 'active' : ''}
              onClick={() => onChange({ ...value, join: j })}
            >
              {j === 'and' ? 'All of these' : 'Any of these'}
            </button>
          ))}
        </div>
      )}
      {value?.clauses.map((c) => (
        <ClauseRow
          key={c.id}
          clause={c}
          onChange={(next) => onChange({ ...value, clauses: value.clauses.map((x) => (x.id === c.id ? next : x)) })}
          onDelete={() => onChange({ ...value, clauses: value.clauses.filter((x) => x.id !== c.id) })}
        />
      ))}
      {value && value.clauses.length === 0 && <p className="muted-note">No conditions: this is always true.</p>}
      <Button icon={<Plus size={14} />} onClick={add}>
        Add condition
      </Button>
    </div>
  )
}
