import type { ExtraEnding, Id } from '@shared/model'
import { leaveElements } from '@shared/screens'
import { Button } from '../../../components/Button'
import { SceneSelect, ScreenSelect } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import { useUiStore } from '../../../store/uiStore'
import type { RowProblem } from '../BlockRow'

type Screen = Extract<ExtraEnding, { type: 'screen' }>

interface Props {
  sceneId: Id
  ending: Screen
  problems: Map<string, RowProblem>
}

/** A screen ending: pick the screen; every button, image button or hotspot that leaves gets a scene picker (and an arrow on the map). */
export function ScreenEnding({ sceneId, ending, problems }: Props) {
  const setEndingScreen = useProjectStore((s) => s.setEndingScreen)
  const setScreenElementTarget = useProjectStore((s) => s.setScreenElementTarget)
  const def = useProjectStore((s) => (ending.screenId ? s.project?.screens[ending.screenId] : undefined))
  const leaving = def ? leaveElements(def) : []
  return (
    <div className="ending-body">
      <div className="field">
        <span className="field-label">Screen</span>
        <ScreenSelect value={ending.screenId} aria-label="Screen of the ending" onChange={(id) => setEndingScreen(sceneId, id)} />
      </div>
      {def && (
        <div>
          <Button onClick={() => useUiStore.getState().openScreen(def.id)} title="Edit this screen in the Screen Designer">
            Open in Screen Designer
          </Button>
        </div>
      )}
      {def && <span className="field-label">Where each leaving element goes</span>}
      {def && leaving.length === 0 && (
        <p className="muted-note">This screen has no way to leave. In the Screen Designer, give a button or hotspot the action "Leave screen".</p>
      )}
      {leaving.map((el) => {
        const problem = problems.get(`x:${el.id}`)
        return (
          <div key={el.id} data-exit-id={`x:${el.id}`} className={`case-row exit-row-edit ${problem ? `problem-${problem.severity}` : ''}`} title={problem?.message}>
            <span className="exit-name">{el.name}</span>
            <span className="arrow">→</span>
            <div className="option-target">
              <SceneSelect
                value={ending.targets[el.id] ?? null}
                nearSceneId={sceneId}
                aria-label={`Scene for ${el.name}`}
                onChange={(target) => setScreenElementTarget(sceneId, el.id, target)}
              />
            </div>
          </div>
        )
      })}
      {!def && <p className="muted-note">Pick a screen. Each element of it that leaves becomes an arrow on the Story Map.</p>}
    </div>
  )
}
