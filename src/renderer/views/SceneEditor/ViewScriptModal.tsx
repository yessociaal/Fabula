import { useMemo, useRef } from 'react'
import { useKitStore } from '../../store/kitStore'
import { Copy } from 'lucide-react'
import { compileProject } from '@shared/compiler'
import { sceneScriptFrom } from '@shared/compiler/sceneScript'
import type { Scene } from '@shared/model'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { toast } from '../../components/Toast'
import { useProjectStore } from '../../store/projectStore'

/** Read-only view of exactly what a scene compiles to, with a Copy button. */
export function ViewScriptModal({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const project = useProjectStore((s) => s.project)
  const kits = useKitStore((s) => s.kits)
  const pre = useRef<HTMLPreElement>(null)
  const script = useMemo(() => (project ? sceneScriptFrom(compileProject(project, { kits }), scene.id) : null), [project, scene.id, kits])

  const selectAll = (): void => {
    const el = pre.current
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }

  const copy = async (): Promise<void> => {
    if (!script) return
    try {
      await navigator.clipboard.writeText(script.text)
      toast('Copied to the clipboard.', 'ok')
    } catch {
      selectAll()
      toast('The clipboard is not available, so the text is selected. Press Ctrl+C to copy it.')
    }
  }

  return (
    <Modal
      title={`Script of "${scene.name}"`}
      onClose={onClose}
      footer={
        <>
          <Button icon={<Copy size={16} />} disabled={!script} onClick={() => void copy()}>
            Copy
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {script ? (
        <>
          <p className="modal-text">
            This is exactly what this scene is exported as, in <code>{script.file}</code> from line {script.line}. It is read-only.
          </p>
          <pre ref={pre} className="report-text view-script" aria-label="Compiled script of this scene" tabIndex={0}>
            {script.text}
          </pre>
        </>
      ) : (
        <p className="modal-text">This scene is not part of the exported game yet.</p>
      )}
    </Modal>
  )
}
