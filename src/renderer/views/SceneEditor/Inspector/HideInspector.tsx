import { useMemo } from 'react'
import type { CoreBlock, Transition } from '@shared/model'
import { CharacterSelect } from '../../../components/EntitySelects'
import { Select } from '../../../components/Select'
import { useProjectStore } from '../../../store/projectStore'
import { TRANSITION_OPTIONS, charactersForHide } from '../editorHelpers'
import { useBlockPatch, type InspectorProps } from './types'

type Hide = Extract<CoreBlock, { type: 'hide' }>

export function HideInspector({ sceneId, block, index }: InspectorProps<Hide>) {
  const patch = useBlockPatch<Hide>(sceneId, block.id)
  const project = useProjectStore((s) => s.project)
  const firstGroup = useMemo(() => {
    if (!project) return undefined
    return { label: 'On stage now', ids: charactersForHide(project, sceneId, index).onStage, restLabel: 'Other characters' }
  }, [project, sceneId, index])
  return (
    <>
      <div className="field">
        <span className="field-label">Character</span>
        <CharacterSelect value={block.characterId} onChange={(characterId) => patch({ characterId })} firstGroup={firstGroup} aria-label="Character" />
      </div>
      <Select<Transition> label="Transition" value={block.transition} options={TRANSITION_OPTIONS} onChange={(transition) => patch({ transition })} />
    </>
  )
}
