import { useMemo, useState } from 'react'
import { useKitStore } from '../../store/kitStore'
import { FileCode, Pencil, Plus, Trash2 } from 'lucide-react'
import { compileProject } from '@shared/compiler'
import type { Id } from '@shared/model'
import { scriptFilePath, usableScriptFiles } from '@shared/scriptFiles'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { IconButton } from '../../components/IconButton'
import { LineNumberEditor } from '../../components/LineNumberEditor'
import { Modal } from '../../components/Modal'
import { useProjectStore } from '../../store/projectStore'
import './scriptFiles.css'

export const SCRIPT_FILES_NOTE =
  'Files here are copied into your game unchanged. Use them for custom screens, Python, styles, or anything Fabula has no button for.'

type Selection = { kind: 'script'; id: Id } | { kind: 'generated'; path: string } | null

/** Type a new name for a script file. A refused name keeps the box open and says why. */
function RenameBox({ id, name, onDone, onError }: { id: Id; name: string; onDone: () => void; onError: (message: string | null) => void }) {
  const [draft, setDraft] = useState(name)
  const commit = (keepOpenOnError: boolean): void => {
    if (draft.trim() === name) {
      onError(null)
      onDone()
      return
    }
    const result = useProjectStore.getState().renameScriptFile(id, draft)
    if (result.ok) {
      onError(null)
      onDone()
    } else {
      onError(result.error)
      if (!keepOpenOnError) onDone()
    }
  }
  return (
    <input
      className="input script-rename"
      value={draft}
      autoFocus
      aria-label="New file name"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(true)
        if (e.key === 'Escape') {
          onError(null)
          onDone()
        }
      }}
    />
  )
}

export default function ScriptFiles() {
  const project = useProjectStore((s) => s.project)
  const kits = useKitStore((s) => s.kits)
  const [selection, setSelection] = useState<Selection>(null)
  const [renaming, setRenaming] = useState<Id | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Id | null>(null)

  const generated = useMemo(() => {
    if (!project) return []
    const mine = new Set(usableScriptFiles(project).map((f) => scriptFilePath(f.name)))
    return compileProject(project, { kits }).files.filter((f) => !mine.has(f.path))
  }, [project, kits])

  if (!project) return null
  const files = project.scriptFiles
  const current =
    selection?.kind === 'script' && files.some((f) => f.id === selection.id)
      ? selection
      : selection?.kind === 'generated'
        ? selection
        : files.length > 0
          ? ({ kind: 'script', id: files[0].id } as const)
          : null
  const selectedFile = current?.kind === 'script' ? files.find((f) => f.id === current.id) : undefined
  const selectedGenerated = current?.kind === 'generated' ? generated.find((g) => g.path === current.path) : undefined
  const deleteTarget = deleting ? files.find((f) => f.id === deleting) : undefined

  const addFile = (): void => {
    const result = useProjectStore.getState().addScriptFile()
    if (result.ok) {
      setError(null)
      setSelection({ kind: 'script', id: result.id })
    } else setError(result.error)
  }

  return (
    <div className="script-files">
      <aside className="script-list" aria-label="Files">
        <div className="script-list-head">
          <h2 className="pane-title">Script files</h2>
          <Button icon={<Plus size={14} />} onClick={addFile} title="Add an empty .rpy file to your game">
            File
          </Button>
        </div>
        {files.length === 0 && <p className="muted-note">No script files yet. Add one to write your own Ren'Py code.</p>}
        <ul className="script-items">
          {files.map((f) => (
            <li key={f.id} className={`script-item ${current?.kind === 'script' && current.id === f.id ? 'active' : ''}`}>
              {renaming === f.id ? (
                <RenameBox id={f.id} name={f.name} onDone={() => setRenaming(null)} onError={setError} />
              ) : (
                <>
                  <button type="button" className="script-name" onClick={() => setSelection({ kind: 'script', id: f.id })} title={`Edit ${scriptFilePath(f.name)}`}>
                    <FileCode size={15} />
                    <span>{scriptFilePath(f.name)}</span>
                  </button>
                  <IconButton label={`Rename ${f.name}`} onClick={() => setRenaming(f.id)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label={`Delete ${f.name}`} onClick={() => setDeleting(f.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                </>
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p className="script-error" role="alert">
            {error}
          </p>
        )}
        <hr className="script-divider" />
        <h3 className="panel-heading">Generated files</h3>
        <p className="muted-note">Written by Fabula from your scenes. For reference only: change them by editing the story.</p>
        <ul className="script-items">
          {generated.map((g) => (
            <li key={g.path} className={`script-item ${current?.kind === 'generated' && current.path === g.path ? 'active' : ''}`}>
              <button type="button" className="script-name" onClick={() => setSelection({ kind: 'generated', path: g.path })} title={`View ${g.path} (read-only)`}>
                <FileCode size={15} />
                <span>{g.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="script-editor" aria-label="Editor">
        <p className="script-note">{SCRIPT_FILES_NOTE}</p>
        {selectedFile ? (
          <>
            <div className="script-editor-head">{scriptFilePath(selectedFile.name)}</div>
            <LineNumberEditor
              key={selectedFile.id}
              aria-label={`Contents of ${scriptFilePath(selectedFile.name)}`}
              value={selectedFile.content}
              onCommit={(content) => useProjectStore.getState().updateScriptFile(selectedFile.id, content)}
            />
          </>
        ) : selectedGenerated ? (
          <>
            <div className="script-editor-head">{selectedGenerated.path} (generated, read-only)</div>
            <LineNumberEditor key={selectedGenerated.path} readOnly aria-label={`Contents of ${selectedGenerated.path}`} value={selectedGenerated.content} />
          </>
        ) : (
          <EmptyState icon={<FileCode size={20} />} title="Script files">
            Add a file with + File, then write Ren'Py code in it.
          </EmptyState>
        )}
      </section>
      {deleteTarget && (
        <Modal
          title="Delete this file?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  useProjectStore.getState().deleteScriptFile(deleteTarget.id)
                  setDeleting(null)
                  setError(null)
                }}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="modal-text">
            “{scriptFilePath(deleteTarget.name)}” will be removed from the story and from the game on the next export. You can undo this with Ctrl+Z.
          </p>
        </Modal>
      )}
    </div>
  )
}
