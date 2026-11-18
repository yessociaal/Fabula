import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { SHORTCUT_GROUPS } from '../../shortcuts'

/** The "?" cheat sheet: every keyboard shortcut of the editor. */
export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <h3 className="shortcut-title">{g.title}</h3>
            <dl className="shortcut-list">
              {g.items.map((i) => (
                <div key={i.keys + i.does} className="shortcut-row">
                  <dt>
                    <kbd>{i.keys}</kbd>
                  </dt>
                  <dd>{i.does}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  )
}
