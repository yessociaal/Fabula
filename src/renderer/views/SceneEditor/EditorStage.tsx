import { useMemo } from 'react'
import type { Scene } from '@shared/model'
import { customPlacementFor } from '@shared/placement'
import { computeStage } from '@shared/stage'
import { dialogueFor, sceneSetsBackground } from '@shared/stageView'
import { Stage, type StageDrag } from '../../components/Stage'
import { pauseHistory, resumeHistory, useProjectStore } from '../../store/projectStore'
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
  const ambient = useMemo(() => {
    let current: string | null = null
    for (let i = 0; i <= index && i < scene.blocks.length; i++) {
      const b = scene.blocks[i]
      if (b.type === 'playMusic' && b.channel === 'ambient') current = b.assetId
      if (b.type === 'stopMusic' && b.channel === 'ambient') current = null
    }
    return current
  }, [scene.blocks, index])

  // The sprite of the selected Show block can be dragged on the stage. One drag is one undo step.
  const drag: StageDrag | null =
    block && block.type === 'show' && block.characterId !== null
      ? {
          characterId: block.characterId,
          onStart: () => {
            pauseHistory()
            if (block.placement.mode === 'preset') {
              useProjectStore.getState().updateBlock(scene.id, block.id, { placement: customPlacementFor(block) })
            }
          },
          onMove: (xalign, yalign) => {
            const current = useProjectStore.getState().project?.scenes[scene.id]?.blocks.find((b) => b.id === block.id)
            if (!current || current.type !== 'show' || current.placement.mode !== 'custom') return
            if (current.placement.xalign === xalign && current.placement.yalign === yalign) return
            useProjectStore.getState().updateBlock(scene.id, block.id, { placement: { ...current.placement, xalign, yalign } })
          },
          onEnd: () => resumeHistory()
        }
      : null

  return (
    <div className="stage-preview">
      <Stage
        stage={stage}
        assets={project.assets}
        characters={project.characters}
        dir={dir}
        dialogue={dialogue}
        carryOverNote={!sceneSetsBackground(project, scene.id, index)}
        ambientName={ambient ? (project.assets[ambient]?.name ?? 'Missing sound') : null}
        drag={drag}
      />
    </div>
  )
}
