import { useState } from 'react'
import { cleanErrorMessage } from '@shared/ipc'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { ColorField } from '../../components/ColorField'
import { Modal } from '../../components/Modal'
import { Select } from '../../components/Select'
import { TextField } from '../../components/TextField'
import { openProject } from '../../openProject'

type Size = '1920x1080' | '1280x720'

export function NewStoryModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('My First Novel')
  const [location, setLocation] = useState('')
  const [size, setSize] = useState<Size>('1920x1080')
  const [accent, setAccent] = useState('#7c9cff')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const chooseLocation = async () => {
    const dir = await api.pickFolder('Choose where to keep the story')
    if (dir) setLocation(dir)
  }

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await api.createEditorProject(location, title.trim())
      const [width, height] = size.split('x').map(Number)
      const project = { ...created.project, meta: { ...created.project.meta, width, height, accentColor: accent } }
      await api.saveProject(created.dir, project)
      openProject(created.dir, project)
    } catch (e) {
      setError(cleanErrorMessage(e))
      setBusy(false)
    }
  }

  const canCreate = title.trim().length > 0 && location.length > 0 && !busy

  return (
    <Modal
      title="New story"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canCreate} onClick={create} title={canCreate ? 'Create the story' : 'Enter a title and choose a location first'}>
            Create
          </Button>
        </>
      }
    >
      <TextField label="Title" value={title} onChange={setTitle} placeholder="Story title" />
      <div className="field">
        <span className="field-label">Location</span>
        <div className="location-row">
          <span className="location-path" title={location || 'No folder chosen'}>
            {location || 'No folder chosen'}
          </span>
          <Button onClick={chooseLocation}>Choose…</Button>
        </div>
      </div>
      <Select<Size>
        label="Screen size"
        value={size}
        onChange={setSize}
        options={[
          { value: '1920x1080', label: '1920 × 1080' },
          { value: '1280x720', label: '1280 × 720' }
        ]}
      />
      <ColorField label="Accent colour" value={accent} onChange={setAccent} />
      <label className="check-row disabled" title="Available in a later step">
        <input type="checkbox" disabled checked={false} readOnly />
        Also create the Ren'Py game now
      </label>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
