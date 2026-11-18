import { useEffect, useState } from 'react'
import { api } from './api'
import { Button } from './components/Button'
import { Modal } from './components/Modal'
import { ToastHost } from './components/Toast'
import { saveBeforeQuit, startAutosave } from './store/autosave'
import { useProjectStore } from './store/projectStore'
import Home from './views/Home/Home'
import Playtest from './views/Playtest/Playtest'
import Shell from './views/Shell/Shell'

export default function App() {
  const open = useProjectStore((s) => s.project !== null)

  const title = useProjectStore((s) => s.project?.meta.title)

  useEffect(() => {
    startAutosave()
  }, [])

  // Closing the window: save first. If the save fails, ask whether to close without saving.
  const [saveFailed, setSaveFailed] = useState(false)
  useEffect(() => {
    return api.onCloseRequested(() => {
      void saveBeforeQuit().then((ok) => {
        if (ok) void api.confirmClose()
        else setSaveFailed(true)
      })
    })
  }, [])

  // The window title is the story title (the app name only shows while no story is open).
  useEffect(() => {
    document.title = title ? `${title} - Fabula` : 'Fabula'
  }, [title])

  return (
    <>
      {open ? <Shell /> : <Home />}
      {open && <Playtest />}
      <ToastHost />
      {saveFailed && (
        <Modal
          title="The story could not be saved"
          onClose={() => {
            setSaveFailed(false)
            void api.cancelClose()
          }}
          footer={
            <>
              <Button
                variant="danger"
                onClick={() => {
                  setSaveFailed(false)
                  void api.confirmClose()
                }}
              >
                Close without saving
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setSaveFailed(false)
                  void api.cancelClose()
                }}
              >
                Keep working
              </Button>
            </>
          }
        >
          <p className="modal-text">The latest changes are not on disk. Close anyway and lose them, or keep working and try again?</p>
        </Modal>
      )}
    </>
  )
}
