import { findEndingDef, findKit } from '@shared/kits/types'
import type { ExtraEnding, Id } from '@shared/model'
import { SceneSelect } from '../../../components/EntitySelects'
import { useKitStore } from '../../../store/kitStore'
import { useProjectStore } from '../../../store/projectStore'
import type { RowProblem } from '../BlockRow'
import { KitForm } from '../Inspector/KitForm'

type Kit = Extract<ExtraEnding, { type: 'kit' }>

interface Props {
  sceneId: Id
  ending: Kit
  problems: Map<string, RowProblem>
}

/** A kit ending: the form comes from the manifest, and every exit the manifest's `exits` rule makes gets a scene picker (and an arrow on the map). */
export function KitEnding({ sceneId, ending, problems }: Props) {
  const kit = useKitStore((s) => findKit(s, ending.kitId))
  const setKitParams = useProjectStore((s) => s.setKitParams)
  const setExitTarget = useProjectStore((s) => s.setExitTarget)
  const def = findEndingDef(kit, ending.endingType)
  if (!kit || kit.manifest === null || !def) {
    return (
      <div className="ending-body">
        <p className="muted-note">{`Kit "${ending.kitId}" is not available.${kit?.error ? ` ${kit.error}` : ''}`}</p>
      </div>
    )
  }
  return (
    <div className="ending-body kit-ending">
      <KitForm fields={def.fields} params={ending.params} onChange={(params) => setKitParams(sceneId, null, params)} />
      {def.exits && (
        <>
          <span className="field-label">Where each exit leads</span>
          {ending.exits.length === 0 && <p className="muted-note">No exits yet. Each one you add becomes an arrow on the Story Map.</p>}
          {ending.exits.map((x, i) => {
            const problem = problems.get(`x:${x.id}`)
            return (
              <div key={x.id} data-exit-id={`x:${x.id}`} className={`case-row exit-row-edit ${problem ? `problem-${problem.severity}` : ''}`} title={problem?.message}>
                <span className="exit-name">{x.name.trim() === '' ? 'Untitled exit' : x.name}</span>
                <span className="arrow">→</span>
                <div className="option-target">
                  <SceneSelect value={x.target} nearSceneId={sceneId} aria-label={`Scene for exit ${i + 1}`} onChange={(target) => setExitTarget(sceneId, `x:${x.id}`, target)} />
                </div>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
