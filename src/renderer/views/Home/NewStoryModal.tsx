import { useEffect, useState } from 'react'
import { cleanErrorMessage } from '@shared/ipc'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { ColorField } from '../../components/ColorField'
import { Modal } from '../../components/Modal'
import { Select } from '../../components/Select'
import { toast } from '../../components/Toast'
import { TextField } from '../../components/TextField'
import { openProject } from '../../openProject'
import { defaultGameDir } from '../../pathUtil'

type Size = '1920x1080' | '1280x720'

export function NewStoryModal({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('My First Novel')
  const [location, setLocation] = useState('')
  const [size, setSize] = useState<Size>('1920x1080')
  const [accent, setAccent] = useState('#7c9cff')
  const [busy, setBusy] = useState(false)
  const [sdkSet, setSdkSet] = useState(false)
  const [makeGame, setMakeGame] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.getSettings().then((s) => setSdkSet(s.sdkDir !== null))
  }, [])

  const withGame = makeGame && sdkSet

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
      let project = { ...created.project, meta: { ...created.project.meta, width, height, accentColor: accent } }
      let gameError: string | null = null
      if (withGame) {
        const target = defaultGameDir(created.dir, project.meta.title)
        const made = await api.renpyCreateProject(target, { width, height, accent })
        if (made.ok) project = { ...project, renpyProjectDir: target }
        else gameError = made.error ?? "Ren'Py could not create the game."
      }
      await api.saveProject(created.dir, project)
      openProject(created.dir, project)
      if (gameError) toast(`The story was created, but the Ren'Py game was not: ${gameError} You can create it later in Settings.`, 'error')
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
            {busy ? 'Creating…' : 'Create'}
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
      <label
        className={`check-row ${sdkSet ? '' : 'disabled'}`}
        title={sdkSet ? "Create a Ren'Py game next to the story folder" : "Set the Ren'Py SDK folder on the home screen first"}
      >
        <input type="checkbox" disabled={!sdkSet} checked={withGame} onChange={(e) => setMakeGame(e.target.checked)} />
        Also create the Ren'Py game now
      </label>
      {!sdkSet && <p className="settings-note">Set the Ren'Py SDK folder on the home screen to create the game together with the story.</p>}
      {error && <p className="form-error">{error}</p>}
    </Modal>
  )
}
