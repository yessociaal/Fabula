import type { ExtraBlock } from '@shared/model'
import { SceneSelect } from '../../../components/EntitySelects'
import { useProjectStore } from '../../../store/projectStore'
import { useBlockPatch, type InspectorProps } from './types'

type Visit = Extract<ExtraBlock, { type: 'visit' }>

export function VisitInspector({ sceneId, block }: InspectorProps<Visit>) {
  const patch = useBlockPatch<Visit>(sceneId, block.id)
  const target = useProjectStore((s) => (block.sceneId ? s.project?.scenes[block.sceneId] : undefined))
  return (
    <>
      <div className="field">
        <span className="field-label">Scene to visit</span>
        <SceneSelect value={block.sceneId} nearSceneId={sceneId} aria-label="Scene to visit" onChange={(next) => patch({ sceneId: next })} />
      </div>
      <p className="muted-note">Returns here when that scene ends.</p>
      {target && target.ending.type !== 'end' && (
        <p className="muted-note">
          "{target.name}" does not finish with End of story, so it will carry on into whatever it points to instead of coming back.
        </p>
      )}
    </>
  )
}
