import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { LoadedKit } from '@shared/kits/types'
import type { Id } from '@shared/model'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { KitIcon } from '../../components/KitIcon'
import { Modal } from '../../components/Modal'
import { useKitStore } from '../../store/kitStore'
import { useProjectStore } from '../../store/projectStore'
import { useUiStore } from '../../store/uiStore'
import './kits.css'

function KitCard({ kit, enabled, onToggle }: { kit: LoadedKit; enabled: boolean; onToggle: (on: boolean) => void }) {
  const m = kit.manifest
  const failed = m === null
  const name = m?.name ?? kit.id
  return (
    <article className={`kit-card ${failed ? 'kit-failed' : ''}`} data-kit-id={kit.id} aria-label={name}>
      <header className="kit-card-head">
        <KitIcon name={m?.blocks[0]?.icon ?? m?.endings[0]?.icon} size={20} />
        <h3>{name}</h3>
        <span className={`kit-badge kit-${kit.source}`}>{kit.source === 'built-in' ? 'Built in' : 'Your kit'}</span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Use the ${name} kit in this story`}
          className={`switch ${enabled ? 'on' : ''}`}
          disabled={failed && !enabled}
          title={failed ? 'This kit cannot be turned on until its error is fixed' : enabled ? 'Turn this kit off for this story' : 'Turn this kit on for this story'}
          onClick={() => onToggle(!enabled)}
        >
          <span className="switch-knob" />
        </button>
      </header>
      {m?.description && <p className="kit-description">{m.description}</p>}
      {kit.note && <p className="muted-note">{kit.note}</p>}
      {m && (
        <ul className="kit-adds">
          {m.blocks.map((b) => (
            <li key={`b:${b.type}`}>
              <KitIcon name={b.icon} size={14} /> {b.name} <span className="muted">block</span>
            </li>
          ))}
          {m.endings.map((e) => (
            <li key={`e:${e.type}`}>
              <KitIcon name={e.icon} size={14} /> {e.name} <span className="muted">ending</span>
            </li>
          ))}
        </ul>
      )}
      {kit.error && (
        <pre className="kit-error" role="alert">
          {kit.error}
        </pre>
      )}
      {kit.source === 'story' && kit.folder !== '' && (
        <div>
          <Button icon={<FolderOpen size={14} />} onClick={() => void api.revealInExplorer(kit.folder)}>
            Open folder
          </Button>
        </div>
      )}
    </article>
  )
}

/** Every kit available to this story, with a switch to use it or not. */
export default function Kits() {
  const kits = useKitStore((s) => s.kits)
  const loaded = useKitStore((s) => s.loaded)
  const dir = useProjectStore((s) => s.dir)
  const enabledIds = useProjectStore((s) => s.project?.kits ?? [])
  const setKitEnabled = useProjectStore((s) => s.setKitEnabled)
  const [blocked, setBlocked] = useState<{ kit: string; scenes: { id: Id; name: string }[] } | null>(null)

  const toggle = (kit: LoadedKit, on: boolean): void => {
    const result = setKitEnabled(kit.id, on)
    if (!result.ok) setBlocked({ kit: kit.manifest?.name ?? kit.id, scenes: result.scenes })
  }

  const open = (id: Id): void => {
    setBlocked(null)
    useUiStore.getState().openScene(id)
  }

  const kitsFolder = dir ? `${dir}${dir.includes('\\') ? '\\' : '/'}kits` : null

  return (
    <div className="kits-view">
      <header className="kits-head">
        <h2>Kits</h2>
        <p>
          Kits add new blocks and endings to the editor. Turn on the ones this story needs. Your own kits go in the <code>kits</code> folder of your story
          {kitsFolder ? <> (<code>{kitsFolder}</code>)</> : null}.
        </p>
      </header>
      {kits.length === 0 ? (
        <EmptyState icon={<KitIcon size={28} />} title={loaded ? 'No kits found' : 'Looking for kits…'}>
          Put a kit folder (one with a kit.json) in your story's kits folder and it will show up here.
        </EmptyState>
      ) : (
        <div className="kit-grid">
          {kits.map((kit) => (
            <KitCard key={`${kit.source}:${kit.folder}:${kit.id}`} kit={kit} enabled={enabledIds.includes(kit.id)} onToggle={(on) => toggle(kit, on)} />
          ))}
        </div>
      )}
      {blocked && (
        <Modal title={`The ${blocked.kit} kit is in use`} onClose={() => setBlocked(null)} footer={<Button onClick={() => setBlocked(null)}>OK</Button>}>
          <p>These scenes use its blocks or endings. Remove them first, then you can turn the kit off.</p>
          <ul className="kit-scene-list">
            {blocked.scenes.map((s) => (
              <li key={s.id}>
                <button type="button" className="link-button" onClick={() => open(s.id)}>
                  {s.name || 'Untitled scene'}
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  )
}
