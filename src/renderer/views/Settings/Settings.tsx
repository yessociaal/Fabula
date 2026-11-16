import { useCallback, useEffect, useState } from 'react'
import { Check, FolderOpen } from 'lucide-react'
import type { Settings as AppSettings } from '@shared/ipc'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { CommitField } from '../../components/CommitField'
import { toast } from '../../components/Toast'
import { useProjectStore } from '../../store/projectStore'
import { CreateGameModal } from './CreateGameModal'

/** Settings view: story title, screen size, the linked Ren'Py game and the Ren'Py SDK. */
export default function Settings() {
  const project = useProjectStore((s) => s.project)
  const updateMeta = useProjectStore((s) => s.updateMeta)
  const setRenpyProjectDir = useProjectStore((s) => s.setRenpyProjectDir)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [sdkMessage, setSdkMessage] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    setSettings(await api.getSettings())
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!project) return null
  const linked = project.renpyProjectDir

  const changeGameFolder = async () => {
    const dir = await api.pickFolder("Choose the Ren'Py game folder (the one that contains game/)")
    if (dir) {
      setRenpyProjectDir(dir)
      toast("Ren'Py game folder changed. The next export writes into it.", 'ok')
    }
  }

  const changeSdk = async () => {
    const dir = await api.pickFolder("Choose the Ren'Py SDK folder")
    if (!dir) return
    const result = await api.setSdkDir(dir)
    if (result.ok) {
      setSdkMessage(null)
      toast(`Ren'Py ${result.version ?? ''} found.`, 'ok')
    } else {
      setSdkMessage(result.error ?? "That folder doesn't look like a Ren'Py SDK.")
    }
    await refresh()
  }

  return (
    <div className="settings-view">
      <h1 className="settings-title">Settings</h1>

      <section className="settings-section">
        <h2 className="settings-heading">Story</h2>
        <div className="field">
          <span className="field-label">Story title</span>
          <CommitField
            aria-label="Story title"
            className="settings-input"
            value={project.meta.title}
            required
            onCommit={(title) => updateMeta({ title })}
          />
        </div>
        <div className="field">
          <span className="field-label">Screen size</span>
          <span className="settings-value">
            {project.meta.width} × {project.meta.height}
          </span>
          <p className="settings-note">
            {linked
              ? "The screen size is fixed once the Ren'Py game exists, because Ren'Py draws all of its interface for that size when the game is created. To use another size, create a new Ren'Py game."
              : "Chosen when the story was created. It is used when the Ren'Py game is created."}
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Ren'Py game folder</h2>
        <span className="location-path" title={linked ?? 'No Ren\'Py game yet'}>
          {linked ?? "No Ren'Py game yet"}
        </span>
        <div className="settings-actions">
          <Button onClick={changeGameFolder} title="Use a different existing Ren'Py game folder">
            Change…
          </Button>
          <Button onClick={() => setCreating(true)} title={`Create a new ${project.meta.width} × ${project.meta.height} Ren'Py game`}>
            Create new…
          </Button>
          <Button
            icon={<FolderOpen size={16} />}
            disabled={!linked}
            title={linked ? 'Show the game folder in Explorer' : "Create a Ren'Py game first"}
            onClick={() => linked && void api.revealInExplorer(linked)}
          >
            Open folder
          </Button>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-heading">Ren'Py SDK folder</h2>
        <span className="location-path" title={settings?.sdkDir ?? 'not set'}>
          {settings?.sdkDir ?? 'Not set'}
        </span>
        <div className="settings-actions">
          {settings?.sdkDir && (
            <span className="sdk-ok" title="The SDK was found">
              <Check size={16} /> Ren'Py {settings.sdkVersion ?? ''}
            </span>
          )}
          <Button onClick={changeSdk} title="Choose a different Ren'Py SDK folder">
            Change…
          </Button>
        </div>
        {sdkMessage && <p className="form-error">{sdkMessage}</p>}
      </section>

      {creating && <CreateGameModal onClose={() => setCreating(false)} onCreated={() => toast("Ren'Py game created.", 'ok')} />}
    </div>
  )
}
