import type { CoreEnding, Id } from '@shared/model'
import { SceneSelect } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'

type Jump = Extract<CoreEnding, { type: 'jump' }>

interface Props {
  sceneId: Id
  ending: Jump
  problems: Map<string, RowProblem>
}

export function JumpEnding({ sceneId, ending, problems }: Props) {
  const setExitTarget = useProjectStore((s) => s.setExitTarget)
  const problem = problems.get('jump')
  return (
    <div className="ending-body">
      <div className={`case-row jump-row ${problem ? `problem-${problem.severity}` : ''}`} title={problem?.message}>
        <span className="case-label">Then go to</span>
        <div className="option-target">
          <SceneSelect
            value={ending.target}
            nearSceneId={sceneId}
            aria-label="Scene to go to"
            onChange={(target) => setExitTarget(sceneId, 'jump', target)}
          />
        </div>
      </div>
    </div>
  )
}
