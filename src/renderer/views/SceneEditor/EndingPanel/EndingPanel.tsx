import { useMemo } from 'react'
import type { CoreEndingType, Id, Scene } from '@shared/model'
import { validateProject } from '@shared/validate'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'
import { BranchEnding } from './BranchEnding'
import { ChoiceEnding } from './ChoiceEnding'
import { EndEnding } from './EndEnding'
import { JumpEnding } from './JumpEnding'

const TYPES: { value: CoreEndingType; label: string }[] = [
  { value: 'choice', label: 'Choices' },
  { value: 'jump', label: 'Go to' },
  { value: 'branch', label: 'If' },
  { value: 'end', label: 'End of story' }
]

/** Problems on this scene's exits, keyed by exit handle id (`jump`, `opt:<id>`, `case:<id>`, `else`). */
function useExitProblems(sceneId: Id): Map<string, RowProblem> {
  const project = useProjectStore((s) => s.project)
  return useMemo(() => {
    const map = new Map<string, RowProblem>()
    if (!project) return map
    for (const p of validateProject(project)) {
      if (p.sceneId !== sceneId || !p.exitId) continue
      if (!map.has(p.exitId) || p.severity === 'error') map.set(p.exitId, { severity: p.severity, message: p.message })
    }
    return map
  }, [project, sceneId])
}

/** How the scene finishes. Always visible below the block list. */
export function EndingPanel({ scene }: { scene: Scene }) {
  const setEndingType = useProjectStore((s) => s.setEndingType)
  const problems = useExitProblems(scene.id)
  const e = scene.ending

  return (
    <section className="ending-panel" aria-label="Ending">
      <div className="ending-head">
        <h3 className="panel-heading">Ending</h3>
        <div className="seg" role="radiogroup" aria-label="How this scene ends">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={e.type === t.value}
              className={e.type === t.value ? 'active' : ''}
              onClick={() => setEndingType(scene.id, t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {e.type === 'choice' && <ChoiceEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'jump' && <JumpEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'branch' && <BranchEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'end' && <EndEnding />}
      {!['choice', 'jump', 'branch', 'end'].includes(e.type) && (
        <p className="muted-note">This kind of ending cannot be edited here yet.</p>
      )}
    </section>
  )
}
