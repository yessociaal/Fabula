import { useEffect } from 'react'
import { Copy } from 'lucide-react'
import { parseLintReport } from '@shared/lintReport'
import { api } from '../../api'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { useUiStore } from '../../store/uiStore'
import { CreateGameModal } from '../Settings/CreateGameModal'

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast('Copied to the clipboard.', 'ok')
  } catch {
    toast('Could not copy to the clipboard.', 'error')
  }
}

/** The modals the Ren'Py flows open: create game, Ren'Py error, lint report. Also shows crashes that happen after start-up. */
export function RenpyDialogs() {
  const createGame = useUiStore((s) => s.createGame)
  const closeCreateGame = useUiStore((s) => s.closeCreateGame)
  const renpyError = useUiStore((s) => s.renpyError)
  const setRenpyError = useUiStore((s) => s.setRenpyError)
  const lintReport = useUiStore((s) => s.lintReport)
  const setLintReport = useUiStore((s) => s.setLintReport)

  useEffect(() => api.onRenpyError((error) => useUiStore.getState().setRenpyError(error)), [])

  const summary = lintReport ? parseLintReport(lintReport.report) : null

  return (
    <>
      {createGame && <CreateGameModal onClose={closeCreateGame} onCreated={createGame.after ?? undefined} />}
      {renpyError !== null && (
        <Modal
          title="Ren'Py reported an error"
          onClose={() => setRenpyError(null)}
          footer={
            <>
              <Button icon={<Copy size={16} />} onClick={() => void copyText(renpyError)}>
                Copy
              </Button>
              <Button variant="primary" onClick={() => setRenpyError(null)}>
                Close
              </Button>
            </>
          }
        >
          <pre className="report-text">{renpyError}</pre>
        </Modal>
      )}
      {lintReport && summary && (
        <Modal
          title="Ren'Py lint report"
          onClose={() => setLintReport(null)}
          footer={
            <>
              <Button icon={<Copy size={16} />} onClick={() => void copyText(lintReport.report)}>
                Copy
              </Button>
              <Button variant="primary" onClick={() => setLintReport(null)}>
                Close
              </Button>
            </>
          }
        >
          <p className={lintReport.ok ? 'report-ok' : 'form-error'}>
            {lintReport.ok
              ? "Ren'Py found no problems."
              : summary.problems.length > 0
                ? `Ren'Py found ${summary.problems.length === 1 ? '1 problem' : `${summary.problems.length} problems`}.`
                : "Ren'Py could not check the game."}
          </p>
          <pre className="report-text">{lintReport.report}</pre>
        </Modal>
      )}
    </>
  )
}
