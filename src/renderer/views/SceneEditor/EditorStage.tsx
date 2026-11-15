import { useMemo } from 'react'
import type { Scene } from '@shared/model'
import { computeStage } from '@shared/stage'
import { dialogueFor, sceneSetsBackground } from '@shared/stageView'
import { Stage } from '../../components/Stage'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'

/** The stage preview: what the audience sees right after the selected block (or after the last block when none is selected). */
export function EditorStage({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)!
  const dir = useProjectStore((s) => s.dir)
  const selectedBlockId = useUiStore((s) => s.selectedBlockId)

  const selected = selectedBlockId ? scene.blocks.findIndex((b) => b.id === selectedBlockId) : -1
  const index = selected >= 0 ? selected : scene.blocks.length - 1
  const block = index >= 0 ? scene.blocks[index] : undefined

  const stage = useMemo(() => computeStage(project, scene.id, index), [project, scene.id, index])
  const dialogue = block && block.type === 'say' ? dialogueFor(project, block.characterId, block.text) : null

  return (
    <div className="stage-preview">
      <Stage
        stage={stage}
        assets={project.assets}
        characters={project.characters}
        dir={dir}
        dialogue={dialogue}
        carryOverNote={!sceneSetsBackground(project, scene.id, index)}
      />
    </div>
  )
}
