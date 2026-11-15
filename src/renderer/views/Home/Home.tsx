import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Check, FolderOpen, Plus, X } from 'lucide-react'
import { cleanErrorMessage, type RecentEntry, type Settings } from '@shared/ipc'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { openProject } from '../../openProject'
import { relativeTime } from '../../util'
import { NewStoryModal } from './NewStoryModal'

interface OpenFailure {
  message: string
  /** Set when the failed story came from the Recent list, so it can be removed. */
  recentPath?: string
}

export default function Home() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [failure, setFailure] = useState<OpenFailure | null>(null)
  const [sdkMessage, setSdkMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSettings(await api.getSettings())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const open = async (dir: string, fromRecent: boolean) => {
    try {
      const result = await api.openEditorProject(dir)
      openProject(result.dir, result.project)
    } catch (e) {
      setFailure({ message: cleanErrorMessage(e), recentPath: fromRecent ? dir : undefined })
    }
  }

  const openFromDialog = async () => {
    const dir = await api.pickFolder('Open a story folder')
    if (dir) await open(dir, false)
  }

  const removeRecent = async (path: string) => {
    await api.removeRecent(path)
    setFailure(null)
    await refresh()
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

  const recent: RecentEntry[] = settings?.recent ?? []

  return (
    <main className="home">
      <h1 className="home-title">Fabula</h1>

      <div className="home-actions">
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setNewOpen(true)} title="Create a new story">
          New story
        </Button>
        <Button icon={<FolderOpen size={16} />} onClick={openFromDialog} title="Open an existing story folder">
          Open story…
        </Button>
      </div>

      <section>
        <h2 className="home-section-title">Recent</h2>
        {recent.length === 0 ? (
          <p className="home-empty">No stories yet. Create one to get started.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((r) => (
              <li key={r.path}>
                <button type="button" className="recent-item" onClick={() => open(r.path, true)} title={`Open ${r.title}`}>
                  <BookOpen size={18} className="recent-icon" />
                  <span className="recent-title">{r.title}</span>
                  <span className="recent-path" title={r.path}>
                    {r.path}
                  </span>
                  <span className="recent-time">{relativeTime(r.openedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="home-sdk">
        <span>
          Ren'Py SDK:{' '}
          {settings?.sdkDir ? (
            <span className="sdk-path" title={settings.sdkDir}>
              {settings.sdkDir}
            </span>
          ) : (
            'not set'
          )}
        </span>
        {settings?.sdkDir && (
          <span className="sdk-ok" title="The SDK was found">
            <Check size={16} /> {settings.sdkVersion ?? ''}
          </span>
        )}
        <Button onClick={changeSdk} title="Choose a different Ren'Py SDK folder">
          Change…
        </Button>
      </div>
      {sdkMessage && <p className="form-error">{sdkMessage}</p>}

      {newOpen && <NewStoryModal onClose={() => setNewOpen(false)} />}

      {failure && (
        <Modal
          title="Couldn't open that story"
          onClose={() => setFailure(null)}
          footer={
            <>
              {failure.recentPath && (
                <Button onClick={() => removeRecent(failure.recentPath!)} icon={<X size={16} />}>
                  Remove from list
                </Button>
              )}
              <Button variant="primary" onClick={() => setFailure(null)}>
                OK
              </Button>
            </>
          }
        >
          <p className="modal-message">{failure.message}</p>
        </Modal>
      )}
    </main>
  )
}
