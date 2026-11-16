import { useMemo } from 'react'
import { findBlockPath, getBlockAt, type BlockPath } from '@shared/blockTree'
import type { Scene } from '@shared/model'
import { customPlacementFor } from '@shared/placement'
import { appliedBlocks, computeStageAt } from '@shared/stage'
import { dialogueFor, sceneSetsBackgroundAt } from '@shared/stageView'
import { Stage, type StageDrag } from '../../components/Stage'
import { pauseHistory, resumeHistory, useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'

/**
 * The stage preview: what the audience sees right after the selected block (or after the last top-level block when none is selected).
 * Blocks inside If and Choice blocks follow the nesting rule documented on `appliedBlocks` in shared/stage.ts.
 */
export function EditorStage({ scene }: { scene: Scene }) {
  const project = useProjectStore((s) => s.project)!
  const dir = useProjectStore((s) => s.dir)
  const selectedBlockId = useUiStore((s) => s.selectedBlockId)

  const selectedPath = selectedBlockId ? findBlockPath(scene.blocks, selectedBlockId) : null
  const path: BlockPath = selectedPath ?? (scene.blocks.length > 0 ? [{ i: scene.blocks.length - 1 }] : [])
  const block = path.length > 0 ? getBlockAt(scene.blocks, path) : undefined
  const pathText = JSON.stringify(path)

  const stage = useMemo(() => computeStageAt(project, scene.id, path), [project, scene.id, pathText]) // eslint-disable-line react-hooks/exhaustive-deps
  const dialogue = block && block.type === 'say' ? dialogueFor(project, block.characterId, block.text) : null
  const ambient = useMemo(() => {
    let current: string | null = null
    for (const b of appliedBlocks(scene.blocks, path)) {
      if (b.type === 'playMusic' && b.channel === 'ambient') current = b.assetId
      if (b.type === 'stopMusic' && b.channel === 'ambient') current = null
    }
    return current
  }, [scene.blocks, pathText]) // eslint-disable-line react-hooks/exhaustive-deps

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
            const current = useProjectStore.getState().project?.scenes[scene.id]
            const at = current ? findBlockPath(current.blocks, block.id) : null
            const live = current && at ? getBlockAt(current.blocks, at) : undefined
            if (!live || live.type !== 'show' || live.placement.mode !== 'custom') return
            if (live.placement.xalign === xalign && live.placement.yalign === yalign) return
            useProjectStore.getState().updateBlock(scene.id, block.id, { placement: { ...live.placement, xalign, yalign } })
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
        carryOverNote={!sceneSetsBackgroundAt(project, scene.id, path)}
        ambientName={ambient ? (project.assets[ambient]?.name ?? 'Missing sound') : null}
        drag={drag}
      />
    </div>
  )
}
