import { useState } from 'react'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { joinPath, parentDir, safeFolderName } from '../../pathUtil'
import { createRenpyGame } from '../../renpyFlows'
import { useProjectStore } from '../../store/projectStore'

interface Props {
  onClose: () => void
  /** Runs after the game was created and linked. */
  onCreated?: () => void
}

/** "Create Ren'Py game": choose where, then make a new game that uses the story's screen size and accent colour. */
export function CreateGameModal({ onClose, onCreated }: Props) {
  const dir = useProjectStore((s) => s.dir)
  const meta = useProjectStore((s) => s.project?.meta)
  const [location, setLocation] = useState(() => (dir ? parentDir(dir) : ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!meta) return null
  const target = location ? joinPath(location, `${safeFolderName(meta.title)} (Ren'Py game)`) : ''

  const choose = async () => {
    const picked = await api.pickFolder("Choose where to create the Ren'Py game")
    if (picked) setLocation(picked)
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    const result = await createRenpyGame(target, meta)
    if (!result.ok) {
      setError(result.error ?? "Ren'Py could not create the game.")
      setBusy(false)
      return
    }
    onClose()
    onCreated?.()
  }

  return (
    <Modal
      title="Create Ren'Py game"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={busy || !location} title={location ? "Create the game with Ren'Py" : 'Choose a folder first'}>
            {busy ? 'Creating…' : 'Create'}
          </Button>
        </>
      }
    >
      <p className="modal-text">
        Your story is exported into a normal Ren'Py game. The game uses the screen size {meta.width} × {meta.height} and your accent colour.
      </p>
      <div className="field">
        <span className="field-label">Location</span>
        <div className="location-row">
          <span className="location-path" title={location || 'No folder chosen'}>
            {location || 'No folder chosen'}
          </span>
          <Button onClick={choose} disabled={busy}>
            Choose…
          </Button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">The game will be created in</span>
        <span className="location-path" title={target}>
          {target || '—'}
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
