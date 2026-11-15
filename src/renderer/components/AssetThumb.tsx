import { useState } from 'react'
import type { Asset } from '@shared/model'
import { api } from '../api'
import { useProjectStore } from '../store/projectStore'

interface AssetThumbProps {
  asset: Asset | null | undefined
  /** Shown in the dashed box when there is no art. Never replaced by invented artwork. */
  missingLabel?: string
  checker?: boolean
  className?: string
}

/** An uploaded image, or a dashed outlined box carrying a name when the art is missing or cannot be loaded. */
export function AssetThumb({ asset, missingLabel, checker, className }: AssetThumbProps) {
  const dir = useProjectStore((s) => s.dir)
  const [failed, setFailed] = useState<string | null>(null)

  if (!asset || !dir || failed === asset.file) {
    return <div className={`thumb thumb-missing ${className ?? ''}`}>{asset?.name ?? missingLabel ?? 'No image'}</div>
  }
  return (
    <div className={`thumb ${checker ? 'checker' : ''} ${className ?? ''}`}>
      <img src={api.assetUrl(dir, asset.file)} alt={asset.name} draggable={false} onError={() => setFailed(asset.file)} />
    </div>
  )
}
