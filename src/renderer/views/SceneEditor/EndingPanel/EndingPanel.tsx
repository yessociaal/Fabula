import { useMemo, useState } from 'react'
import type { CoreEndingType, Id, Scene } from '@shared/model'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { validateProject } from '@shared/validate'
import { useKitStore } from '../../../store/kitStore'
import { useProjectStore } from '../../../store/projectStore'
import { KitIcon } from '../../../components/KitIcon'
import { KitEnding } from './KitEnding'
import type { RowProblem } from '../BlockRow'
import { BranchEnding } from './BranchEnding'
import { CodeEnding } from './CodeEnding'
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
  const kits = useKitStore((s) => s.kits)
  return useMemo(() => {
    const map = new Map<string, RowProblem>()
    if (!project) return map
    for (const p of validateProject(project, { kits })) {
      if (p.sceneId !== sceneId || !p.exitId) continue
      if (!map.has(p.exitId) || p.severity === 'error') map.set(p.exitId, { severity: p.severity, message: p.message })
    }
    return map
  }, [project, sceneId, kits])
}

/** How the scene finishes. Always visible below the block list. */
export function EndingPanel({ scene }: { scene: Scene }) {
  const setEndingType = useProjectStore((s) => s.setEndingType)
  const problems = useExitProblems(scene.id)
  const e = scene.ending
  const [moreOpen, setMoreOpen] = useState(false)
  const kits = useKitStore((s) => s.kits)
  const enabledKits = useProjectStore((s) => s.project?.kits ?? [])
  const setKitEnding = useProjectStore((s) => s.setKitEnding)
  const kitEndings = enabledKits.flatMap((id) => {
    const kit = kits.find((k) => k.id === id)
    return kit && kit.manifest ? kit.manifest.endings.map((def) => ({ kitId: id, kitName: kit.manifest?.name ?? id, def })) : []
  })
  const showMore = moreOpen || e.type === 'code' || e.type === 'kit'

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
        <button
          type="button"
          className="more-toggle"
          aria-expanded={showMore}
          title="More ways to end a scene"
          onClick={() => setMoreOpen(!showMore)}
        >
          {showMore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          More
        </button>
      </div>
      {showMore && (
        <div className="ending-more" aria-label="More endings">
          <div className="seg" role="radiogroup" aria-label="More ways this scene can end">
            <button
              type="button"
              role="radio"
              aria-checked={e.type === 'code'}
              className={e.type === 'code' ? 'active' : ''}
              title="Write the ending yourself in Ren'Py code; each named exit is an arrow on the map"
              onClick={() => setEndingType(scene.id, 'code')}
            >
              Ren'Py code
            </button>
            {kitEndings.map(({ kitId, kitName, def }) => {
              const active = e.type === 'kit' && e.kitId === kitId && e.endingType === def.type
              return (
                <button
                  key={`${kitId}:${def.type}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={active ? 'active' : ''}
                  title={`${kitName} kit: ${def.name}`}
                  onClick={() => setKitEnding(scene.id, kitId, def.type)}
                >
                  <KitIcon name={def.icon} size={14} /> {def.name}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {e.type === 'choice' && <ChoiceEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'jump' && <JumpEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'branch' && <BranchEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'end' && <EndEnding />}
      {e.type === 'code' && <CodeEnding sceneId={scene.id} ending={e} problems={problems} />}
      {e.type === 'kit' && <KitEnding sceneId={scene.id} ending={e} problems={problems} />}
      {!['choice', 'jump', 'branch', 'end', 'code', 'kit'].includes(e.type) && (
        <p className="muted-note">This kind of ending cannot be edited here yet.</p>
      )}
    </section>
  )
}
