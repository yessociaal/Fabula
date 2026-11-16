import { Plus, Trash2 } from 'lucide-react'
import type { CoreEnding, Id } from '@shared/model'
import { Button } from '../../../components/Button'
import { ConditionBuilder } from '../../../components/ConditionBuilder'
import { SceneSelect } from '../../../components/EntitySelects'
import { IconButton } from '../../../components/IconButton'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'

type Branch = Extract<CoreEnding, { type: 'branch' }>

interface Props {
  sceneId: Id
  ending: Branch
  problems: Map<string, RowProblem>
}

export function BranchEnding({ sceneId, ending, problems }: Props) {
  const addCase = useProjectStore((s) => s.addCase)
  const updateCase = useProjectStore((s) => s.updateCase)
  const deleteCase = useProjectStore((s) => s.deleteCase)
  const setExitTarget = useProjectStore((s) => s.setExitTarget)

  return (
    <div className="ending-body">
      {ending.cases.map((c, i) => {
        const problem = problems.get(`case:${c.id}`)
        return (
          <div key={c.id} data-exit-id={`case:${c.id}`} className={`case-row ${problem ? `problem-${problem.severity}` : ''}`} title={problem?.message}>
            <span className="case-label">{i === 0 ? 'If' : 'Else if'}</span>
            <div className="case-condition">
              <ConditionBuilder value={c.condition} onChange={(condition) => updateCase(sceneId, c.id, { condition })} />
            </div>
            <span className="arrow">→</span>
            <div className="option-target">
              <SceneSelect
                value={c.target}
                nearSceneId={sceneId}
                aria-label={`Scene for case ${i + 1}`}
                onChange={(target) => setExitTarget(sceneId, `case:${c.id}`, target)}
              />
            </div>
            <IconButton label="Delete this case" onClick={() => deleteCase(sceneId, c.id)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        )
      })}
      <div data-exit-id="else" className={`case-row otherwise-row ${problems.get('else') ? `problem-${problems.get('else')!.severity}` : ''}`} title={problems.get('else')?.message}>
        <span className="case-label">Otherwise</span>
        <span className="arrow">→</span>
        <div className="option-target">
          <SceneSelect
            value={ending.elseTarget}
            nearSceneId={sceneId}
            aria-label="Scene for otherwise"
            onChange={(target) => setExitTarget(sceneId, 'else', target)}
          />
        </div>
      </div>
      <div>
        <Button icon={<Plus size={14} />} onClick={() => addCase(sceneId)}>
          Add case
        </Button>
      </div>
    </div>
  )
}
