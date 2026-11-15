import type { Id } from '@shared/model'
import { scenesUsing, outsideScenes, type UsageRef } from '@shared/usage'
import { Button } from './Button'
import { Modal } from './Modal'

interface InUseModalProps {
  title: string
  /** e.g. `"Anna" is used in 3 places.` */
  message: string
  refs: UsageRef[]
  confirmLabel: string
  onOpenScene: (sceneId: Id) => void
  onConfirm: () => void
  onCancel: () => void
}

/** Lists the scenes (each a link) and other places that use something, with Cancel and a confirm button. */
export function InUseModal({ title, message, refs, confirmLabel, onOpenScene, onConfirm, onCancel }: InUseModalProps) {
  const scenes = scenesUsing(refs)
  const others = outsideScenes(refs)
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="modal-message">{message}</p>
      {scenes.length > 0 && (
        <ul className="usage-list" aria-label="Scenes">
          {scenes.map((s) => (
            <li key={s.id}>
              <button type="button" className="link-btn" onClick={() => onOpenScene(s.id)} title="Go to this scene">
                {s.name || 'Untitled scene'}
              </button>
              <span className="usage-detail">
                {refs
                  .filter((r) => r.sceneId === s.id)
                  .map((r) => r.description)
                  .join(' · ')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="usage-list" aria-label="Other places">
          {others.map((r, i) => (
            <li key={i}>
              <span className="usage-detail">{r.description}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
