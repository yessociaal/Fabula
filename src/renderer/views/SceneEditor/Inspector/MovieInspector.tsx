import type { ExtraBlock } from '@shared/model'
import { AssetPicker } from '../../../components/AssetPicker'
import { useBlockPatch, type InspectorProps } from './types'

type Movie = Extract<ExtraBlock, { type: 'movie' }>

export function MovieInspector({ sceneId, block }: InspectorProps<Movie>) {
  const patch = useBlockPatch<Movie>(sceneId, block.id)
  return (
    <>
      <div className="field">
        <span className="field-label">Movie file</span>
        <AssetPicker kind="movie" value={block.assetId} onChange={(assetId) => patch({ assetId })} noneLabel="No movie" />
      </div>
      <p className="muted-note">The movie plays full screen in Ren'Py, then the story goes on. Quick play only shows a placeholder.</p>
    </>
  )
}
