import { useMemo, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import { ALLOWED_EXTENSIONS } from '@shared/assetTypes'
import { findUsage } from '@shared/usage'
import type { Id } from '@shared/model'
import { importFiles } from '../../assetImport'
import { useFileInput } from '../../components/DropZone'
import { AssetThumb } from '../../components/AssetThumb'
import { Button } from '../../components/Button'
import { ColorField } from '../../components/ColorField'
import { CommitField } from '../../components/CommitField'
import { DropZone } from '../../components/DropZone'
import { Select } from '../../components/Select'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { InUseModal } from '../../components/InUseModal'
import { Modal } from '../../components/Modal'
import { goToScene } from '../../navigation'
import { useProjectStore } from '../../store/projectStore'

export default function Characters() {
  const project = useProjectStore((s) => s.project)
  const store = useProjectStore.getState
  const [selected, setSelected] = useState<Id | null>(null)
  const [deleting, setDeleting] = useState<Id | null>(null)

  const usage = useMemo(() => (project ? findUsage(project) : null), [project])
  if (!project || !usage) return null

  const current =
    (selected && project.characters[selected]) || project.characters[project.characterOrder[0]] || null
  const deleteTarget = deleting ? project.characters[deleting] : null

  const addSprites = async (files: File[]): Promise<void> => {
    if (!current) return
    const assets = await importFiles(files, 'sprite')
    for (const a of assets) store().addExpression(current.id, a.name, a.id)
  }

  const requestDelete = (id: Id): void => setDeleting(id)
  const addSide = async (files: File[]): Promise<void> => {
    if (!current) return
    const assets = await importFiles(files.slice(0, 1), 'sprite')
    if (assets[0]) store().updateCharacter(current.id, { sideAssetId: assets[0].id })
  }
  const doDelete = (id: Id): void => {
    store().deleteCharacter(id)
    setDeleting(null)
    setSelected(null)
  }

  return (
    <div className="split">
      <div className="split-list">
        <Button
          icon={<Plus size={16} />}
          onClick={() => setSelected(store().addCharacter({ name: 'New character' }))}
        >
          Character
        </Button>
        {project.characterOrder.map((id) => {
          const c = project.characters[id]
          if (!c) return null
          return (
            <button
              key={id}
              type="button"
              className={`list-item ${current?.id === id ? 'active' : ''}`}
              onClick={() => setSelected(id)}
            >
              <span className="color-dot" style={{ background: c.color }} />
              <span className="list-item-name">{c.name || 'Unnamed'}</span>
              <span className="list-item-count" title="Expressions">
                {c.expressions.length}
              </span>
            </button>
          )
        })}
      </div>

      {current ? (
        <div className="pane" key={current.id}>
          <div className="pane-row">
            <div className="field">
              <span className="field-label">Name</span>
              <CommitField
                aria-label="Character name"
                value={current.name}
                onCommit={(name) => store().updateCharacter(current.id, { name })}
              />
            </div>
            <ColorField
              label="Colour"
              value={current.color}
              onChange={(color) => store().updateCharacter(current.id, { color })}
            />
            <div className="topbar-spacer" />
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => requestDelete(current.id)}>
              Delete character
            </Button>
          </div>

          <div className="pane-row">
            <Select<'adv' | 'nvl'>
              label="Dialogue style"
              value={current.mode}
              options={[
                { value: 'adv', label: 'Text box at the bottom (ADV)' },
                { value: 'nvl', label: 'Full-page text (NVL)' }
              ]}
              onChange={(mode) => store().updateCharacter(current.id, { mode })}
            />
          </div>
          <SideImage
            characterId={current.id}
            assetId={current.sideAssetId}
            onUpload={(files) => void addSide(files)}
          />

          <h2 className="pane-heading">Expressions</h2>
          <div className="tile-grid">
              {current.expressions.map((ex) => (
                <div key={ex.id} className="tile">
                  <AssetThumb asset={ex.assetId ? project.assets[ex.assetId] : null} missingLabel={ex.name} checker />
                  <div className="tile-tools">
                    <CommitField
                      aria-label="Expression name"
                      value={ex.name}
                      required
                      onCommit={(name) => store().updateExpression(current.id, ex.id, { name })}
                    />
                    <IconButton label="Delete expression" onClick={() => store().deleteExpression(current.id, ex.id)}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              ))}
              <DropZone
                clickToBrowse
                className="tile drop-tile"
                label="Drop sprites here or click to upload"
                accept={ALLOWED_EXTENSIONS.sprite.join(',')}
                onFiles={(f) => void addSprites(f)}
              >
                <span>Drop sprites here or click to upload</span>
              </DropZone>
          </div>
        </div>
      ) : (
        <div className="pane">
          <EmptyState icon={<Users size={20} />} title="Characters">
            Add a character, then drop their sprites onto it.
          </EmptyState>
        </div>
      )}

      {deleteTarget &&
        (usage.characters[deleteTarget.id]?.length ? (
          <InUseModal
            title={`Delete ${deleteTarget.name || 'this character'}?`}
            message={`${deleteTarget.name || 'This character'} is used in these scenes. Deleting removes them from every one.`}
            refs={usage.characters[deleteTarget.id]}
            confirmLabel="Remove from all scenes and delete"
            onOpenScene={(id) => {
              setDeleting(null)
              goToScene(id)
            }}
            onConfirm={() => doDelete(deleteTarget.id)}
            onCancel={() => setDeleting(null)}
          />
        ) : (
          <Modal
            title={`Delete ${deleteTarget.name || 'this character'}?`}
            onClose={() => setDeleting(null)}
            footer={
              <>
                <Button onClick={() => setDeleting(null)}>Cancel</Button>
                <Button variant="danger" onClick={() => doDelete(deleteTarget.id)}>
                  Delete
                </Button>
              </>
            }
          >
            <p className="modal-message">This character is not used in any scene.</p>
          </Modal>
        ))}
    </div>
  )
}

/** The small picture shown beside the text box while this character speaks (Ren'Py "side image"). */
function SideImage({ characterId, assetId, onUpload }: { characterId: Id; assetId: Id | null; onUpload: (files: File[]) => void }) {
  const project = useProjectStore((s) => s.project)
  const store = useProjectStore.getState
  const { input, open } = useFileInput(ALLOWED_EXTENSIONS.sprite.join(','), onUpload)
  const asset = assetId ? project?.assets[assetId] : null
  return (
    <div className="side-image">
      <span className="field-label">Side image</span>
      <div className="pane-row">
        <div className="tile side-tile">
          <AssetThumb asset={asset} missingLabel="No side image" checker />
        </div>
        <Button onClick={open} title="Upload the small picture that shows beside the text box while this character speaks">
          {asset ? 'Replace…' : 'Upload…'}
        </Button>
        {asset && <Button onClick={() => store().updateCharacter(characterId, { sideAssetId: null })}>Remove</Button>}
        {input}
      </div>
    </div>
  )
}
