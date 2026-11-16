import { Pause, Play, Upload } from 'lucide-react'
import type { AssetKind, Id } from '@shared/model'
import { ALLOWED_EXTENSIONS, isImageKind } from '@shared/assetTypes'
import { api } from '../api'
import { importFiles } from '../assetImport'
import { useAudioPreview } from '../audioPreview'
import { useProjectStore } from '../store/projectStore'
import { AssetThumb } from './AssetThumb'
import { useFileInput } from './DropZone'

const PLAYABLE_KINDS: ReadonlySet<AssetKind> = new Set(['music', 'sound', 'ambient', 'voice'])

interface AssetPickerProps {
  kind: AssetKind
  value: Id | null
  onChange: (assetId: Id | null) => void
  /** Label of the "no asset" choice, e.g. "None (black)". */
  noneLabel?: string
}

/** Pick an uploaded asset of one kind: a thumbnail grid for images, a list with preview buttons for audio. */
export function AssetPicker({ kind, value, onChange, noneLabel = 'None' }: AssetPickerProps) {
  const dir = useProjectStore((s) => s.dir)
  const assets = useProjectStore((s) => s.project?.assets)
  const list = Object.values(assets ?? {}).filter((a) => a.kind === kind)
  const playing = useAudioPreview((s) => s.playingUrl)
  const toggle = useAudioPreview((s) => s.toggle)

  const upload = async (files: File[]): Promise<void> => {
    const added = await importFiles(files, kind)
    if (added.length) onChange(added[0].id)
  }
  const { input, open } = useFileInput(ALLOWED_EXTENSIONS[kind].join(','), (f) => void upload(f))

  if (isImageKind(kind)) {
    return (
      <div className="picker picker-grid" role="listbox" aria-label={`Choose ${kind}`}>
        <button
          type="button"
          role="option"
          aria-selected={value === null}
          className={`picker-tile ${value === null ? 'selected' : ''}`}
          onClick={() => onChange(null)}
        >
          <div className="thumb thumb-missing">{noneLabel}</div>
        </button>
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            role="option"
            aria-selected={value === a.id}
            title={a.name}
            className={`picker-tile ${value === a.id ? 'selected' : ''}`}
            onClick={() => onChange(a.id)}
          >
            <AssetThumb asset={a} checker={kind === 'sprite'} />
            <span className="picker-name">{a.name}</span>
          </button>
        ))}
        <button type="button" className="picker-tile picker-upload" onClick={open} title="Upload files">
          <Upload size={18} />
          <span>Upload…</span>
        </button>
        {input}
      </div>
    )
  }

  return (
    <div className="picker picker-list" role="listbox" aria-label={`Choose ${kind}`}>
      <button
        type="button"
        role="option"
        aria-selected={value === null}
        className={`picker-row ${value === null ? 'selected' : ''}`}
        onClick={() => onChange(null)}
      >
        <span className="picker-name">{noneLabel}</span>
      </button>
      {list.map((a) => {
        const url = dir ? api.assetUrl(dir, a.file) : ''
        const isPlaying = playing === url
        return (
          <div key={a.id} className={`picker-row ${value === a.id ? 'selected' : ''}`}>
            {PLAYABLE_KINDS.has(kind) && (
            <button
              type="button"
              className="icon-btn"
              title={isPlaying ? 'Pause preview' : 'Play preview'}
              aria-label={isPlaying ? `Pause ${a.name}` : `Play ${a.name}`}
              onClick={() => toggle(url)}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            )}
            <button
              type="button"
              role="option"
              aria-selected={value === a.id}
              className="picker-row-main"
              onClick={() => onChange(a.id)}
            >
              {a.name}
            </button>
          </div>
        )
      })}
      <button type="button" className="picker-row picker-upload-row" onClick={open} title="Upload files">
        <Upload size={16} /> Upload…
      </button>
      {input}
    </div>
  )
}
