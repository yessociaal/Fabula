import { useEffect, useMemo, useRef, useState } from 'react'
import { MoreHorizontal, Pause, Play, Upload } from 'lucide-react'
import { ALLOWED_EXTENSIONS, isImageKind } from '@shared/assetTypes'
import type { Asset, AssetKind, Id } from '@shared/model'
import { countUsage, findUsage } from '@shared/usage'
import { api } from '../../api'
import { importFiles, replaceAssetFile } from '../../assetImport'
import { readAudioDuration, useAudioPreview } from '../../audioPreview'
import { AssetThumb } from '../../components/AssetThumb'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { DropZone, useFileInput } from '../../components/DropZone'
import { IconButton } from '../../components/IconButton'
import { InUseModal } from '../../components/InUseModal'
import { Modal } from '../../components/Modal'
import { Tabs } from '../../components/Tabs'
import { goToScene } from '../../navigation'
import { useProjectStore } from '../../store/projectStore'
import { formatBytes, formatDuration, plural } from '../../util'

type TabId = AssetKind
const TABS: { id: TabId; label: string }[] = [
  { id: 'background', label: 'Backgrounds' },
  { id: 'sprite', label: 'Sprites' },
  { id: 'music', label: 'Music' },
  { id: 'sound', label: 'Sounds' },
  { id: 'ambient', label: 'Ambient' },
  { id: 'voice', label: 'Voice' },
  { id: 'movie', label: 'Movies' },
  { id: 'ui', label: 'UI' },
  { id: 'font', label: 'Fonts' }
]

const AUDIO_TABS: ReadonlySet<AssetKind> = new Set(['music', 'sound', 'ambient', 'voice'])

interface ItemActions {
  onReplace: (file: File) => void
  onDelete: () => void
  onRenameStart: () => void
}

function ItemMenu({ asset, actions }: { asset: Asset; actions: ItemActions }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const { input, open: browse } = useFileInput(ALLOWED_EXTENSIONS[asset.kind].join(','), (files) =>
    actions.onReplace(files[0])
  )

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="menu-wrap" ref={wrap}>
      <IconButton label={`Menu for ${asset.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} />
      </IconButton>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              actions.onRenameStart()
            }}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              browse()
            }}
          >
            Replace file…
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => {
              setOpen(false)
              actions.onDelete()
            }}
          >
            Delete
          </button>
        </div>
      )}
      {input}
    </div>
  )
}

/** The asset's name; double-click (or the menu's Rename) turns it into an input. */
function NameCell({ asset, editing, setEditing }: { asset: Asset; editing: boolean; setEditing: (v: boolean) => void }) {
  const rename = useProjectStore((s) => s.renameAsset)
  if (!editing) {
    return (
      <span className="list-item-name" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>
        {asset.name}
      </span>
    )
  }
  return (
    <span className="list-item-name" onBlur={() => setEditing(false)}>
      <AutoFocusName
        value={asset.name}
        onCommit={(name) => {
          rename(asset.id, name)
          setEditing(false)
        }}
      />
    </span>
  )
}

function AutoFocusName({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.querySelector('input')?.select(), [])
  return (
    <div ref={ref}>
      <CommitField aria-label="Asset name" value={value} required onCommit={onCommit} />
    </div>
  )
}

function ImageCard({ asset, used, actions }: { asset: Asset; used: number; actions: ItemActions }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="tile">
      <AssetThumb asset={asset} checker={asset.kind === 'sprite'} />
      <div className="tile-tools">
        <NameCell asset={asset} editing={editing} setEditing={setEditing} />
        <ItemMenu asset={asset} actions={{ ...actions, onRenameStart: () => setEditing(true) }} />
      </div>
      <span className="tile-meta">
        {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
        used in {plural(used, 'place')}
      </span>
    </div>
  )
}

function AudioRow({ asset, dir, used, actions }: { asset: Asset; dir: string; used: number; actions: ItemActions }) {
  const [editing, setEditing] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  const url = api.assetUrl(dir, asset.file)
  const playing = useAudioPreview((s) => s.playingUrl === url)
  const toggle = useAudioPreview((s) => s.toggle)

  useEffect(() => {
    let live = true
    void readAudioDuration(url).then((d) => live && setDuration(d))
    return () => {
      live = false
    }
  }, [url])

  return (
    <div className="audio-row">
      <IconButton
        label={playing ? `Pause ${asset.name}` : `Play ${asset.name}`}
        onClick={() => toggle(url)}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </IconButton>
      <NameCell asset={asset} editing={editing} setEditing={setEditing} />
      <span className="tile-meta" title="Length">
        {formatDuration(duration)}
      </span>
      <span className="tile-meta">used in {plural(used, 'place')}</span>
      <ItemMenu asset={asset} actions={{ ...actions, onRenameStart: () => setEditing(true) }} />
    </div>
  )
}

/** Movies and fonts: a name, a size and where it is used. Nothing to play here. */
function FileRow({ asset, used, actions }: { asset: Asset; used: number; actions: ItemActions }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="audio-row file-row">
      <NameCell asset={asset} editing={editing} setEditing={setEditing} />
      {asset.kind === 'movie' && (
        <span className="tile-meta" title="File size">
          {formatBytes(asset.bytes)}
        </span>
      )}
      <span className="tile-meta">used in {plural(used, 'place')}</span>
      <ItemMenu asset={asset} actions={{ ...actions, onRenameStart: () => setEditing(true) }} />
    </div>
  )
}

export default function Assets() {
  const project = useProjectStore((s) => s.project)
  const dir = useProjectStore((s) => s.dir)
  const [tab, setTab] = useState<TabId>('background')
  const [filter, setFilter] = useState('')
  const [deleting, setDeleting] = useState<Id | null>(null)
  const stopPreview = useAudioPreview((s) => s.stop)
  const usage = useMemo(() => (project ? findUsage(project) : null), [project])

  const accept = ALLOWED_EXTENSIONS[tab].join(',')
  const { input, open } = useFileInput(accept, (files) => void importFiles(files, tab))

  useEffect(() => stopPreview, [stopPreview])

  if (!project || !dir || !usage) return null

  const needle = filter.trim().toLowerCase()
  const items = Object.values(project.assets).filter(
    (a) => a.kind === tab && (!needle || a.name.toLowerCase().includes(needle))
  )
  const target = deleting ? project.assets[deleting] : null
  const doDelete = (id: Id): void => {
    useProjectStore.getState().deleteAsset(id)
    setDeleting(null)
  }
  const actionsFor = (a: Asset): ItemActions => ({
    onReplace: (file) => void replaceAssetFile(a.id, file),
    onDelete: () => setDeleting(a.id),
    onRenameStart: () => undefined
  })

  return (
    <DropZone accept={accept} onFiles={(files) => void importFiles(files, tab)} className="assets-view">
      <div className="assets-head">
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={(t) => {
            stopPreview()
            setTab(t)
          }}
        />
        <div className="assets-toolbar">
          <input
            className="input"
            placeholder="Filter by name"
            aria-label="Filter assets by name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Button icon={<Upload size={16} />} onClick={open}>
            Upload…
          </Button>
          {input}
        </div>
      </div>
      <div className="assets-body">
        {items.length === 0 && (
          <p className="hint">
            {needle
              ? 'Nothing matches that filter.'
              : `Drop ${ALLOWED_EXTENSIONS[tab].join(' ')} files here, or use Upload.`}
          </p>
        )}
        {isImageKind(tab) ? (
          <div className="tile-grid">
            {items.map((a) => (
              <ImageCard key={a.id} asset={a} used={countUsage(usage.assets[a.id])} actions={actionsFor(a)} />
            ))}
          </div>
        ) : (
          <div className="audio-list">
            {items.map((a) =>
              AUDIO_TABS.has(a.kind) ? (
                <AudioRow key={a.id} asset={a} dir={dir} used={countUsage(usage.assets[a.id])} actions={actionsFor(a)} />
              ) : (
                <FileRow key={a.id} asset={a} used={countUsage(usage.assets[a.id])} actions={actionsFor(a)} />
              )
            )}
          </div>
        )}
      </div>

      {target &&
        (usage.assets[target.id]?.length ? (
          <InUseModal
            title={`Delete ${target.name}?`}
            message={`${target.name} is used in ${plural(usage.assets[target.id].length, 'place')}. Deleting removes it from all of them.`}
            refs={usage.assets[target.id]}
            confirmLabel="Remove from all scenes and delete"
            onOpenScene={(id) => {
              setDeleting(null)
              goToScene(id)
            }}
            onConfirm={() => doDelete(target.id)}
            onCancel={() => setDeleting(null)}
          />
        ) : (
          <Modal
            title={`Delete ${target.name}?`}
            onClose={() => setDeleting(null)}
            footer={
              <>
                <Button onClick={() => setDeleting(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => doDelete(target.id)}>
                  Delete
                </Button>
              </>
            }
          >
            <p className="modal-message">This file is not used anywhere.</p>
          </Modal>
        ))}
    </DropZone>
  )
}
