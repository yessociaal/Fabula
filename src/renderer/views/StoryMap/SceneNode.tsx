import { memo, useEffect, useMemo, useRef } from 'react'
import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from '@xyflow/react'
import { AlertTriangle, OctagonAlert, Play } from 'lucide-react'
import type { Id } from '@shared/model'
import { AssetThumb } from '../../components/AssetThumb'
import { plural } from '../../util'
import { useProjectStore } from '../../store/projectStore'
import { ExitRow } from './ExitRow'
import { sceneCardInfo } from './mapModel'
import { useMapUi } from './mapUi'

export interface SceneNodeData extends Record<string, unknown> {
  sceneId: Id
  /** Search is active and this scene does not match. */
  dimmed: boolean
  /** Search is active and this scene matches. */
  match: boolean
  /** No path from the start scene leads here. */
  unreachable: boolean
  errors: number
  warnings: number
  problemText: string
}
export type SceneFlowNode = Node<SceneNodeData, 'scene'>

function RenameInput({ sceneId, name }: { sceneId: Id; name: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const renameScene = useProjectStore((s) => s.renameScene)
  const setRenaming = useMapUi((s) => s.setRenaming)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    const next = ref.current?.value.trim() ?? ''
    if (save && next !== '' && next !== name) renameScene(sceneId, next)
    setRenaming(null)
  }
  return (
    <input
      ref={ref}
      className="input scene-rename nodrag nopan nowheel"
      defaultValue={name}
      aria-label="Scene name"
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}

function SceneNodeView({ data, selected }: NodeProps<SceneFlowNode>) {
  const { sceneId } = data
  const scene = useProjectStore((s) => s.project?.scenes[sceneId])
  const characters = useProjectStore((s) => s.project?.characters)
  const variables = useProjectStore((s) => s.project?.variables)
  const screens = useProjectStore((s) => s.project?.screens)
  const isStart = useProjectStore((s) => s.project?.startSceneId === sceneId)
  const chapterColor = useProjectStore((s) => {
    const chapterId = s.project?.scenes[sceneId]?.chapterId
    return chapterId ? s.project?.chapters[chapterId]?.color : undefined
  })
  const backgroundAssetId = useMemo(() => {
    const project = useProjectStore.getState().project
    return scene && project ? sceneCardInfo(scene, project).backgroundAssetId : null
  }, [scene])
  const asset = useProjectStore((s) => (backgroundAssetId ? s.project?.assets[backgroundAssetId] : undefined))
  const renaming = useMapUi((s) => s.renamingId === sceneId)
  const setRenaming = useMapUi((s) => s.setRenaming)
  const updateNodeInternals = useUpdateNodeInternals()

  // The card text depends on the scene plus the characters, variables and screens it refers to.
  const info = useMemo(() => {
    const project = useProjectStore.getState().project
    return scene && project ? sceneCardInfo(scene, project) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, characters, variables, screens])

  const handleKey = info ? info.exits.map((r) => r.handleId).join('|') : ''
  useEffect(() => {
    updateNodeInternals(sceneId)
  }, [handleKey, sceneId, updateNodeInternals])

  if (!scene || !info) return null

  const classes = [
    'scene-card',
    selected ? 'selected' : '',
    data.unreachable ? 'unreachable' : '',
    data.dimmed ? 'dimmed' : '',
    data.match ? 'match' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} title={data.unreachable ? 'No path from the start scene leads here' : undefined}>
      <div className="scene-strip" style={{ background: chapterColor ?? 'transparent' }} />
      <Handle type="target" position={Position.Left} id="in" className="in-handle" />
      <div className="scene-header">
        {isStart && (
          <span className="badge-start" title="Start scene">
            <Play size={12} fill="currentColor" />
          </span>
        )}
        {renaming ? (
          <RenameInput sceneId={sceneId} name={scene.name} />
        ) : (
          <span
            className="scene-name"
            title="Double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation()
              setRenaming(sceneId)
            }}
          >
            {scene.name}
          </span>
        )}
        {data.errors > 0 ? (
          <span className="badge badge-error" title={data.problemText}>
            <OctagonAlert size={14} />
          </span>
        ) : data.warnings > 0 ? (
          <span className="badge badge-warn" title={data.problemText}>
            <AlertTriangle size={14} />
          </span>
        ) : null}
      </div>
      <div className="scene-thumb">{asset ? <AssetThumb asset={asset} /> : <div className="scene-thumb-empty" />}</div>
      <div className="scene-line">{info.firstLine || <span className="muted">No dialogue yet</span>}</div>
      <div className="scene-meta">{plural(info.blockCount, 'block')}</div>
      <div className="scene-exits">
        {info.isEnd ? (
          <div className="exit-row end-row">
            <span className="exit-text">■ END</span>
          </div>
        ) : (
          info.exits.map((row) => <ExitRow key={row.handleId} row={row} />)
        )}
      </div>
    </div>
  )
}

export const SceneNode = memo(SceneNodeView)
